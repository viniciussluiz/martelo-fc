import { createHash, randomBytes, randomUUID, scryptSync, timingSafeEqual } from 'node:crypto';
import { CrestError, defaultUserCrest, parseCrest, readCrest, type CrestConfig } from '../shared/crest.js';
import { nowIso, type DB } from './db.js';

/**
 * Contas e sessões.
 * - Convidado: entra só com o nome do time (como no original, não precisa cadastro).
 * - Conta registrada: usuário + senha (scrypt). Um convidado pode “virar conta” sem perder histórico.
 * O token de sessão é aleatório; no banco guardamos apenas o hash SHA-256.
 */

export interface PublicUser {
  id: string;
  displayName: string;
  username: string | null;
  isGuest: boolean;
  createdAt: string;
  /** Escudo do time (montado no criador ou gerado a partir do id). */
  crest: CrestConfig;
}

export class AuthError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

interface UserRow {
  id: string;
  username: string | null;
  display_name: string;
  password_hash: string | null;
  is_guest: number;
  created_at: string;
  crest_json: string | null;
}

const toPublic = (r: UserRow): PublicUser => ({
  id: r.id,
  displayName: r.display_name,
  username: r.username,
  isGuest: !!r.is_guest,
  createdAt: r.created_at,
  crest: readCrest(r.crest_json, () => defaultUserCrest(r.id, r.display_name)),
});

/** Valida o escudo vindo do cliente (ou nulo: fica o gerado). */
export function cleanCrest(raw: unknown): CrestConfig | null {
  if (raw === undefined || raw === null) return null;
  try {
    return parseCrest(raw);
  } catch (err) {
    if (err instanceof CrestError) throw new AuthError(400, 'escudo_invalido', err.message);
    throw err;
  }
}

