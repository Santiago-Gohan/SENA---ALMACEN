import { createClient, type SupabaseClient } from '@supabase/supabase-js';

let cliente: SupabaseClient | null = null;

/**
 * Cliente de Supabase para el servidor.
 * Usa la service_role key: NUNCA debe importarse desde un componente cliente.
 */
export function db(): SupabaseClient {
  if (cliente) return cliente;

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !key) {
    throw new Error(
      'Falta configurar Supabase. Copia .env.example a .env.local y completa NEXT_PUBLIC_SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY.'
    );
  }

  cliente = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { 'x-application-name': 'sena-almacen' } },
  });

  return cliente;
}

export function dbConfigurada(): boolean {
  return Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY);
}

export function mensajeError(e: unknown): string {
  if (!e) return 'Error desconocido';
  if (e instanceof Error) return e.message;
  if (typeof e === 'string') return e;
  const any = e as any;
  return any.message || any.details || any.hint || JSON.stringify(e);
}
