export default function SetupNotice({ detalle }: { detalle?: string }) {
  return (
    <div className="card">
      <h2>⚙ Falta conectar la base de datos</h2>
      <p>
        La aplicación está lista, pero no encuentra la cadena de conexión a PostgreSQL (Neon).
        Sigue estos pasos:
      </p>
      <ol style={{ paddingLeft: 20 }}>
        <li>
          Entra a <strong>console.neon.tech</strong> y abre tu proyecto (o crea uno gratuito).
        </li>
        <li>
          Crea una base llamada <code>sena_almacen</code> y copia su cadena de conexión
          (<em>Connection string</em>).
        </li>
        <li>
          Copia <code>.env.example</code> a <code>.env.local</code> y pega la cadena en{' '}
          <code>DATABASE_URL</code>. Agrega un <code>AUTH_SECRET</code> largo y aleatorio.
        </li>
        <li>
          Ejecuta <code>npm run db:setup</code> para crear las tablas y luego{' '}
          <code>npm run seed</code> para los datos iniciales.
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
