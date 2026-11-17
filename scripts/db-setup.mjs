/**
 * Crea las tablas del sistema en la base de datos configurada en DATABASE_URL.
 * Es idempotente: se puede ejecutar varias veces.
 *
 * Uso:  npm run db:setup
 */
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import pg from 'pg';

function cargarEnv(archivo) {
  if (!existsSync(archivo)) return;
  for (const linea of readFileSync(archivo, 'utf8').split(/\r?\n/)) {
    const m = linea.match(/^\s*([A-Za-z0-9_]+)\s*=\s*(.*)\s*$/);
    if (!m) continue;
    let valor = m[2].trim();
    if (
      (valor.startsWith('"') && valor.endsWith('"')) ||
      (valor.startsWith("'") && valor.endsWith("'"))
    ) {
      valor = valor.slice(1, -1);
    }
    if (!(m[1] in process.env)) process.env[m[1]] = valor;
  }
}

cargarEnv('.env.local');
cargarEnv('.env');

const url = process.env.DATABASE_URL;
if (!url) {
  console.error('\n❌ Falta DATABASE_URL en .env.local');
  console.error('   Copia .env.example a .env.local y pega la cadena de conexión de Neon.\n');
  process.exit(1);
}

const esLocal = /(^|@)(localhost|127\.0\.0\.1|\[::1\])[:/]/.test(url);
const ssl =
  process.env.PGSSL === 'disable'
    ? false
    : process.env.PGSSL === 'require' || !esLocal
    ? { rejectUnauthorized: false }
    : false;

const aqui = dirname(fileURLToPath(import.meta.url));
const sql = readFileSync(join(aqui, '..', 'db', 'schema.sql'), 'utf8');

const pool = new pg.Pool({ connectionString: url, ssl, max: 1 });

try {
  const u = new URL(url);
  console.log(`\n▶ Aplicando esquema en ${u.host}${u.pathname}\n`);
  await pool.query(sql);
  console.log('✓ Esquema aplicado correctamente');
  console.log('  Ahora ejecuta: npm run seed\n');
} catch (e) {
  console.error('\n❌ Error aplicando el esquema:', e.message);
  process.exitCode = 1;
} finally {
  await pool.end();
}
