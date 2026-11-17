'use server';

import { createHash } from 'crypto';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { db, mensajeError } from '@/lib/supabase';
import { requireAdmin } from '@/lib/auth';
import {
  normalizarFecha,
  normalizarHora,
  normalizarFicha,
  norm,
  parseTabla,
} from '@/lib/utils';

type Campo =
  | 'fecha'
  | 'ficha'
  | 'nombres'
  | 'programa'
  | 'ambiente'
  | 'entrada'
  | 'salida'
  | 'firma'
  | 'observaciones';

const ORDEN: Campo[] = [
  'fecha',
  'ficha',
  'nombres',
  'programa',
  'ambiente',
  'entrada',
  'salida',
  'firma',
  'observaciones',
];

// Zona horaria de Colombia (sin horario de verano).
const OFFSET = '-05:00';

function clasificar(encabezado: string): Campo | null {
  const s = norm(encabezado);
  if (!s) return null;
  if (s.includes('fecha')) return 'fecha';
  if (s.includes('ficha')) return 'ficha';
  if (s.includes('ambiente') || s.includes('aula') || s.includes('taller')) return 'ambiente';
  if (s.includes('programa')) return 'programa';
  if (s.includes('entrada')) return 'entrada';
  if (s.includes('salida')) return 'salida';
  if (s.includes('firma')) return 'firma';
  if (s.includes('observ') || s.includes('novedad')) return 'observaciones';
  if (s.includes('nombre') || s.includes('apellido') || s.includes('instructor')) return 'nombres';
  return null;
}

function escaparRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function buscarAmbiente(raw: string, ambientes: any[]): number | null {
  const s = norm(raw);
  if (!s) return null;

  const exacto = ambientes.find((a) => norm(a.codigo) === s || norm(a.nombre) === s);
  if (exacto) return exacto.id;

  const porCodigo = ambientes.find((a) =>
    new RegExp(`(^|\\D)${escaparRegex(String(a.codigo))}(\\D|$)`).test(String(raw))
  );
  return porCodigo ? porCodigo.id : null;
}

function buscarPrograma(raw: string, programas: any[]): number | null {
  const s = norm(raw);
  if (!s) return null;

  const exacto = programas.find((p) => norm(p.nombre) === s || norm(p.codigo) === s);
  if (exacto) return exacto.id;

  const palabras = s.split(' ').filter((p) => p.length >= 4);
  if (!palabras.length) return null;

  let mejor: { id: number; score: number } | null = null;
  for (const p of programas) {
    const nombre = norm(p.nombre);
    let score = 0;
    for (const w of palabras) if (nombre.includes(w)) score++;
    if (score > 0 && (!mejor || score > mejor.score)) mejor = { id: p.id, score };
  }
  return mejor ? mejor.id : null;
}

function buscarInstructor(raw: string, personas: any[]): string | null {
  const objetivo = norm(raw);
  if (!objetivo) return null;

  const exacto = personas.find(
    (p) => norm(`${p.nombres ?? ''} ${p.apellidos ?? ''}`) === objetivo
  );
  if (exacto) return exacto.id;

  const tokens = objetivo.split(' ').filter((t) => t.length >= 3);
  if (tokens.length < 2) return null;

  const parcial = personas.find((p) => {
    const nombre = norm(`${p.nombres ?? ''} ${p.apellidos ?? ''}`);
    return tokens.every((t) => nombre.includes(t));
  });
  return parcial ? parcial.id : null;
}

function partesNombre(nombre: string): { nombres: string; apellidos: string } {
  const partes = nombre.replace(/\s+/g, ' ').trim().split(' ');
  if (partes.length >= 3) {
    return { nombres: partes.slice(0, -2).join(' '), apellidos: partes.slice(-2).join(' ') };
  }
  return { nombres: partes[0] ?? nombre, apellidos: partes[1] ?? '' };
}

function hashFila(fila: any): string {
  return createHash('sha256')
    .update(
      [
        fila.folio ?? '',
        fila.fila ?? '',
        fila.fecha_raw ?? '',
        fila.ficha_raw ?? '',
        fila.nombres_raw ?? '',
        fila.hora_entrada_raw ?? '',
      ].join('|')
    )
    .digest('hex');
}

function fechaHora(fecha: string | null, hora: string | null): string | null {
  if (!fecha || !hora) return null;
  return `${fecha}T${hora}${OFFSET}`;
}

/* ------------------------------ Carga ------------------------------ */

