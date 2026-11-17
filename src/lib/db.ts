import { Pool, types } from 'pg';

/**
 * Capa de acceso a PostgreSQL (Neon).
 * Solo se importa desde el servidor: nunca desde un componente cliente.
 */

// pg convierte las columnas DATE a un Date en la zona del servidor; eso puede
// correr un día al mostrarlas en America/Bogota. Las dejamos como texto ISO.
types.setTypeParser(1082, (v) => v);

let pool: Pool | null = null;

function usarSSL(url: string): boolean | { rejectUnauthorized: boolean } {
  if (process.env.PGSSL === 'disable') return false;
  if (process.env.PGSSL === 'require') return { rejectUnauthorized: false };
  // Neon y la mayoría de Postgres en la nube exigen SSL; local no.
  return /(^|@)(localhost|127\.0\.0\.1|\[::1\])[:/]/.test(url)
    ? false
    : { rejectUnauthorized: false };
}

export function db(): Pool {
  if (pool) return pool;

  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error(
      'Falta configurar la base de datos. Copia .env.example a .env.local y completa DATABASE_URL.'
    );
  }

  pool = new Pool({
    connectionString: url,
    ssl: usarSSL(url),
    max: Number(process.env.PGPOOL_MAX || 5),
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 15_000,
  });

  pool.on('error', (err) => {
    console.error('Error inesperado en el pool de PostgreSQL:', err.message);
  });

  return pool;
}

export function dbConfigurada(): boolean {
  return Boolean(process.env.DATABASE_URL);
}

/** Ejecuta una consulta y devuelve las filas. */
export async function q<T = any>(sql: string, params: any[] = []): Promise<T[]> {
  const res = await db().query(sql, params);
  return res.rows as T[];
}

/** Ejecuta una consulta y devuelve la primera fila o null. */
export async function uno<T = any>(sql: string, params: any[] = []): Promise<T | null> {
  const filas = await q<T>(sql, params);
  return filas[0] ?? null;
}

/** Ejecuta una sentencia de escritura y devuelve el número de filas afectadas. */
export async function ejecutar(sql: string, params: any[] = []): Promise<number> {
  const res = await db().query(sql, params);
  return res.rowCount ?? 0;
}

function citar(nombre: string): string {
  return `"${nombre.replace(/"/g, '""')}"`;
}

/**
 * Inserta varias filas en una sola sentencia.
 * Todas las filas deben traer las mismas columnas.
 */
export async function insertarLote<T = any>(
  tabla: string,
  filas: Record<string, any>[]
): Promise<T[]> {
  if (!filas.length) return [];

  const columnas = Object.keys(filas[0]);
  const valores: any[] = [];
  const grupos: string[] = [];

  filas.forEach((fila, i) => {
    const marcas = columnas.map((_, j) => `$${i * columnas.length + j + 1}`);
    grupos.push(`(${marcas.join(', ')})`);
    for (const col of columnas) valores.push(fila[col] ?? null);
  });

  const sql = `insert into ${citar(tabla)} (${columnas
    .map(citar)
    .join(', ')}) values ${grupos.join(', ')} returning *`;

  return q<T>(sql, valores);
}

export function mensajeError(e: unknown): string {
  if (!e) return 'Error desconocido';
  if (e instanceof Error) return e.message;
  if (typeof e === 'string') return e;
  const any = e as any;
  return any.message || any.details || any.hint || JSON.stringify(e);
}
