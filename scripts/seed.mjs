/**
 * Crea los datos base del sistema:
 * roles, programas, ficha, categorías, ambientes y usuario administrador.
 *
 * Uso:  npm run seed
 * Requiere .env.local con DATABASE_URL.
 */
import { existsSync, readFileSync } from 'node:fs';
import pg from 'pg';
import bcrypt from 'bcryptjs';

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
  console.error('\n❌ Falta configurar la base de datos.');
  console.error('   Copia .env.example a .env.local y completa DATABASE_URL.\n');
  process.exit(1);
}

const esLocal = /(^|@)(localhost|127\.0\.0\.1|\[::1\])[:/]/.test(url);
const ssl =
  process.env.PGSSL === 'disable'
    ? false
    : process.env.PGSSL === 'require' || !esLocal
    ? { rejectUnauthorized: false }
    : false;

const pool = new pg.Pool({ connectionString: url, ssl, max: 2 });

async function uno(texto, params = []) {
  const res = await pool.query(texto, params);
  return res.rows[0] ?? null;
}

const ROLES = [
  {
    nombre: 'administrador',
    descripcion: 'Acceso total: inventario, ambientes, sesiones, usuarios, importación y configuración',
    permisos: {
      admin: true,
      inventario_ver: true,
      inventario_editar: true,
      ambientes_ver: true,
      ambientes_editar: true,
      fichas_ver: true,
      fichas_editar: true,
      sesiones: true,
      verificar: true,
      etiquetas: true,
      importar: true,
      usuarios: true,
      config: true,
    },
  },
  {
    nombre: 'vigilancia',
    descripcion: 'Portería: registra la entrada y la salida de los instructores en los ambientes',
    permisos: {
      admin: false,
      inventario_ver: false,
      inventario_editar: false,
      ambientes_ver: true,
      ambientes_editar: false,
      fichas_ver: true,
      fichas_editar: false,
      sesiones: true,
      verificar: false,
      etiquetas: false,
      importar: false,
      usuarios: false,
      config: false,
    },
  },
  {
    nombre: 'instructor',
    descripcion:
      'Registra su entrada y salida, y diligencia el inventario diario con los 2 aprendices de turno',
    permisos: {
      admin: false,
      inventario_ver: true,
      inventario_editar: false,
      ambientes_ver: true,
      ambientes_editar: false,
      fichas_ver: true,
      fichas_editar: false,
      sesiones: true,
      verificar: true,
      etiquetas: false,
      importar: false,
      usuarios: false,
      config: false,
    },
  },
];

const PROGRAMAS = [
  { codigo: '228106', nombre: 'Análisis y Desarrollo de Software', nivel: 'tecnologo' },
  { codigo: '233103', nombre: 'Técnico en Sistemas', nivel: 'tecnico' },
  { codigo: '233104', nombre: 'Técnico en Agropecuaria', nivel: 'tecnico' },
];

const CATEGORIAS = [
  'Equipos de cómputo',
  'Mobiliario',
  'Herramientas',
  'Insumos',
  'Redes y comunicaciones',
  'Audiovisuales',
  'Papelería',
  'Aseo',
];

const AMBIENTES = [
  { codigo: '101', nombre: 'Aula 101', tipo: 'aula', bloque: 'A', piso: 1 },
  { codigo: '102', nombre: 'Aula 102', tipo: 'aula', bloque: 'A', piso: 1 },
  { codigo: '103', nombre: 'Aula 103', tipo: 'aula', bloque: 'A', piso: 1 },
  { codigo: '104', nombre: 'Laboratorio de redes', tipo: 'laboratorio', bloque: 'A', piso: 1 },
  { codigo: '201', nombre: 'Aula 201', tipo: 'aula', bloque: 'B', piso: 2 },
  { codigo: '202', nombre: 'Aula 202', tipo: 'aula', bloque: 'B', piso: 2 },
  { codigo: '203', nombre: 'Aula de sistemas 203', tipo: 'laboratorio', bloque: 'B', piso: 2 },
  { codigo: '204', nombre: 'Aula 204', tipo: 'aula', bloque: 'B', piso: 2 },
  { codigo: '206', nombre: 'Taller 206', tipo: 'taller', bloque: 'B', piso: 2 },
  { codigo: '207', nombre: 'Taller 207', tipo: 'taller', bloque: 'B', piso: 2 },
  { codigo: '209', nombre: 'Aula 209', tipo: 'aula', bloque: 'B', piso: 2 },
  { codigo: 'ALM', nombre: 'Almacén general', tipo: 'almacen', bloque: 'C', piso: 1 },
];