export async function cargarPlanilla(formData: FormData): Promise<void> {
  await requireAdmin();

  const datos = String(formData.get('datos') || '');
  const folio =
    String(formData.get('folio') || '').trim() ||
    `PLANILLA-${new Date().toISOString().slice(0, 10)}`;

  if (!datos.trim()) {
    redirect('/importar?error=' + encodeURIComponent('Pega o carga las filas de la planilla'));
  }

  let insertadas = 0;
  let error = '';

  try {
    const sb = db();
    const filas = parseTabla(datos);
    if (!filas.length) throw new Error('No se encontraron filas en el texto');

    const cabecera = filas[0].map(clasificar);
    const reconocidas = cabecera.filter(Boolean).length;
    const conEncabezado = reconocidas >= 5;
    const mapa: (Campo | null)[] = conEncabezado ? cabecera : ORDEN;
    const cuerpo = conEncabezado ? filas.slice(1) : filas;

    const registros = cuerpo
      .map((celdas, i) => {
        const valor = (campo: Campo): string => {
          const idx = mapa.indexOf(campo);
          return idx >= 0 ? String(celdas[idx] ?? '').trim() : '';
        };

        const fechaRaw = valor('fecha');
        const entradaRaw = valor('entrada');
        const salidaRaw = valor('salida');
        const fecha = normalizarFecha(fechaRaw);
        const entrada = normalizarHora(entradaRaw);
        const salida = normalizarHora(salidaRaw);

        return {
          folio,
          fila: i + 2,
          fecha_raw: fechaRaw || null,
          ficha_raw: valor('ficha') || null,
          nombres_raw: valor('nombres') || null,
          programa_raw: valor('programa') || null,
          ambiente_raw: valor('ambiente') || null,
          hora_entrada_raw: entradaRaw || null,
          hora_salida_raw: salidaRaw || null,
          firma_presente: ['s', 'si', 'x', '1', 'true'].includes(norm(valor('firma'))),
          observaciones_raw: valor('observaciones') || null,
          fecha_norm: fecha,
          hora_entrada_norm: fechaHora(fecha, entrada),
          hora_salida_norm: fechaHora(fecha, salida),
          estado_validacion: 'pendiente',
        };
      })
      .filter((r) => r.fecha_raw || r.ficha_raw || r.nombres_raw);

    if (!registros.length) throw new Error('Las filas no tienen datos reconocibles');

    for (let i = 0; i < registros.length; i += 200) {
      const lote = registros.slice(i, i + 200);
      const { error: err } = await sb.from('stg_planilla_papel').insert(lote);
      if (err) throw new Error(err.message);
      insertadas += lote.length;
    }
  } catch (e) {
    error = mensajeError(e);
  }

  if (error) redirect('/importar?error=' + encodeURIComponent(error));

  revalidatePath('/importar');
  redirect('/importar?ok=' + encodeURIComponent(`${insertadas} filas cargadas en la bandeja`));
}

/* ------------------------------ Conciliación ------------------------------ */

