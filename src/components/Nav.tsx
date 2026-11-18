'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { logoutAction } from '@/actions/auth';

type Props = {
  usuario: { nombre: string; rol: string; permisos: Record<string, any> };
};

type Enlace = {
  href: string;
  etiqueta: string;
  icono: string;
  permiso?: string;
};

const ENLACES: Enlace[] = [
  { href: '/', etiqueta: 'Panel', icono: '◧' },
  { href: '/inventario', etiqueta: 'Inventario', icono: '▤', permiso: 'inventario_ver' },
  { href: '/ambientes', etiqueta: 'Ambientes', icono: '⌂', permiso: 'ambientes_ver' },
  { href: '/fichas', etiqueta: 'Fichas', icono: '#', permiso: 'fichas_ver' },
  { href: '/acceso', etiqueta: 'Acceso', icono: '⇄', permiso: 'sesiones' },
  { href: '/porteria', etiqueta: 'Portería', icono: '🔑', permiso: 'porteria' },
  { href: '/mi-huella', etiqueta: 'Mi huella', icono: '☝', permiso: 'verificar' },
  { href: '/etiquetas', etiqueta: 'Etiquetas', icono: '▦', permiso: 'etiquetas' },
  { href: '/importar', etiqueta: 'Importar', icono: '⇧', permiso: 'importar' },
  { href: '/usuarios', etiqueta: 'Usuarios', icono: '☺', permiso: 'usuarios' },
  { href: '/configuracion', etiqueta: 'Configuración', icono: '⚙', permiso: 'config' },
];

export default function Nav({ usuario }: Props) {
  const pathname = usePathname() || '/';
  const admin = usuario.rol === 'administrador' || usuario.permisos?.admin === true;

  const puede = (permiso?: string) =>
    !permiso || admin || usuario.permisos?.[permiso] === true;

  const enlaces = ENLACES.filter((e) => puede(e.permiso));

  return (
    <aside className="sidebar">
      <div className="marca">
        <div className="logo">S</div>
        <div>
          <strong>Almacén SENA</strong>
          <div className="marca-sub">CGAO Oriente · Vélez</div>
        </div>
      </div>

      <nav className="nav">
        {enlaces.map((e) => {
          const activo = e.href === '/' ? pathname === '/' : pathname.startsWith(e.href);
          return (
            <Link key={e.href} href={e.href} className={`nav-link${activo ? ' activo' : ''}`}>
              <span className="nav-icono" aria-hidden>
                {e.icono}
              </span>
              {e.etiqueta}
            </Link>
          );
        })}
      </nav>

      <div className="sidebar-pie">
        <div className="usuario">
          <div className="avatar">{usuario.nombre.slice(0, 1).toUpperCase()}</div>
          <div className="usuario-datos">
            <strong>{usuario.nombre}</strong>
            <span>{usuario.rol}</span>
          </div>
        </div>
        <form action={logoutAction}>
          <button className="btn-salir" type="submit">
            Cerrar sesión
          </button>
        </form>
      </div>
    </aside>
  );
}