async function main() {
  const u = new URL(url);
  console.log(`\n▶ Conectando a ${u.host}${u.pathname}\n`);

  for (const rol of ROLES) {
    await pool.query(
      `insert into rol (nombre, descripcion, permisos)
       values ($1, $2, $3::jsonb)
       on conflict (nombre) do update
         set descripcion = excluded.descripcion,
             permisos = excluded.permisos`,
      [rol.nombre, rol.descripcion, JSON.stringify(rol.permisos)]
    );
  }

  // El sistema tiene exactamente 3 roles. Se eliminan los roles viejos que
  // ya no se usan (por ejemplo "almacenista") solo si no tienen usuarios.
  const nombresRoles = ROLES.map((r) => r.nombre);
  const marcas = nombresRoles.map((_, i) => `$${i + 1}`).join(', ');
  const borrados = await pool.query(
    `delete from rol
      where nombre not in (${marcas})
        and not exists (select 1 from usuario u where u.rol_id = rol.id)`,
    nombresRoles
  );
  console.log(`✓ ${ROLES.length} roles${borrados.rowCount ? ` (${borrados.rowCount} rol(es) viejo(s) eliminado(s))` : ''}`);

  for (const p of PROGRAMAS) {
    await pool.query(
      `insert into programa (codigo, nombre, nivel)
       values ($1, $2, $3)
       on conflict (codigo) do update
         set nombre = excluded.nombre,
             nivel = excluded.nivel`,
      [p.codigo, p.nombre, p.nivel]
    );
  }
  console.log(`✓ ${PROGRAMAS.length} programas`);

  const adso = await uno('select id from programa where codigo = $1', ['228106']);

  await pool.query(
    `insert into ficha (codigo, programa_id, jornada, activa)
     values ($1, $2, 'mañana', true)
     on conflict (codigo) do update
       set programa_id = excluded.programa_id,
           jornada = excluded.jornada,
           activa = true`,
    ['3535013', adso?.id ?? null]
  );
  console.log('✓ ficha 3535013 (ADSO, mañana)');

  for (const nombre of CATEGORIAS) {
    await pool.query(
      `insert into categoria (nombre) values ($1)
       on conflict (nombre) do nothing`,
      [nombre]
    );
  }
  console.log(`✓ ${CATEGORIAS.length} categorías`);

  for (const a of AMBIENTES) {
    await pool.query(
      `insert into ambiente (codigo, nombre, tipo, bloque, piso, codigo_qr)
       values ($1, $2, $3, $4, $5, $6)
       on conflict (codigo) do update
         set nombre = excluded.nombre,
             tipo = excluded.tipo,
             bloque = excluded.bloque,
             piso = excluded.piso,
             codigo_qr = excluded.codigo_qr`,
      [a.codigo, a.nombre, a.tipo, a.bloque, a.piso, `SENA-AMB:${a.codigo}`]
    );
  }
  console.log(`✓ ${AMBIENTES.length} ambientes`);

  const CONFIG = [
    {
      clave: 'centro',
      valor: 'CENTRO DE GESTIÓN AGROEMPRESARIAL DEL ORIENTE - VÉLEZ',
      descripcion: 'Nombre oficial del centro de formación',
    },
    {
      clave: 'sistema',
      valor: 'Control de Ambientes de Formación',
      descripcion: 'Nombre del sistema',
    },
  ];

  for (const c of CONFIG) {
    await pool.query(
      `insert into configuracion (clave, valor, descripcion)
       values ($1, $2, $3)
       on conflict (clave) do update
         set valor = excluded.valor,
             descripcion = excluded.descripcion`,
      [c.clave, c.valor, c.descripcion]
    );
  }
  console.log('✓ configuración del centro');

  // Usuario administrador
  const username = (process.env.ADMIN_USER || 'admin').toLowerCase();
  const pin = process.env.ADMIN_PIN || '1234';
  const nombreCompleto = process.env.ADMIN_NOMBRE || 'Administrador SENA';

  const rolAdmin = await uno('select id from rol where nombre = $1', ['administrador']);
  if (!rolAdmin) throw new Error('No se encontró el rol administrador');

  const existente = await uno('select id, username from usuario where username = $1', [username]);

  if (existente && process.env.RESET_PIN !== '1') {
    console.log(`• El usuario "${username}" ya existe (no se cambió el PIN).`);
    console.log('  Para restablecerlo: RESET_PIN=1 npm run seed');
  } else {
    const partes = nombreCompleto.split(' ');
    const nombres = partes[0];
    const apellidos = partes.slice(1).join(' ') || 'SENA';

    const pinHash = await bcrypt.hash(pin, 10);

    if (existente) {
      await pool.query(
        'update usuario set pin_hash = $2, rol_id = $3, activo = true where id = $1',
        [existente.id, pinHash, rolAdmin.id]
      );
      console.log(`✓ PIN de "${username}" restablecido`);
    } else {
      const persona = await uno(
        `insert into persona (nombres, apellidos, tipo_persona)
         values ($1, $2, 'funcionario') returning id`,
        [nombres, apellidos]
      );

      await pool.query(
        `insert into usuario (persona_id, username, pin_hash, rol_id)
         values ($1, $2, $3, $4)`,
        [persona.id, username, pinHash, rolAdmin.id]
      );
      console.log(`✓ usuario "${username}" creado con rol administrador`);
    }
  }

  console.log('\n──────────────────────────────────────────────');
  console.log('  Listo. Ingresa con:');
  console.log(`  usuario: ${username}`);
  console.log(`  PIN:     ${process.env.RESET_PIN === '1' || !existente ? pin : '(el que ya tenías)'}`);
  console.log('──────────────────────────────────────────────');
  console.log('  ⚠ Cambia el PIN después del primer ingreso.');
  console.log('  ⚠ Las firmas se guardan dentro de la base (columna firma_url).');
  console.log('──────────────────────────────────────────────\n');
}

main()
  .catch((e) => {
    console.error('\n❌ Error:', e.message || e);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
