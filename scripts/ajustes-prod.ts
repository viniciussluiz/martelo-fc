/**
 * Traz para o repositório os ajustes do baralho feitos na página de admin em produção.
 *
 * Lê o banco de produção pelo `fly ssh console` (só leitura, nada muda lá) e mostra o que foi editado:
 *   npm run ajustes:prod                # só mostra
 *   npm run ajustes:prod -- --gravar    # grava em data/deck-ajustes.json e data/deck-wikidata.json
 *
 * Para onde vai cada ajuste:
 * - nível e Lenda de uma carta do arquivo → "nivel" do deck-ajustes.json, com a faixa e a Lenda escolhidas;
 * - carta com nome, posição, clube ou ano editados → "incluir", a carta inteira com o mesmo id;
 * - jogador criado no admin → "incluir".
 * O data/deck-wikidata.json é corrigido na hora, sem refazer o baralho. O deck-ajustes.json garante que
 * os ajustes continuam valendo quando o baralho for refeito (npm run deck:wikidata).
 * Ficam só no banco de prod: cartas de seleção (sel-…) e ajustes de cartas que não estão mais no arquivo.
 *
 * Opções: --app <app do Fly> (padrão: o do fly.toml) · --banco <arquivo .db> (lê um banco local em vez do de prod)
 */
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { parseArgs } from 'node:util';

type Tier = 'lenda' | 'craque' | 'titular' | 'operario' | 'perna';
interface Card {
  id: string;
  name: string;
  position: string;
  club: string;
  year: number;
  levelMin: number;
  levelMax: number;
  tier: Tier;
  hint?: string;
  series?: string;
  kit?: [string, string];
  [k: string]: unknown;
}
interface OverrideRow {
  card_id: string;
  level_min: number;
  level_max: number;
  tier: Tier;
  info: string | null;
  updated_at: string;
}
interface CustomRow {
  id: string;
  card_json: string;
  created_at: string;
}
interface LevelEntry {
  id: string;
  jogador?: string;
  clube?: string;
  faixa: [number, number];
  tier?: Tier;
  motivo?: string;
}
interface Adjustments {
  nivel?: LevelEntry[];
  incluir?: Array<Card & { motivo?: string }>;
  [k: string]: unknown;
}

const TIER_LABEL: Record<Tier, string> = { lenda: 'Lenda', craque: 'Craque', titular: 'Titular', operario: 'Operário', perna: 'Perna de pau' };
const INFO_KEYS = ['name', 'position', 'club', 'year', 'hint', 'series', 'kit'] as const;

const root = resolve(import.meta.dirname, '..');
const { values } = parseArgs({
  options: {
    gravar: { type: 'boolean', default: false },
    app: { type: 'string' },
    banco: { type: 'string' },
  },
});

const INICIO = '@@AJUSTES@@';
const FIM = '@@FIM@@';

/** Código que roda onde o banco está (no servidor de prod ou aqui, com --banco): só lê e imprime em JSON. */
function readerCode(dbPath: string, sqliteModule: string): string {
  return `const D = require(${JSON.stringify(sqliteModule)});
const db = new D(${JSON.stringify(dbPath)}, { readonly: true, fileMustExist: true });
const has = (t) => !!db.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?").get(t);
const cols = has('card_overrides') ? db.prepare('PRAGMA table_info(card_overrides)').all().map((c) => c.name) : [];
const info = cols.includes('info') ? 'info' : 'NULL AS info';
const out = {
  overrides: has('card_overrides') ? db.prepare('SELECT card_id, level_min, level_max, tier, ' + info + ', updated_at FROM card_overrides').all() : [],
  custom: has('custom_cards') ? db.prepare('SELECT id, card_json, created_at FROM custom_cards ORDER BY created_at').all() : [],
};
process.stdout.write(${JSON.stringify(INICIO)} + JSON.stringify(out) + ${JSON.stringify(FIM)});
`;
}

function flyToml(): string {
  try {
    return readFileSync(resolve(root, 'fly.toml'), 'utf8');
  } catch {
    return '';
  }
}