export function hashPassword(password: string): string {
  const salt = randomBytes(16);
  const hash = scryptSync(password, salt, 64, { N: 16384, r: 8, p: 1 });
  return `scrypt$${salt.toString('base64')}$${hash.toString('base64')}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  const [scheme, saltB64, hashB64] = stored.split('$');
  if (scheme !== 'scrypt' || !saltB64 || !hashB64) return false;
  const expected = Buffer.from(hashB64, 'base64');
  const actual = scryptSync(password, Buffer.from(saltB64, 'base64'), expected.length, { N: 16384, r: 8, p: 1 });
  return timingSafeEqual(expected, actual);
}

const sha256 = (s: string) => createHash('sha256').update(s).digest('hex');

export function cleanDisplayName(raw: unknown): string {
  const name = String(raw ?? '')
    .replace(/[\u0000-\u001f\u007f<>]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  if (name.length < 2 || name.length > 28) throw new AuthError(400, 'nome_invalido', 'O nome do time deve ter entre 2 e 28 caracteres.');
  return name;
}

function cleanUsername(raw: unknown): string {
  const u = String(raw ?? '').trim();
  if (!/^[a-zA-Z0-9_.-]{3,24}$/.test(u)) {
    throw new AuthError(400, 'usuario_invalido', 'Usuário: 3 a 24 caracteres (letras, números, _ . -).');
  }
  return u;
}

function cleanPassword(raw: unknown): string {
  const p = String(raw ?? '');
  if (p.length < 6 || p.length > 128) throw new AuthError(400, 'senha_invalida', 'A senha precisa ter pelo menos 6 caracteres.');
  return p;
}

export class AuthService {
  constructor(
    private db: DB,
    private ttlDays = 60,
  ) {}

  private createSession(userId: string): string {
    const token = randomBytes(32).toString('base64url');
    const now = nowIso();
    this.db.prepare('INSERT INTO sessions (token_hash, user_id, created_at, last_seen_at) VALUES (?, ?, ?, ?)').run(sha256(token), userId, now, now);
    return token;
  }

  createGuest(displayName: unknown, crest?: unknown): { token: string; user: PublicUser } {
    const name = cleanDisplayName(displayName);
    const recipe = cleanCrest(crest);
    const id = randomUUID();
    this.db
      .prepare('INSERT INTO users (id, display_name, is_guest, created_at, crest_json) VALUES (?, ?, 1, ?, ?)')
      .run(id, name, nowIso(), recipe ? JSON.stringify(recipe) : null);
    return { token: this.createSession(id), user: this.getUser(id)! };
  }

  register(input: { username: unknown; password: unknown; displayName: unknown; crest?: unknown }): { token: string; user: PublicUser } {
    const username = cleanUsername(input.username);
    const password = cleanPassword(input.password);
    const name = cleanDisplayName(input.displayName);
    const recipe = cleanCrest(input.crest);
    const exists = this.db.prepare('SELECT 1 FROM users WHERE username = ?').get(username);
    if (exists) throw new AuthError(409, 'usuario_existe', 'Esse usuário já existe.');
    const id = randomUUID();
    this.db
      .prepare('INSERT INTO users (id, username, display_name, password_hash, is_guest, created_at, crest_json) VALUES (?, ?, ?, ?, 0, ?, ?)')
      .run(id, username, name, hashPassword(password), nowIso(), recipe ? JSON.stringify(recipe) : null);
    return { token: this.createSession(id), user: this.getUser(id)! };
  }

  /** Transforma o convidado atual em conta, preservando id (e portanto todo o histórico). */
  upgradeGuest(userId: string, input: { username: unknown; password: unknown }): PublicUser {
    const username = cleanUsername(input.username);
    const password = cleanPassword(input.password);
    const user = this.db.prepare('SELECT * FROM users WHERE id = ?').get(userId) as UserRow | undefined;
    if (!user) throw new AuthError(404, 'usuario_inexistente', 'Usuário não encontrado.');
    if (!user.is_guest) throw new AuthError(400, 'ja_registrado', 'Esta conta já está registrada.');
    if (this.db.prepare('SELECT 1 FROM users WHERE username = ?').get(username)) {
      throw new AuthError(409, 'usuario_existe', 'Esse usuário já existe.');
    }
    this.db.prepare('UPDATE users SET username = ?, password_hash = ?, is_guest = 0 WHERE id = ?').run(username, hashPassword(password), userId);
    return this.getUser(userId)!;
  }

  login(input: { username: unknown; password: unknown }): { token: string; user: PublicUser } {
    const username = String(input.username ?? '').trim();
    const password = String(input.password ?? '');
    const row = this.db.prepare('SELECT * FROM users WHERE username = ?').get(username) as UserRow | undefined;
    // Mesmo custo de CPU com ou sem usuário, para não vazar quem existe.
    const ok = row?.password_hash ? verifyPassword(password, row.password_hash) : (verifyPassword(password, hashPassword('x')), false);
    if (!row || !ok) throw new AuthError(401, 'credenciais', 'Usuário ou senha incorretos.');
    return { token: this.createSession(row.id), user: toPublic(row) };
  }

  logout(token: string) {
    this.db.prepare('DELETE FROM sessions WHERE token_hash = ?').run(sha256(token));
  }

  rename(userId: string, displayName: unknown): PublicUser {
    const name = cleanDisplayName(displayName);
    this.db.prepare('UPDATE users SET display_name = ? WHERE id = ?').run(name, userId);
    return this.getUser(userId)!;
  }

  /** Salva o escudo do time do técnico (vale em todas as salas, perfil e histórico). */
  setCrest(userId: string, raw: unknown): PublicUser {
    const recipe = cleanCrest(raw);
    if (!recipe) throw new AuthError(400, 'escudo_invalido', 'Monte o escudo antes de salvar.');
    const res = this.db.prepare('UPDATE users SET crest_json = ? WHERE id = ?').run(JSON.stringify(recipe), userId);
    if (res.changes === 0) throw new AuthError(404, 'usuario_inexistente', 'Usuário não encontrado.');
    return this.getUser(userId)!;
  }

  /** Resolve o token em usuário (ou null) e renova o “visto por último”. */
  authenticate(token: string | undefined | null): PublicUser | null {
    if (!token || token.length > 200) return null;
    const hash = sha256(token);
    const row = this.db
      .prepare(
        `SELECT u.*, s.last_seen_at FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token_hash = ?`,
      )
      .get(hash) as (UserRow & { last_seen_at: string }) | undefined;
    if (!row) return null;
    const ageDays = (Date.now() - Date.parse(row.last_seen_at)) / 86_400_000;
    if (ageDays > this.ttlDays) {
      this.db.prepare('DELETE FROM sessions WHERE token_hash = ?').run(hash);
      return null;
    }
    if (ageDays > 0.01) this.db.prepare('UPDATE sessions SET last_seen_at = ? WHERE token_hash = ?').run(nowIso(), hash);
    return toPublic(row);
  }

  getUser(id: string): PublicUser | null {
    const row = this.db.prepare('SELECT * FROM users WHERE id = ?').get(id) as UserRow | undefined;
    return row ? toPublic(row) : null;
  }
}
