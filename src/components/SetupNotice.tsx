export default function SetupNotice({ detalle }: { detalle?: string }) {
  return (
    <div className="card">
      <h2>⚙ Falta conectar la base de datos</h2>
      <p>
        La aplicación está lista, pero no encuentra las credenciales de Supabase. Sigue estos pasos:
      </p>
      <ol style={{ paddingLeft: 20 }}>
        <li>
          Crea un proyecto en <strong>supabase.com</strong> (plan gratuito).
        </li>
        <li>
          Abre <strong>SQL Editor</strong> y ejecuta el archivo <code>supabase/schema.sql</code>.
        </li>
        <li>
          En <strong>Project Settings → API</strong> copia la URL, la anon key y la service_role key.
        </li>
        <li>
          Copia <code>.env.example</code> a <code>.env.local</code> y pega los valores. Agrega un{' '}
          <code>AUTH_SECRET</code> largo y aleatorio.
        </li>
        <li>
          Ejecuta <code>npm run seed</code> para crear roles, catálogos y el usuario administrador.
        </li>
        <li>Reinicia el servidor con <code>npm run dev</code>.</li>
      </ol>
      {detalle && (
        <p className="muted">
          <small>Detalle técnico: {detalle}</small>
        </p>
      )}
    </div>
  );
}
