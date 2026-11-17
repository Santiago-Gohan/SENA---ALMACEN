'use server';

import { createHash } from 'crypto';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { db, mensajeError } from '@/lib/supabase';
import { requireSession } from '@/lib/auth';
import { norm, hoyISO } from '@/lib/utils';

function texto(v: FormDataEntryValue | null): string {
  return String(v ?? '').trim();
}

function entero(v: FormDataEntryValue | null): number | null {
  const s = texto(v);
  if (!s) return null;
  const n = Number(s);
  return Number.isFinite(n) ? Math.trunc(n) : null;
}

async function resolverInstructor(
  sb: ReturnType<typeof db>,
  nombreRaw: string,
  crearSiFalta: boolean
): Promise<string | null> {
  const nombre = nombreRaw.replace(/\s+/g, ' ').trim();
  if (!nombre) return null;

  const { data: personas } = await sb
    .from('persona')
    .select('id, nombres, apellidos')
    .in('tipo_persona', ['instructor', 'funcionario', 'contratista'])
    .limit(2000);

  const objetivo = norm(nombre);
  const encontrada = (personas || []).find(
    (p: any) => norm(`${p.nombres ?? ''} ${p.apellidos ?? ''}`) === objetivo
  );
  if (encontrada) return encontrada.id;
  if (!crearSiFalta) return null;

  const partes = nombre.split(' ');
  const apellidos = partes.length >= 3 ? partes.slice(-2).join(' ') : partes[1] ?? '';
  const nombres = partes.length >= 3 ? partes.slice(0, -2).join(' ') : partes[0];

  const { data: nueva, error } = await sb
    .from('persona')
    .insert({ nombres, apellidos, tipo_persona: 'instructor' })
    .select('id')
    .single();

  if (error) throw new Error(error.message);
  return nueva.id;
}

async function buscarAmbientePorCodigo(
  sb: ReturnType<typeof db>,
  raw: string
): Promise<any | null> {
  const codigo = raw.replace(/^SENA-AMB:/i, '').trim();
  if (!codigo) return null;

  const { data: porCodigo } = await sb
    .from('ambiente')
    .select('id, codigo, nombre, activo')
    .eq('codigo', codigo)
    .maybeSingle();
  if (porCodigo) return porCodigo;

  const limpio = codigo.replace(/[%,()]/g, ' ').trim();
  if (!limpio) return null;

  const { data: porNombre } = await sb
    .from('ambiente')
    .select('id, codigo, nombre, activo')
    .ilike('nombre', `%${limpio}%`)
    .limit(1)
    .maybeSingle();

  return porNombre ?? null;
}

async function guardarFirma(
  sb: ReturnType<typeof db>,
  dataUrl: string
): Promise<{ url: string | null; hash: string | null }> {
  const m = dataUrl.match(/^data:image\/(png|jpeg|jpg);base64,(.+)$/);
  if (!m) return { url: null, hash: null };

  const buffer = Buffer.from(m[2], 'base64');
  const hash = createHash('sha256').update(buffer).digest('hex');
  const path = `sesiones/${Date.now()}-${hash.slice(0, 12)}.png`;

  try {
    const { error } = await sb.storage
      .from('firmas')
      .upload(path, buffer, { contentType: 'image/png', upsert: false });

    if (!error) {
      const { data } = sb.storage.from('firmas').getPublicUrl(path);
      if (data?.publicUrl) return { url: data.publicUrl, hash };
    }
  } catch {
    // Si el bucket no existe todavía, se guarda la firma en la base.
  }

  return { url: dataUrl, hash };
}

