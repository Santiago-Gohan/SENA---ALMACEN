'use client';

export default function Error({ error, reset }: { error: Error; reset: () => void }) {
  return (
    <div className="card">
      <h1>Algo salió mal</h1>
      <p className="muted">{error.message}</p>
      <div className="row">
        <button type="button" className="btn btn-primary" onClick={reset}>
          Reintentar
        </button>
        <a className="btn" href="/">
          Ir al panel
        </a>
      </div>
      <p style={{ marginTop: 14 }}>
        <small className="muted">
          Si el error menciona Supabase o credenciales, revisa el archivo <code>.env.local</code> y
          que el esquema <code>supabase/schema.sql</code> ya se haya ejecutado.
        </small>
      </p>
    </div>
  );
}
