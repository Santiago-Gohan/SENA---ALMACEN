import Link from 'next/link';
import { puede, requirePermiso } from '@/lib/auth';
import { dbConfigurada, mensajeError, q } from '@/lib/db';
import { TIPOS_AMBIENTE, titulo } from '@/lib/utils';
import { crearAmbiente } from '@/actions/ambientes';
import SetupNotice from '@/components/SetupNotice';
import Alerta from '@/components/Alerta';

export const dynamic = 'force-dynamic';

type SP = { ok?: string; error?: string };

export default async function AmbientesPage({ searchParams }: { searchParams: SP }) {
  const usuario = await requirePermiso('ambientes_ver');

  if (!dbConfigurada()) return <SetupNotice />;

  let ambientes: any[] = [];
  let conteoObjetos: Record<number, number> = {};
  let conteoAbiertas: Record<number, number> = {};
  let error = '';

  try {
    ambientes = await q<any>(
      `select a.id, a.codigo, a.nombre, a.bloque, a.piso, a.capacidad, a.tipo,
              a.activo, a.codigo_qr,
              (select count(*) from objeto o where o.ambiente_id = a.id and o.activo)::int as objetos,
              (select count(*) from sesion_ambiente s
                where s.ambiente_id = a.id and s.hora_salida is null)::int as abiertas
         from ambiente a
        order by a.codigo`
    );

    for (const a of ambientes) {
      conteoObjetos[a.id] = a.objetos || 0;
      conteoAbiertas[a.id] = a.abiertas || 0;
    }
  } catch (e) {
    error = mensajeError(e);
  }

  if (error) {
    return (
      <>
        <Alerta error={error} />
        <SetupNotice detalle={error} />
      </>
    );
  }

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Ambientes</h1>
          <p className="sub">
            {ambientes.length} ambiente{ambientes.length === 1 ? '' : 's'} · cada uno tiene su QR
            para registrar la entrada del instructor
          </p>
        </div>
        <Link className="btn" href="/etiquetas?tipo=ambientes">
          🏷 Imprimir QRs
        </Link>
      </div>

      <Alerta ok={searchParams.ok} error={searchParams.error} />

      <details className="card" style={{ marginBottom: 14 }}>
        <summary>Crear un ambiente nuevo</summary>

        <form action={crearAmbiente}>
          <div className="form-grid">
            <div className="field">
              <label className="label" htmlFor="codigo">
                Código *
              </label>
              <input
                id="codigo"
                className="input"
                name="codigo"
                required
                placeholder="Ej. 203"
              />
            </div>

            <div className="field">
              <label className="label" htmlFor="nombre">
                Nombre *
              </label>
              <input
                id="nombre"
                className="input"
                name="nombre"
                required
                placeholder="Ej. Aula de sistemas"
              />
            </div>

            <div className="field">
              <label className="label" htmlFor="tipo">
                Tipo
              </label>
              <select id="tipo" className="input" name="tipo" defaultValue="aula">
                {TIPOS_AMBIENTE.map((t) => (
                  <option key={t} value={t}>
                    {titulo(t)}
                  </option>
                ))}
              </select>
            </div>

            <div className="field">
              <label className="label" htmlFor="capacidad">
                Capacidad
              </label>
              <input
                id="capacidad"
                className="input"
                name="capacidad"
                type="number"
                min="0"
                placeholder="Aprendices"
              />
            </div>

            <div className="field">
              <label className="label" htmlFor="bloque">
                Bloque
              </label>
              <input id="bloque" className="input" name="bloque" placeholder="Ej. B" />
            </div>

            <div className="field">
              <label className="label" htmlFor="piso">
                Piso
              </label>
              <input id="piso" className="input" name="piso" type="number" min="0" />
            </div>
          </div>

          <button className="btn btn-primary" type="submit">
            Crear ambiente
          </button>
        </form>
      </details>

      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Código</th>
              <th>Ambiente</th>
              <th className="hide-sm">Ubicación</th>
              <th className="hide-sm">Tipo</th>
              <th className="num">Objetos</th>
              <th className="num">Abiertas</th>
              <th>Estado</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {ambientes.length === 0 ? (
              <tr>
                <td colSpan={8}>
                  <div className="empty">Aún no hay ambientes. Crea el primero arriba.</div>
                </td>
              </tr>
            ) : (
              ambientes.map((a) => (
                <tr key={a.id}>
                  <td>
                    <code>{a.codigo}</code>
                  </td>
                  <td>
                    <Link href={`/ambientes/${a.id}`}>
                      <strong>{a.nombre}</strong>
                    </Link>
                  </td>
                  <td className="hide-sm">
                    {[a.bloque ? `Bloque ${a.bloque}` : '', a.piso ? `Piso ${a.piso}` : '']
                      .filter(Boolean)
                      .join(' · ') || '—'}
                  </td>
                  <td className="hide-sm">{titulo(a.tipo)}</td>
                  <td className="num">{conteoObjetos[a.id] || 0}</td>
                  <td className="num">
                    {conteoAbiertas[a.id] ? (
                      <span className="badge info">{conteoAbiertas[a.id]}</span>
                    ) : (
                      '—'
                    )}
                  </td>
                  <td>
                    {a.activo ? (
                      <span className="badge ok">Activo</span>
                    ) : (
                      <span className="badge danger">Inactivo</span>
                    )}
                  </td>
                  <td>
                    <div className="row" style={{ gap: 6 }}>
                      <Link className="btn btn-sm" href={`/ambientes/${a.id}`}>
                        Ver
                      </Link>
                      {puede(usuario, 'verificar') && a.activo && (
                        <Link className="btn btn-sm btn-primary" href={`/a/${a.codigo}`}>
                          Verificar
                        </Link>
                      )}
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </>
  );
}