export async function abrirSesion(formData: FormData): Promise<void> {
  const usuario = await requireSession();

  const ambienteId = entero(formData.get('ambiente_id'));
  const ambienteCodigo = texto(formData.get('ambiente_codigo'));
  const fichaCodigo = texto(formData.get('ficha')).replace(/\D/g, '');
  const instructorNombre = texto(formData.get('instructor'));
  const programaForm = entero(formData.get('programa_id'));
  const firma = texto(formData.get('firma_data'));
  const sinFirma = texto(formData.get('sin_firma')) === 'on';
  const observaciones = texto(formData.get('observaciones'));

  if (!ambienteId && !ambienteCodigo) {
    redirect('/acceso?error=' + encodeURIComponent('Escanea el QR o selecciona el ambiente'));
  }
  if (!/^\d{7,8}$/.test(fichaCodigo)) {
    redirect('/acceso?error=' + encodeURIComponent('La ficha debe tener 7 u 8 dígitos'));
  }
  if (!instructorNombre) {
    redirect('/acceso?error=' + encodeURIComponent('Escribe el nombre del instructor'));
  }
  if (!firma && !sinFirma) {
    redirect('/acceso?error=' + encodeURIComponent('Falta la firma del instructor'));
  }

  let error = '';

  try {
    const sb = db();

    let ambiente: any = null;

    if (ambienteCodigo) {
      ambiente = await buscarAmbientePorCodigo(sb, ambienteCodigo);
    }
    if (!ambiente && ambienteId) {
      const { data } = await sb
        .from('ambiente')
        .select('id, codigo, nombre, activo')
        .eq('id', ambienteId)
        .maybeSingle();
      ambiente = data;
    }

    if (!ambiente) {
      throw new Error('No se encontró el ambiente. Escanea el QR de nuevo o selecciónalo de la lista.');
    }
    if (!ambiente.activo) throw new Error('El ambiente está inactivo');

    const { data: ficha, error: errFicha } = await sb
      .from('ficha')
      .select('id, codigo, programa_id, activa')
      .eq('codigo', fichaCodigo)
      .maybeSingle();
    if (errFicha) throw new Error(errFicha.message);
    if (!ficha) throw new Error(`La ficha ${fichaCodigo} no está registrada. Créala antes de usarla.`);
    if (!ficha.activa) throw new Error(`La ficha ${fichaCodigo} está inactiva`);

    const programaId = programaForm ?? ficha.programa_id;
    if (!programaId) throw new Error('La ficha no tiene programa de formación asignado');

    const instructorId = await resolverInstructor(sb, instructorNombre, true);
    if (!instructorId) throw new Error('No se pudo identificar al instructor');

    const { data: abierta } = await sb
      .from('sesion_ambiente')
      .select('id')
      .eq('ambiente_id', ambiente.id)
      .eq('instructor_id', instructorId)
      .is('hora_salida', null)
      .maybeSingle();
    if (abierta) throw new Error('Ese instructor ya tiene una sesión abierta en este ambiente');

    const firmaGuardada = firma ? await guardarFirma(sb, firma) : { url: null, hash: null };

    const { error: errIns } = await sb.from('sesion_ambiente').insert({
      ambiente_id: ambiente.id,
      instructor_id: instructorId,
      ficha_id: ficha.id,
      programa_id: programaId,
      instructor_texto_original: instructorNombre,
      ficha_texto_original: fichaCodigo,
      ambiente_texto_original: `${ambiente.codigo} - ${ambiente.nombre}`,
      fecha: hoyISO(),
      hora_entrada: new Date().toISOString(),
      estado: 'abierta',
      firma_url: firmaGuardada.url,
      firma_hash: firmaGuardada.hash,
      firma_metodo: firma ? 'canvas' : 'ninguna',
      observaciones: observaciones || null,
      origen: 'digital',
      registrado_por: usuario.id,
    });

    if (errIns) throw new Error(errIns.message);

    await sb.from('auditoria').insert({
      usuario_id: usuario.id,
      accion: 'abrir_sesion',
      entidad: 'sesion_ambiente',
      entidad_id: `${ambiente.codigo}/${fichaCodigo}`,
    });

    revalidatePath('/acceso');
    revalidatePath('/');
    redirect('/acceso?ok=' + encodeURIComponent(`Entrada registrada en ${ambiente.codigo}`));
  } catch (e: any) {
    if (e && e.digest && String(e.digest).startsWith('NEXT_REDIRECT')) throw e;
    error = mensajeError(e);
  }

  redirect('/acceso?error=' + encodeURIComponent(error));
}

export async function cerrarSesion(formData: FormData): Promise<void> {
  const usuario = await requireSession();
  const id = entero(formData.get('id'));
  const observaciones = texto(formData.get('observaciones'));
  const tipoNovedad = texto(formData.get('tipo_novedad'));

  if (!id) redirect('/acceso?error=' + encodeURIComponent('Sesión inválida'));

  let error = '';

  try {
    const sb = db();

    const { data: sesion, error: errSes } = await sb
      .from('sesion_ambiente')
      .select('id, hora_entrada, hora_salida, ambiente_id')
      .eq('id', id)
      .single();
    if (errSes || !sesion) throw new Error('La sesión no existe');
    if (sesion.hora_salida) throw new Error('Esa sesión ya está cerrada');

    const conNovedad = Boolean(tipoNovedad);

    const { error: errUpd } = await sb
      .from('sesion_ambiente')
      .update({
        hora_salida: new Date().toISOString(),
        estado: conNovedad ? 'con_novedad' : 'cerrada',
        observaciones: observaciones || null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', id);
    if (errUpd) throw new Error(errUpd.message);

    if (conNovedad) {
      const { error: errNov } = await sb.from('novedad').insert({
        sesion_id: id,
        tipo: tipoNovedad,
        descripcion: observaciones || 'Novedad reportada al cierre de la sesión',
        estado: 'abierta',
        creado_por: usuario.id,
      });
      if (errNov) throw new Error(errNov.message);
    }

    await sb.from('auditoria').insert({
      usuario_id: usuario.id,
      accion: 'cerrar_sesion',
      entidad: 'sesion_ambiente',
      entidad_id: String(id),
    });
  } catch (e) {
    error = mensajeError(e);
  }

  if (error) redirect('/acceso?error=' + encodeURIComponent(error));

  revalidatePath('/acceso');
  revalidatePath('/');
  redirect('/acceso?ok=' + encodeURIComponent('Salida registrada'));
}
