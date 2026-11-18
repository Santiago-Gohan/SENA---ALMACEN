import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { SignJWT, jwtVerify } from 'jose';
import bcrypt from 'bcryptjs';
import { q, uno } from './db';

const COOKIE = 'sena_session';
const MAX_AGE = 60 * 60 * 8; // 8 horas

export function secreto(): Uint8Array {
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

/**
 * Permisos del sistema (se guardan como booleanos en rol.permisos):
 *
 *  inventario_ver       Ver el inventario
 *  inventario_editar    Crear, editar, trasladar y dar de baja objetos
 *  ambientes_ver        Ver ambientes
 *  ambientes_editar     Crear y editar ambientes
 *  fichas_ver           Ver fichas y programas
 *  fichas_editar        Crear y editar fichas y programas
 *  sesiones             Registrar entrada/salida y cerrar sesiones
 *  porteria             Prestar y devolver llaves de los ambientes
 *  verificar            Diligenciar el inventario diario con los aprendices de turno
 *  etiquetas            Imprimir etiquetas QR
 *  importar             Importar la planilla de papel
 *  usuarios             Gestionar usuarios y roles
 *  config               Configuración del centro
 */
export type Permiso =
  | 'inventario_ver'
  | 'inventario_editar'
  | 'ambientes_ver'
  | 'ambientes_editar'
  | 'fichas_ver'
  | 'fichas_editar'
  | 'sesiones'
  | 'porteria'
  | 'verificar'
  | 'etiquetas'
  | 'importar'
  | 'usuarios'
  | 'config';

export function puede(usuario: SessionUser | null, permiso: Permiso): boolean {
  if (!usuario) return false;
  if (esAdmin(usuario)) return true;
  return usuario.permisos?.[permiso] === true;
}

export async function requirePermiso(permiso: Permiso): Promise<SessionUser> {
  const usuario = await requireSession();
  if (!puede(usuario, permiso)) {
    redirect('/?error=' + encodeURIComponent('Tu rol no tiene permiso para esa sección'));
  }
  return usuario;
}

export async function requireAdmin(): Promise<SessionUser> {
  const usuario = await requireSession();
  if (!esAdmin(usuario)) redirect('/?error=' + encodeURIComponent('Necesitas permisos de administrador'));
  return usuario;
}

export async function verifyLogin(username: string, pin: string): Promise<SessionUser | null> {
  const user = (username || '').trim().toLowerCase();
  if (!user || !pin) return null;

  const data = await uno<any>(
    `select u.id, u.username, u.pin_hash, u.activo,
            r.nombre as rol_nombre, r.permisos as rol_permisos,
            p.nombres, p.apellidos
       from usuario u
       left join rol r on r.id = u.rol_id
       left join persona p on p.id = u.persona_id
      where lower(u.username) = $1`,
    [user]
  );

  if (!data || !data.activo) return null;

  const ok = await bcrypt.compare(pin, data.pin_hash);
  if (!ok) return null;

  await q('update usuario set ultimo_login = now() where id = $1', [data.id]);

  const nombre = `${data.nombres ?? ''} ${data.apellidos ?? ''}`.trim();

  return {
    id: data.id,
    username: data.username,
    nombre: nombre || data.username,
    rol: data.rol_nombre ?? 'instructor',
    permisos: data.rol_permisos ?? {},
  };
}

export async function hashPin(pin: string): Promise<string> {
  return bcrypt.hash(pin, 10);
}
