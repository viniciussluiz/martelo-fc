/**
 * Roda antes do `npm start`: garante que o site compilado (dist/) corresponde ao código.
 * - dist/ ausente ou mais antigo que src/web e src/shared → compila com o Vite;
 * - sem o Vite instalado (instalação enxuta, `npm install --omit=dev`) usa o dist/ que já vem no zip.
 */
import { existsSync, readdirSync, statSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { join, resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const built = join(root, 'dist', 'index.html');

function newest(dir) {
  let t = 0;
  if (!existsSync(dir)) return t;
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    t = Math.max(t, e.isDirectory() ? newest(p) : statSync(p).mtimeMs);
  }
  return t;
}

const sources = Math.max(newest(join(root, 'src', 'web')), newest(join(root, 'src', 'shared')), statSync(join(root, 'vite.config.ts')).mtimeMs);
const upToDate = existsSync(built) && statSync(built).mtimeMs >= sources;
const hasVite = existsSync(join(root, 'node_modules', 'vite'));

if (upToDate) process.exit(0);
if (!hasVite) {
  if (existsSync(built)) {
    console.log('Usando o site já compilado (dist/). Para recompilar, instale tudo com `npm install`.');
    process.exit(0);
  }
  console.error('Falta o site compilado (dist/) e o Vite não está instalado. Rode `npm install` (completo) e depois `npm start`.');
  process.exit(1);
}
const r = spawnSync(process.execPath, [join(root, 'node_modules', 'vite', 'bin', 'vite.js'), 'build', '--config', 'vite.config.ts', '--logLevel', 'warn'], {
  cwd: root,
  stdio: 'inherit',
});
process.exit(r.status ?? 1);