function readDump(): { overrides: OverrideRow[]; custom: CustomRow[] } {
  let out: string;
  if (values.banco) {
    const code = readerCode(resolve(values.banco), resolve(root, 'node_modules/better-sqlite3'));
    out = execFileSync(process.execPath, ['-'], { input: code, encoding: 'utf8', maxBuffer: 256 * 1024 * 1024 });
  } else {
    const toml = flyToml();
    const app = values.app ?? toml.match(/^app\s*=\s*"([^"]+)"/m)?.[1];
    if (!app) throw new Error('Não achei o nome do app no fly.toml. Rode de novo com --app <nome>.');
    const dbPath = toml.match(/DATABASE_PATH\s*=\s*"([^"]+)"/)?.[1] ?? '/data/martelo.db';
    // O código vai em base64 para não brigar com as aspas do shell remoto.
    const b64 = Buffer.from(readerCode(dbPath, '/app/node_modules/better-sqlite3')).toString('base64');
    console.log(`Lendo o banco de produção (${app}, ${dbPath}, só leitura)…`);
    out = execFileSync('fly', ['ssh', 'console', '-a', app, '-C', `sh -c 'echo ${b64} | base64 -d | node -'`], {
      encoding: 'utf8',
      maxBuffer: 256 * 1024 * 1024,
      stdio: ['ignore', 'pipe', 'inherit'],
    });
  }
  const a = out.indexOf(INICIO);
  const b = out.lastIndexOf(FIM);
  if (a < 0 || b < a) throw new Error(`A resposta veio sem os ajustes:\n${out.slice(0, 2000)}`);
  return JSON.parse(out.slice(a + INICIO.length, b));
}

function parseInfo(raw: string | null): Partial<Card> | null {
  if (!raw) return null;
  try {
    return JSON.parse(raw) as Partial<Card>;
  } catch {
    return null;
  }
}

/** Mesma regra do admin: as informações trocam nome, posição, clube, ano e dica; grupo e cores só ficam se vierem junto. */
function withInfo(card: Card, info: Partial<Card>): Card {
  const next: Card = { ...card };
  delete next.series;
  delete next.kit;
  for (const k of INFO_KEYS) if (info[k] !== undefined) (next as Record<string, unknown>)[k] = info[k];
  return next;
}

function sameInfo(a: Partial<Card>, b: Partial<Card>): boolean {
  return (
    a.name === b.name &&
    a.position === b.position &&
    a.club === b.club &&
    a.year === b.year &&
    (a.hint ?? null) === (b.hint ?? null) &&
    (a.series ?? null) === (b.series ?? null) &&
    (a.kit?.join(',') ?? '') === (b.kit?.join(',') ?? '')
  );
}

const label = (c: Pick<Card, 'name' | 'club' | 'year'>) => `${c.name} (${c.club} ${c.year})`;
const level = (c: Pick<Card, 'levelMin' | 'levelMax' | 'tier'>) => `${TIER_LABEL[c.tier] ?? c.tier} ${c.levelMin}–${c.levelMax}`;

const deckPath = resolve(root, 'data/deck-wikidata.json');
const adjPath = resolve(root, 'data/deck-ajustes.json');
const deck = JSON.parse(readFileSync(deckPath, 'utf8')) as { cards: Card[] };
const adj = JSON.parse(readFileSync(adjPath, 'utf8')) as Adjustments;
const byId = new Map(deck.cards.map((c) => [c.id, c]));

const dump = readDump();
const overrides = new Map(dump.overrides.map((r) => [r.card_id, r]));
const today = new Date().toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' });
const motivo = `Ajuste feito na página de admin em produção (trazido para o repositório em ${today}).`;

const nivel: LevelEntry[] = [];
const incluir: Card[] = [];
const lines = { nivel: [] as string[], info: [] as string[], criados: [] as string[], iguais: [] as string[], soProd: [] as string[] };

// Jogadores criados no admin: a carta inteira, com o que foi ajustado depois.
const customIds = new Set<string>();
for (const row of dump.custom) {
  let card: Card;
  try {
    card = JSON.parse(row.card_json) as Card;
  } catch {
    lines.soProd.push(`${row.id}: jogador criado com dados ilegíveis no banco`);
    continue;
  }
  customIds.add(card.id);
  const o = overrides.get(card.id);
  if (o) {
    const info = parseInfo(o.info);
    card = { ...(info ? withInfo(card, info) : card), levelMin: o.level_min, levelMax: o.level_max, tier: o.tier };
  }
  const before = byId.get(card.id);
  if (before && JSON.stringify(before) === JSON.stringify(card)) {
    lines.iguais.push(label(card));
    continue;
  }
  incluir.push(card);
  lines.criados.push(`${label(card)} ${card.position}, ${level(card)}`);
}

