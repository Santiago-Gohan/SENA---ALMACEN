import { requireSession } from '@/lib/auth';
import { db, dbConfigurada, mensajeError } from '@/lib/supabase';
import { JORNADAS, claseBadge, titulo } from '@/lib/utils';
import { cambiarEstadoFicha, crearFicha, crearPrograma } from '@/actions/fichas';
import SetupNotice from '@/components/SetupNotice';
import Alerta from '@/components/Alerta';

export const dynamic = 'force-dynamic';

type SP = { ok?: string; error?: string };

const NIVELES = ['tecnico', 'tecnologo', 'especializacion', 'curso'];

export default async function FichasPage({ searchParams }: { searchParams: SP }) {
  await requireSession();

  if (!dbConfigurada()) return <SetupNotice />;

  let fichas: any[] = [];
  let programas: any[] = [];
  let error = '';

  try {
    const sb = db();

    const [resFichas, resProgramas] = await Promise.all([
      sb
        .from('ficha')
        .select('id, codigo, jornada, activa, created_at, programa:programa_id(id, nombre)')
        .order('codigo', { ascending: false })
        .limit(500),
      sb.from('programa').select('id, codigo, nombre, nivel, activo').order('nombre'),
    ]);

    if (resFichas.error) throw new Error(resFichas.error.message);

    fichas = resFichas.data || [];
    programas = resProgramas.data || [];
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
          <h1>Fichas y programas</h1>
          <p className="sub">
            Catálogo de formación · la ficha es obligatoria para registrar una entrada
          </p>
        </div>
        <span className="badge">{fichas.length} fichas</span>
      </div>

      <Alerta ok={searchParams.ok} error={searchParams.error} />

      <div className="grid cols-2">
        <div className="card">
          <h2>Crear ficha</h2>

          <form action={crearFicha}>
            <div className="form-grid">
              <div className="field">
                <label className="label" htmlFor="codigo_ficha">
                  Código de ficha *
                </label>
                <input
                  id="codigo_ficha"
                  className="input"
                  name="codigo"
                  inputMode="numeric"
                  pattern="[0-9]{7,8}"
                  placeholder="Ej. 3535013"
                  required
                />
                <small className="muted">7 u 8 dígitos.</small>
              </div>

              <div className="field">
                <label className="label" htmlFor="jornada">
                  Jornada
                </label>
                <select id="jornada" className="input" name="jornada" defaultValue="mañana">
                  {JORNADAS.map((j) => (
                    <option key={j} value={j}>
                      {titulo(j)}
                    </option>
                  ))}
                </select>
              </div>

              <div className="field full">
                <label className="label" htmlFor="programa_ficha">
                  Programa de formación
                </label>
                <select id="programa_ficha" className="input" name="programa_id" defaultValue="">
                  <option value="">Sin programa (asignar después)</option>
                  {programas.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.nombre}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <button className="btn btn-primary" type="submit">
              Crear ficha
            </button>
          </form>
        </div>

        <div className="card">
          <h2>Crear programa</h2>

          <form action={crearPrograma}>
            <div className="form-grid">
              <div className="field">
                <label className="label" htmlFor="codigo_programa">
                  Código *
                </label>
                <input
                  id="codigo_programa"
                  className="input"
                  name="codigo"
                  placeholder="Ej. 228106"
                  required
                />
              </div>

              <div className="field">
                <label className="label" htmlFor="nivel">
                  Nivel
                </label>
                <select id="nivel" className="input" name="nivel" defaultValue="tecnologo">
                  {NIVELES.map((n) => (
                    <option key={n} value={n}>
                      {titulo(n)}
                    </option>
                  ))}
                </select>
              </div>

              <div className="field full">
                <label className="label" htmlFor="nombre_programa">
                  Nombre del programa *
                </label>
                <input
                  id="nombre_programa"
                  className="input"
                  name="nombre"
                  placeholder="Ej. Análisis y Desarrollo de Software"
                  required
                />
              </div>
            </div>

            <button className="btn btn-primary" type="submit">
              Crear programa
            </button>
          </form>
        </div>
      </div>

      <div className="seccion">
        <h2>Fichas registradas</h2>
      </div>

      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Ficha</th>
              <th>Programa</th>
              <th className="hide-sm">Jornada</th>
              <th>Estado</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {fichas.length === 0 ? (
              <tr>
                <td colSpan={5}>
                  <div className="empty">Aún no hay fichas. Crea la primera arriba.</div>
                </td>
              </tr>
            ) : (
              fichas.map((f) => (
                <tr key={f.id}>
                  <td>
                    <code>{f.codigo}</code>
                  </td>
                  <td>{f.programa?.nombre ?? 'Sin programa'}</td>
                  <td className="hide-sm">{titulo(f.jornada)}</td>
                  <td>
                    {f.activa ? (
                      <span className="badge ok">Activa</span>
                    ) : (
                      <span className="badge danger">Inactiva</span>
                    )}
                  </td>
                  <td>
                    <form action={cambiarEstadoFicha}>
                      <input type="hidden" name="id" value={f.id} />
                      <input type="hidden" name="activa" value={f.activa ? 'false' : 'true'} />
                      <button className="btn btn-sm" type="submit">
                        {f.activa ? 'Desactivar' : 'Activar'}
                      </button>
                    </form>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <div className="seccion">
        <h2>Programas</h2>
      </div>

      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Código</th>
              <th>Programa</th>
              <th>Nivel</th>
              <th>Estado</th>
            </tr>
          </thead>
          <tbody>
            {programas.length === 0 ? (
              <tr>
                <td colSpan={4}>
                  <div className="empty">Sin programas registrados.</div>
                </td>
              </tr>
            ) : (
              programas.map((p) => (
                <tr key={p.id}>
                  <td>
                    <code>{p.codigo}</code>
                  </td>
                  <td>{p.nombre}</td>
                  <td>{titulo(p.nivel)}</td>
                  <td>
                    {p.activo ? (
                      <span className="badge ok">Activo</span>
                    ) : (
                      <span className="badge danger">Inactivo</span>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <p className="aviso-legal" style={{ marginTop: 18 }}>
        Los aprendices no necesitan usuario para el control de ambientes: la ficha identifica al
        grupo y el instructor firma la sesión.
      </p>
    </>
  );
}
