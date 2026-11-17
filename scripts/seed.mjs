/**
 * Crea los datos base del sistema:
 * roles, programas, ficha, categorías, ambientes y usuario administrador.
 *
 * Uso:  npm run seed
 * Requiere .env.local con NEXT_PUBLIC_SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY.
 */
import { existsSync, readFileSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';
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

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !key) {
  console.error('\n❌ Falta configurar Supabase.');
  console.error('   Copia .env.example a .env.local y completa:');
  console.error('   - NEXT_PUBLIC_SUPABASE_URL');
  console.error('   - SUPABASE_SERVICE_ROLE_KEY\n');
  process.exit(1);
}

const sb = createClient(url, key, { auth: { persistSession: false } });

const ROLES = [
  {
    nombre: 'administrador',
    descripcion: 'Acceso total: inventario, ambientes, sesiones, importación y usuarios',
    permisos: { admin: true, inventario: true, ambientes: true, sesiones: true, importar: true },
  },
  {
    nombre: 'almacenista',
    descripcion: 'Gestiona inventario y consulta sesiones',
    permisos: { admin: false, inventario: true, ambientes: true, sesiones: true, importar: false },
  },
  {
    nombre: 'instructor',
    descripcion: 'Registra entrada y salida en los ambientes',
    permisos: { admin: false, inventario: false, ambientes: false, sesiones: true, importar: false },
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
  console.log(`\n▶ Conectando a ${url}\n`);

  // Roles
  const { error: errRoles } = await sb.from('rol').upsert(ROLES, { onConflict: 'nombre' });
  if (errRoles) throw new Error(`Roles: ${errRoles.message}`);
  console.log(`✓ ${ROLES.length} roles`);

  // Programas
  const { error: errProg } = await sb.from('programa').upsert(PROGRAMAS, { onConflict: 'codigo' });
  if (errProg) throw new Error(`Programas: ${errProg.message}`);
  console.log(`✓ ${PROGRAMAS.length} programas`);

  // Ficha de ejemplo
  const { data: adso, error: errAdso } = await sb
    .from('programa')
    .select('id')
    .eq('codigo', '228106')
    .single();
  if (errAdso) throw new Error(`Programa ADSO: ${errAdso.message}`);

  const { error: errFicha } = await sb.from('ficha').upsert(
    [
      {
        codigo: '3535013',
        programa_id: adso.id,
        jornada: 'mañana',
        activa: true,
      },
    ],
    { onConflict: 'codigo' }
  );
  if (errFicha) throw new Error(`Ficha: ${errFicha.message}`);
  console.log('✓ ficha 3535013 (ADSO, mañana)');

  // Categorías
  const { error: errCat } = await sb
    .from('categoria')
    .upsert(
      CATEGORIAS.map((nombre) => ({ nombre })),
      { onConflict: 'nombre' }
    );
  if (errCat) throw new Error(`Categorías: ${errCat.message}`);
  console.log(`✓ ${CATEGORIAS.length} categorías`);

  // Ambientes
  const { error: errAmb } = await sb.from('ambiente').upsert(
    AMBIENTES.map((a) => ({ ...a, codigo_qr: `SENA-AMB:${a.codigo}` })),
    { onConflict: 'codigo' }
  );
  if (errAmb) throw new Error(`Ambientes: ${errAmb.message}`);
  console.log(`✓ ${AMBIENTES.length} ambientes`);

  // Configuración
  const { error: errCfg } = await sb.from('configuracion').upsert(
    [
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
    ],
    { onConflict: 'clave' }
  );
  if (errCfg) throw new Error(`Configuración: ${errCfg.message}`);
  console.log('✓ configuración del centro');

  // Usuario administrador
  const username = (process.env.ADMIN_USER || 'admin').toLowerCase();
  const pin = process.env.ADMIN_PIN || '1234';
  const nombreCompleto = process.env.ADMIN_NOMBRE || 'Administrador SENA';

  const { data: rolAdmin, error: errRolAdmin } = await sb
    .from('rol')
    .select('id')
    .eq('nombre', 'administrador')
    .single();
  if (errRolAdmin) throw new Error(`Rol administrador: ${errRolAdmin.message}`);

  const { data: existente } = await sb
    .from('usuario')
    .select('id, username')
    .eq('username', username)
    .maybeSingle();

  if (existente && process.env.RESET_PIN !== '1') {
    console.log(`• El usuario "${username}" ya existe (no se cambió el PIN).`);
    console.log('  Para restablecerlo: RESET_PIN=1 npm run seed');
  } else {
    const partes = nombreCompleto.split(' ');
    const nombres = partes[0];
    const apellidos = partes.slice(1).join(' ') || 'SENA';

    const { data: persona, error: errPersona } = await sb
      .from('persona')
      .insert({ nombres, apellidos, tipo_persona: 'funcionario' })
      .select('id')
      .single();
    if (errPersona) throw new Error(`Persona: ${errPersona.message}`);

    const pinHash = await bcrypt.hash(pin, 10);

    if (existente) {
      const { error: errUpd } = await sb
        .from('usuario')
        .update({ pin_hash: pinHash, rol_id: rolAdmin.id, activo: true })
        .eq('id', existente.id);
      if (errUpd) throw new Error(`Usuario: ${errUpd.message}`);
      console.log(`✓ PIN de "${username}" restablecido`);
    } else {
      const { error: errUser } = await sb.from('usuario').insert({
        persona_id: persona.id,
        username,
        pin_hash: pinHash,
        rol_id: rolAdmin.id,
      });
      if (errUser) throw new Error(`Usuario: ${errUser.message}`);
      console.log(`✓ usuario "${username}" creado con rol administrador`);
    }
  }

  console.log('\n──────────────────────────────────────────────');
  console.log('  Listo. Ingresa con:');
  console.log(`  usuario: ${username}`);
  console.log(`  PIN:     ${process.env.RESET_PIN === '1' || !existente ? pin : '(el que ya tenías)'}`);
  console.log('──────────────────────────────────────────────');
  console.log('  ⚠ Cambia el PIN después del primer ingreso.');
  console.log('  ⚠ Crea el bucket "firmas" en Supabase Storage (público)');
  console.log('    para guardar las firmas como archivo.');
  console.log('──────────────────────────────────────────────\n');
}

main().catch((e) => {
  console.error('\n❌ Error:', e.message || e);
  process.exit(1);
});
