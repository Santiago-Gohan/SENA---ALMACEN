'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { logoutAction } from '@/actions/auth';

type Props = {
  usuario: { nombre: string; rol: string; permisos: Record<string, any> };
};

const ENLACES = [
  { href: '/', etiqueta: 'Panel', icono: '◧' },
  { href: '/inventario', etiqueta: 'Inventario', icono: '▤' },
  { href: '/ambientes', etiqueta: 'Ambientes', icono: '⌂' },
  { href: '/fichas', etiqueta: 'Fichas', icono: '#' },
  { href: '/acceso', etiqueta: 'Acceso', icono: '⇄' },
  { href: '/etiquetas', etiqueta: 'Etiquetas', icono: '▦' },
  { href: '/importar', etiqueta: 'Importar', icono: '⇧', soloAdmin: true },
];

export default function Nav({ usuario }: Props) {
  const pathname = usePathname() || '/';
  const admin = usuario.rol === 'administrador' || usuario.permisos?.admin === true;

  const enlaces = ENLACES.filter((e) => !e.soloAdmin || admin);

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