export async function conciliarPlanilla(): Promise<void> {
  await requireAdmin();

  const resumen: Record<string, number> = {};
  let error = '';

  try {
    const sb = db();

    const { data: filas, error: err } = await sb
      .from('stg_planilla_papel')
      .select('*')
      .in('estado_validacion', [
        'pendiente',
        'fecha_invalida',
        'hora_invalida',
        'instructor_no_encontrado',
        'ficha_no_encontrada',
        'programa_no_coincide',
        'ambiente_no_encontrado',
      ])
      .order('id')
      .limit(1000);

    if (err) throw new Error(err.message);
    if (!filas || !filas.length) {
      redirect('/importar?ok=' + encodeURIComponent('No hay filas pendientes por conciliar'));
    }

    const [{ data: fichas }, { data: programas }, { data: ambientes }, { data: personas }] =
      await Promise.all([
        sb.from('ficha').select('id, codigo, programa_id, activa'),
        sb.from('programa').select('id, codigo, nombre'),
        sb.from('ambiente').select('id, codigo, nombre'),
        sb.from('persona').select('id, nombres, apellidos'),
      ]);

    const listaFichas = fichas || [];
    const listaProgramas = programas || [];
    const listaAmbientes = ambientes || [];
    const listaPersonas = personas || [];

    // Crear instructores que no existan (una sola vez por nombre)
    const nuevas = new Map<string, string>();
    const actualizadas: any[] = [];

    for (const fila of filas as any[]) {
      const fecha = fila.fecha_norm ?? normalizarFecha(fila.fecha_raw);
      const entrada = normalizarHora(fila.hora_entrada_raw);
      const salida = normalizarHora(fila.hora_salida_raw);
      const fichaCodigo = normalizarFicha(fila.ficha_raw);

      let estado = 'listo';
      let fichaId: number | null = null;
      let programaId: number | null = null;
      let ambienteId: number | null = null;
      let instructorId: string | null = null;

      if (!fecha) estado = 'fecha_invalida';
      if (!entrada) estado = estado === 'listo' ? 'hora_invalida' : estado;

      if (estado === 'listo') {
        const ficha = listaFichas.find((f: any) => f.codigo === fichaCodigo);
        if (!ficha) {
          estado = 'ficha_no_encontrada';
        } else {
          fichaId = ficha.id;
          programaId = ficha.programa_id ?? null;
        }
      }

      if (estado === 'listo') {
        if (!programaId) {
          estado = 'programa_no_coincide';
        } else {
          const programaTexto = buscarPrograma(fila.programa_raw || '', listaProgramas);
          if (programaTexto && programaTexto !== programaId) {
            estado = 'programa_no_coincide';
          }
        }
      }

      if (estado === 'listo') {
        if (fila.ambiente_raw && String(fila.ambiente_raw).trim()) {
          ambienteId = buscarAmbiente(String(fila.ambiente_raw), listaAmbientes);
          if (!ambienteId) estado = 'ambiente_no_encontrado';
        }
      }

      if (estado === 'listo') {
        const nombre = String(fila.nombres_raw || '').trim();
        if (!nombre) {
          estado = 'instructor_no_encontrado';
        } else {
          instructorId = buscarInstructor(nombre, listaPersonas);

          if (!instructorId) {
            const clave = norm(nombre);
            instructorId = nuevas.get(clave) ?? null;

            if (!instructorId) {
              const partes = partesNombre(nombre);
              const { data: creada, error: errP } = await sb
                .from('persona')
                .insert({ ...partes, tipo_persona: 'instructor' })
                .select('id')
                .single();

              if (errP || !creada) {
                estado = 'instructor_no_encontrado';
              } else {
                instructorId = creada.id;
                nuevas.set(clave, creada.id);
                listaPersonas.push({ id: creada.id, ...partes });
              }
            }
          }
        }
      }

      resumen[estado] = (resumen[estado] || 0) + 1;

      actualizadas.push({
        ...fila,
        fecha_norm: fecha,
        hora_entrada_norm: fechaHora(fecha, entrada),
        hora_salida_norm: fechaHora(fecha, salida),
        ficha_id: fichaId,
        programa_id: programaId,
        ambiente_id: ambienteId,
        instructor_id: instructorId,
        estado_validacion: estado,
        hash_fila: hashFila(fila),
      });
    }

    for (let i = 0; i < actualizadas.length; i += 200) {
      const lote = actualizadas.slice(i, i + 200);
      const { error: errUp } = await sb
        .from('stg_planilla_papel')
        .upsert(lote, { onConflict: 'id' });
      if (errUp) throw new Error(errUp.message);
    }
  } catch (e: any) {
    if (e && e.digest && String(e.digest).startsWith('NEXT_REDIRECT')) throw e;
    error = mensajeError(e);
  }

  if (error) redirect('/importar?error=' + encodeURIComponent(error));

  const detalle = Object.entries(resumen)
    .map(([k, v]) => `${k}: ${v}`)
    .join(' · ');

  revalidatePath('/importar');
  redirect('/importar?ok=' + encodeURIComponent(`Conciliación terminada — ${detalle}`));
}

/* ------------------------------ Migración ------------------------------ */

