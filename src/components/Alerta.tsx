export default function Alerta({ ok, error }: { ok?: string; error?: string }) {
  if (error) return <div className="alert error">⚠ {error}</div>;
  if (ok) return <div className="alert ok">✓ {ok}</div>;
  return null;
}
