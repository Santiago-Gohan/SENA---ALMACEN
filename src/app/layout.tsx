import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'SENA · Control de Ambientes',
  description:
    'Inventario, ambientes de formación y control de sesiones — Centro de Gestión Agroempresarial del Oriente, Vélez.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es">
      <body>{children}</body>
    </html>
  );
}
