import { requireSession } from '@/lib/auth';
import Nav from '@/components/Nav';

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const usuario = await requireSession();

  return (
    <div className="shell">
      <Nav
        usuario={{ nombre: usuario.nombre, rol: usuario.rol, permisos: usuario.permisos }}
      />
      <main className="main">{children}</main>
    </div>
  );
}
