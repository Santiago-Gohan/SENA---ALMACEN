'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { ejecutar, mensajeError, uno } from '@/lib/db';
import { hashPin, requirePermiso } from '@/lib/auth';

function texto(v: FormDataEntryValue | null): string {
  return String(v ?? '').trim();
}

function entero(v: FormDataEntryValue | null): number | null {
  const s = texto(v);
  if (!s) return null;
  const n = Number(s);
  return Number.isFinite(n) ? Math.trunc(n) : null;
}

function volver(ok: string | null, error: string | null): never {
  const qs = ok
    ? '?ok=' + encodeURIComponent(ok)
    : '?error=' + encodeURIComponent(error || 'No se pudo completar la operación');
  redirect('/usuarios' + qs);
}

function validarUsuario(username: string): string | null {
  if (!/^[a-z0-9._-]{3,24}$/.test(username)) {
    return 'El usuario debe tener entre 3 y 24 caracteres (letras, números, punto, guion o _)';
  }
  return null;
}

function validarPin(pin: string): string | null {
  if (!/^\d{4,8}$/.test(pin)) return 'El PIN debe tener entre 4 y 8 dígitos';
  return null;
}

export async function crearUsuario(formData: FormData): Promise<void> {
  const actor = await requirePermiso('usuarios');

  const username = texto(formData.get('username')).toLowerCase();
  const nombres = texto(formData.get('nombres'));
  const apellidos = texto(formData.get('apellidos'));
  const rolId = entero(formData.get('rol_id'));
  const pin = texto(formData.get('pin'));

  const errorUsuario = validarUsuario(username);
  if (errorUsuario) volver(null, errorUsuario);
  if (!nombres || !apellidos) volver(null, 'Escribe nombres y apellidos');
  if (!rolId) volver(null, 'Selecciona un rol');
  const errorPin = validarPin(pin);
  if (errorPin) volver(null, errorPin);

  let error = '';

  try {
    const existente = await uno('select id from usuario where lower(username) = $1', [username]);
    if (existente) throw new Error(`El usuario "${username}" ya existe`);

    const rol = await uno<any>('select id, nombre from rol where id = $1', [rolId]);
    if (!rol) throw new Error('El rol seleccionado no existe');

    const tipoPersona =
      rol.nombre === 'vigilancia'
        ? 'vigilancia'
        : rol.nombre === 'administrador'
        ? 'funcionario'
        : 'instructor';

    const persona = await uno<any>(
      `insert into persona (nombres, apellidos, tipo_persona)
       values ($1, $2, $3) returning id`,
      [nombres, apellidos, tipoPersona]
    );

    await ejecutar(
      `insert into usuario (persona_id, username, pin_hash, rol_id, activo)
       values ($1, $2, $3, $4, true)`,
      [persona.id, username, await hashPin(pin), rolId]
    );

    await ejecutar(
      `insert into auditoria (usuario_id, accion, entidad, entidad_id)
       values ($1, 'crear_usuario', 'usuario', $2)`,
      [actor.id, username]
    );
  } catch (e) {
    error = mensajeError(e);
  }

  if (error) volver(null, error);

  revalidatePath('/usuarios');
  volver(`Usuario "${username}" creado`, null);
}

export async function cambiarRol(formData: FormData): Promise<void> {
  const actor = await requirePermiso('usuarios');
  const id = texto(formData.get('id'));
  const rolId = entero(formData.get('rol_id'));

  if (!id || !rolId) volver(null, 'Datos incompletos');

  let error = '';

  try {
    const usuario = await uno<any>('select id, username from usuario where id = $1', [id]);
    if (!usuario) throw new Error('El usuario no existe');

    const esMiCuenta = usuario.id === actor.id;
    if (esMiCuenta) throw new Error('No puedes cambiar tu propio rol');

    await ejecutar('update usuario set rol_id = $2 where id = $1', [id, rolId]);

    await ejecutar(
      `insert into auditoria (usuario_id, accion, entidad, entidad_id)
       values ($1, 'cambiar_rol', 'usuario', $2)`,
      [actor.id, usuario.username]
    );
  } catch (e) {
    error = mensajeError(e);
  }

  if (error) volver(null, error);

  revalidatePath('/usuarios');
  volver('Rol actualizado', null);
}

export async function alternarActivo(formData: FormData): Promise<void> {
  const actor = await requirePermiso('usuarios');
  const id = texto(formData.get('id'));

  if (!id) volver(null, 'Usuario inválido');

  let error = '';
  let mensaje = '';

  try {
    const usuario = await uno<any>('select id, username, activo from usuario where id = $1', [id]);
    if (!usuario) throw new Error('El usuario no existe');
    if (usuario.id === actor.id) throw new Error('No puedes desactivar tu propia cuenta');

    await ejecutar('update usuario set activo = $2 where id = $1', [id, !usuario.activo]);
    mensaje = usuario.activo
      ? `Usuario "${usuario.username}" desactivado`
      : `Usuario "${usuario.username}" activado`;

    await ejecutar(
      `insert into auditoria (usuario_id, accion, entidad, entidad_id)
       values ($1, $2, 'usuario', $3)`,
      [actor.id, usuario.activo ? 'desactivar_usuario' : 'activar_usuario', usuario.username]
    );
  } catch (e) {
    error = mensajeError(e);
  }

  if (error) volver(null, error);

  revalidatePath('/usuarios');
  volver(mensaje, null);
}

export async function resetPin(formData: FormData): Promise<void> {
  const actor = await requirePermiso('usuarios');
  const id = texto(formData.get('id'));
  const pin = texto(formData.get('pin'));

  if (!id) volver(null, 'Usuario inválido');
  const errorPin = validarPin(pin);
  if (errorPin) volver(null, errorPin);

  let error = '';
  let username = '';

  try {
    const usuario = await uno<any>('select id, username from usuario where id = $1', [id]);
    if (!usuario) throw new Error('El usuario no existe');
    username = usuario.username;

    await ejecutar('update usuario set pin_hash = $2 where id = $1', [id, await hashPin(pin)]);

    await ejecutar(
      `insert into auditoria (usuario_id, accion, entidad, entidad_id)
       values ($1, 'reset_pin', 'usuario', $2)`,
      [actor.id, username]
    );
  } catch (e) {
    error = mensajeError(e);
  }

  if (error) volver(null, error);

  revalidatePath('/usuarios');
  volver(`PIN de "${username}" actualizado`, null);
}