// Ajustes em cartas do arquivo.
for (const o of dump.overrides) {
  if (customIds.has(o.card_id)) continue;
  if (o.card_id.startsWith('sel-')) {
    lines.soProd.push(`${o.card_id}: carta de seleção (o baralho de seleções não lê o deck-ajustes.json)`);
    continue;
  }
  const base = byId.get(o.card_id);
  if (!base) {
    lines.soProd.push(`${o.card_id}: a carta não está mais no data/deck-wikidata.json`);
    continue;
  }
  const info = parseInfo(o.info);
  if (info && !sameInfo(base, info)) {
    const card: Card = { ...withInfo(base, info), levelMin: o.level_min, levelMax: o.level_max, tier: o.tier };
    incluir.push(card);
    lines.info.push(`${label(base)} → ${label(card)} ${card.position}, ${level(card)}`);
    continue;
  }
  if (base.levelMin === o.level_min && base.levelMax === o.level_max && base.tier === o.tier) {
    lines.iguais.push(label(base));
    continue;
  }
  nivel.push({ id: base.id, jogador: base.name, clube: base.club, faixa: [o.level_min, o.level_max], tier: o.tier, motivo });
  lines.nivel.push(`${label(base)}: ${level(base)} → ${level({ levelMin: o.level_min, levelMax: o.level_max, tier: o.tier })}`);
}

const show = (title: string, items: string[]) => {
  if (!items.length) return;
  console.log(`\n${title} (${items.length}):`);
  for (const i of items) console.log(`  - ${i}`);
};
const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;
const fileEdits = dump.overrides.filter((o) => !customIds.has(o.card_id)).length;
console.log(`\nNo banco de produção: ${plural(fileEdits, 'carta ajustada', 'cartas ajustadas')} e ${plural(dump.custom.length, 'jogador criado', 'jogadores criados')}.`);
show('Nível ou Lenda', lines.nivel);
show('Informações editadas (nome, posição, clube ou ano)', lines.info);
show('Jogadores criados no admin', lines.criados);
show('Já iguais ao arquivo (nada a fazer)', lines.iguais);
show('Ficam só em prod', lines.soProd);

const changes = nivel.length + incluir.length;
if (!changes) {
  console.log('\nNada para trazer: o arquivo já tem tudo o que está em prod.');
} else if (!values.gravar) {
  console.log(`\nNada foi gravado. Para gravar: npm run ajustes:prod -- --gravar`);
} else {
  // deck-ajustes.json: as entradas novas substituem as antigas da mesma carta. As de "nivel" entram no
  // começo, porque vale a primeira que casa (e uma entrada antiga pode pegar o jogador inteiro pelo prefixo).
  const newIds = new Set([...nivel.map((n) => n.id), ...incluir.map((c) => c.id)]);
  adj.nivel = [...nivel, ...(adj.nivel ?? []).filter((n) => !newIds.has(n.id))];
  adj.incluir = [...(adj.incluir ?? []).filter((c) => !newIds.has(c.id)), ...incluir.map((c) => ({ ...c, motivo }))];
  writeFileSync(adjPath, JSON.stringify(adj, null, 2) + '\n');

  // deck-wikidata.json: corrigido na hora, cada carta no mesmo lugar (as novas vão para o fim).
  const leveled = new Map(nivel.map((n) => [n.id, n]));
  const replaced = new Map(incluir.map((c) => [c.id, c]));
  deck.cards = deck.cards.map((c) => {
    const r = replaced.get(c.id);
    if (r) {
      replaced.delete(c.id);
      return r;
    }
    const n = leveled.get(c.id);
    return n ? { ...c, levelMin: n.faixa[0], levelMax: n.faixa[1], tier: n.tier ?? c.tier } : c;
  });
  deck.cards.push(...replaced.values());
  writeFileSync(deckPath, JSON.stringify(deck, null, 1) + '\n');

  console.log(`\nGravado: ${nivel.length} em "nivel" e ${incluir.length} em "incluir" do data/deck-ajustes.json, e o data/deck-wikidata.json já está corrigido.`);
  console.log('Confira com git diff antes do commit.');
}