export async function migrarPlanilla(): Promise<void> {
  const usuario = await requireAdmin();

  let migradas = 0;
  let error = '';

  try {
    const sb = db();

    const { data: filas, error: err } = await sb
      .from('stg_planilla_papel')
      .select('*')
      .eq('estado_validacion', 'listo')
      .order('id')
      .limit(300);

    if (err) throw new Error(err.message);
    if (!filas || !filas.length) {
      redirect('/importar?ok=' + encodeURIComponent('No hay filas listas para migrar'));
    }

    const { data: existentes } = await sb
      .from('sesion_ambiente')
      .select('hash_fila')
      .not('hash_fila', 'is', null);
    const hashes = new Set((existentes || []).map((r: any) => r.hash_fila));

    const aptas: any[] = [];
    const duplicadas: any[] = [];

    for (const fila of filas as any[]) {
      const hash = fila.hash_fila || hashFila(fila);
      if (hashes.has(hash)) {
        duplicadas.push({ ...fila, estado_validacion: 'duplicado' });
      } else {
        hashes.add(hash);
        aptas.push({ ...fila, hash_fila: hash });
      }
    }

    if (duplicadas.length) {
      const { error: errD } = await sb
        .from('stg_planilla_papel')
        .upsert(duplicadas, { onConflict: 'id' });
      if (errD) throw new Error(errD.message);
    }

    if (aptas.length) {
      const lote = aptas.map((f) => ({
        ambiente_id: f.ambiente_id,
        instructor_id: f.instructor_id,
        ficha_id: f.ficha_id,
        programa_id: f.programa_id,
        ambiente_texto_original: f.ambiente_raw,
        instructor_texto_original: f.nombres_raw,
        ficha_texto_original: f.ficha_raw,
        programa_texto_original: f.programa_raw,
        fecha: f.fecha_norm,
        hora_entrada: f.hora_entrada_norm,
        hora_salida: f.hora_salida_norm,
        estado: f.hora_salida_norm ? 'cerrada' : 'sin_cierre',
        firma_metodo: f.firma_presente ? 'foto_papel' : 'ninguna',
        observaciones: f.observaciones_raw,
        origen: 'migrado_papel',
        folio: f.folio,
        documento_url: f.documento_url,
        hash_fila: f.hash_fila,
        registrado_por: usuario.id,
      }));

      const { data: creadas, error: errIns } = await sb
        .from('sesion_ambiente')
        .insert(lote)
        .select('id');

      if (errIns) throw new Error(errIns.message);

      const ids = (creadas || []).map((r: any) => r.id);
      const actualizadas = aptas.map((f, i) => ({
        ...f,
        estado_validacion: 'migrado',
        sesion_id: ids[i] ?? null,
      }));

      const { error: errUp } = await sb
        .from('stg_planilla_papel')
        .upsert(actualizadas, { onConflict: 'id' });
      if (errUp) throw new Error(errUp.message);

      migradas = aptas.length;
    }
  } catch (e: any) {
    if (e && e.digest && String(e.digest).startsWith('NEXT_REDIRECT')) throw e;
    error = mensajeError(e);
  }

  if (error) redirect('/importar?error=' + encodeURIComponent(error));

  revalidatePath('/importar');
  revalidatePath('/acceso');
  redirect(
    '/importar?ok=' +
      encodeURIComponent(`${migradas} sesiones migradas desde la planilla de papel`)
  );
}

/* ------------------------------ Ajustes manuales ------------------------------ */

export async function forzarListo(formData: FormData): Promise<void> {
  await requireAdmin();
  const id = Number(formData.get('id'));
  if (!id) redirect('/importar?error=' + encodeURIComponent('Fila inválida'));

  let error = '';
  try {
    const { error: err } = await db()
      .from('stg_planilla_papel')
      .update({ estado_validacion: 'listo' })
      .eq('id', id);
    if (err) error = err.message;
  } catch (e) {
    error = mensajeError(e);
  }

  if (error) redirect('/importar?error=' + encodeURIComponent(error));
  revalidatePath('/importar');
  redirect('/importar?ok=' + encodeURIComponent('Fila marcada como lista'));
}

export async function descartarFila(formData: FormData): Promise<void> {
  await requireAdmin();
  const id = Number(formData.get('id'));
  if (!id) redirect('/importar?error=' + encodeURIComponent('Fila inválida'));

  let error = '';
  try {
    const { error: err } = await db()
      .from('stg_planilla_papel')
      .update({ estado_validacion: 'descartado' })
      .eq('id', id);
    if (err) error = err.message;
  } catch (e) {
    error = mensajeError(e);
  }

  if (error) redirect('/importar?error=' + encodeURIComponent(error));
  revalidatePath('/importar');
  redirect('/importar?ok=' + encodeURIComponent('Fila descartada'));
}

export async function reabrirFila(formData: FormData): Promise<void> {
  await requireAdmin();
  const id = Number(formData.get('id'));
  if (!id) redirect('/importar?error=' + encodeURIComponent('Fila inválida'));

  let error = '';
  try {
    const { error: err } = await db()
      .from('stg_planilla_papel')
      .update({ estado_validacion: 'pendiente' })
      .eq('id', id);
    if (err) error = err.message;
  } catch (e) {
    error = mensajeError(e);
  }

  if (error) redirect('/importar?error=' + encodeURIComponent(error));
  revalidatePath('/importar');
  redirect('/importar?ok=' + encodeURIComponent('Fila devuelta a pendientes'));
}
