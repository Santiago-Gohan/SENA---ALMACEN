import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { SignJWT, jwtVerify } from 'jose';
import bcrypt from 'bcryptjs';
import { db } from './supabase';

const COOKIE = 'sena_session';
const MAX_AGE = 60 * 60 * 8; // 8 horas

function secreto(): Uint8Array {
  const s = process.env.AUTH_SECRET || 'dev-secret-sena-almacen-cambiar-en-produccion';
  return new TextEncoder().encode(s);
}

export type SessionUser = {
  id: string;
  username: string;
  nombre: string;
  rol: string;
  permisos: Record<string, any>;
};

export async function createSession(usuario: SessionUser): Promise<void> {
  const token = await new SignJWT({ ...usuario })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(usuario.id)
    .setIssuedAt()
    .setExpirationTime(`${MAX_AGE}s`)
    .sign(secreto());

  cookies().set(COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: MAX_AGE,
  });
}

export function destroySession(): void {
  cookies().delete(COOKIE);
}

export async function getSession(): Promise<SessionUser | null> {
  const token = cookies().get(COOKIE)?.value;
  if (!token) return null;

  try {
    const { payload } = await jwtVerify(token, secreto());
    return {
      id: String(payload.id ?? payload.sub ?? ''),
      username: String(payload.username ?? ''),
      nombre: String(payload.nombre ?? ''),
      rol: String(payload.rol ?? 'instructor'),
      permisos: (payload.permisos as Record<string, any>) ?? {},
    };
  } catch {
    return null;
  }
}

export async function requireSession(): Promise<SessionUser> {
  const usuario = await getSession();
  if (!usuario) redirect('/login');
  return usuario;
}

export function esAdmin(usuario: SessionUser | null): boolean {
  return Boolean(usuario && (usuario.rol === 'administrador' || usuario.permisos?.admin === true));
}

export async function requireAdmin(): Promise<SessionUser> {
  const usuario = await requireSession();
  if (!esAdmin(usuario)) redirect('/?error=' + encodeURIComponent('Necesitas permisos de administrador'));
  return usuario;
}

export async function verifyLogin(username: string, pin: string): Promise<SessionUser | null> {
  const sb = db();
  const user = (username || '').trim().toLowerCase();
  if (!user || !pin) return null;

  const { data, error } = await sb
    .from('usuario')
    .select(
      'id, username, pin_hash, activo, rol:rol_id(nombre, permisos), persona:persona_id(nombres, apellidos)'
    )
    .eq('username', user)
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!data || !data.activo) return null;

  const ok = await bcrypt.compare(pin, data.pin_hash);
  if (!ok) return null;

  await sb.from('usuario').update({ ultimo_login: new Date().toISOString() }).eq('id', data.id);

  const persona: any = Array.isArray(data.persona) ? data.persona[0] : data.persona;
  const rol: any = Array.isArray(data.rol) ? data.rol[0] : data.rol;
  const nombre = persona
    ? `${persona.nombres ?? ''} ${persona.apellidos ?? ''}`.trim()
    : data.username;

  return {
    id: data.id,
    username: data.username,
    nombre: nombre || data.username,
    rol: rol?.nombre ?? 'instructor',
    permisos: rol?.permisos ?? {},
  };
}

export async function hashPin(pin: string): Promise<string> {
  return bcrypt.hash(pin, 10);
}
