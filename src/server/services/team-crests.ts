import { defaultUserCrest, readCrest, type CrestConfig } from '../../shared/crest.js';
import type { DB } from '../db.js';

/**
 * Escudos dos times dos técnicos, por id de usuário. Quem nunca montou o seu ganha o escudo
 * gerado a partir do id da conta (o mesmo em todo lugar, até montar um no criador).
 */
export function userCrests(db: DB, ids: Iterable<string>): Map<string, CrestConfig> {
  const list = [...new Set(ids)].filter(Boolean);
  const out = new Map<string, CrestConfig>();
  for (let i = 0; i < list.length; i += 400) {
    const chunk = list.slice(i, i + 400);
    const rows = db
      .prepare(`SELECT id, display_name, crest_json FROM users WHERE id IN (${chunk.map(() => '?').join(',')})`)
      .all(...chunk) as Array<{ id: string; display_name: string; crest_json: string | null }>;
    for (const r of rows) out.set(r.id, readCrest(r.crest_json, () => defaultUserCrest(r.id, r.display_name)));
  }
  return out;
}
