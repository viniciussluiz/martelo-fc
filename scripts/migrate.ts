/** Aplica as migrações pendentes no banco configurado (DATABASE_PATH). */
import { loadConfig } from '../src/server/config.js';
import { migrate, openDatabase } from '../src/server/db.js';

const config = loadConfig();
const db = openDatabase(config.dbPath);
const applied = migrate(db);
console.log(applied.length ? `Migrações aplicadas: ${applied.join(', ')}` : 'Banco já está atualizado.', `(${config.dbPath})`);
db.close();
