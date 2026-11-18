import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requirePermiso } from '@/lib/auth';
import { dbConfigurada, mensajeError, q, uno } from '@/lib/db';
import {
  CONDICIONES,
  CRITICIDADES,
  ESTADOS_OBJETO,
  claseBadge,
  fmtFechaHora,
  titulo,
} from '@/lib/utils';
import {
  actualizarObjeto,
  cambiarEstadoObjeto,
  darDeBajaObjeto,
  trasladarObjeto,
} from '@/actions/objetos';
import SetupNotice from '@/components/SetupNotice';
import Alerta from '@/components/Alerta';

export const dynamic = 'force-dynamic';

type SP = { ok?: string; error?: string };

export default async function ObjetoDetallePage({
  params,
  searchParams,
}: {
  params: { id: string };
  searchParams: SP;
}) {
  await requirePermiso('inventario_ver');

  if (!dbConfigurada()) return <SetupNotice />;

  const id = Number(params.id);
  if (!Number.isFinite(id)) notFound();

  let objeto: any = null;
  let historial: any[] = [];
  let ambientes: any[] = [];
  let categorias: any[] = [];
  let error = '';

  try {
    const [res, resHist, resAmb, resCat] = await Promise.all([
      uno<any>(
        `select o.*,
                pl.valor as placa_valor,
                c.nombre as categoria_nombre,
                a.codigo as ambiente_codigo, a.nombre as ambiente_nombre
           from objeto o
           left join placa pl on pl.id = o.placa_id
           left join categoria c on c.id = o.categoria_id
           left join ambiente a on a.id = o.ambiente_id
          where o.id = $1`,
        [id]
      ),
      q<any>(
        `select h.id, h.tipo_evento, h.detalle, h.fecha,
                ao.codigo as origen_codigo, ad.codigo as destino_codigo
           from objeto_historial h
           left join ambiente ao on ao.id = h.ambiente_origen_id
           left join ambiente ad on ad.id = h.ambiente_destino_id
          where h.objeto_id = $1
          order by h.fecha desc
          limit 25`,
        [id]
      ),
      q<any>('select id, codigo, nombre from ambiente where activo order by codigo'),
      q<any>('select id, nombre from categoria where activo order by nombre'),
    ]);

    objeto = res
      ? {
          ...res,
          placa: res.placa_valor ? { valor: res.placa_valor } : null,
          categoria: res.categoria_nombre ? { nombre: res.categoria_nombre } : null,
          ambiente: res.ambiente_codigo
            ? { codigo: res.ambiente_codigo, nombre: res.ambiente_nombre }
            : null,
        }
      : null;
    historial = resHist.map((h) => ({
      ...h,
      ambiente_origen: h.origen_codigo ? { codigo: h.origen_codigo } : null,
      ambiente_destino: h.destino_codigo ? { codigo: h.destino_codigo } : null,
    }));
    ambientes = resAmb;
    categorias = resCat;
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

  if (!objeto) notFound();

  return (
    <>
      <div className="page-head">
        <div>
          <p className="sub">
            <Link href="/inventario">← Inventario</Link>
          </p>
          <h1>{objeto.nombre}</h1>
          <p className="sub">
            <code>{objeto.codigo_interno}</code> ·{' '}
            <span className={claseBadge(objeto.estado)}>{titulo(objeto.estado)}</span>{' '}
            {objeto.activo ? null : <span className="badge danger">Inactivo</span>}
          </p>
        </div>

        <Link className="btn" href={`/etiquetas?tipo=objetos&q=${encodeURIComponent(objeto.codigo_interno)}`}>
          🏷 Etiqueta
        </Link>
      </div>

      <Alerta ok={searchParams.ok} error={searchParams.error} />

      <div className="grid cols-3">
        <div className="card" style={{ gridColumn: 'span 2' }}>
          <h2>Datos del objeto</h2>

          <form action={actualizarObjeto}>
            <input type="hidden" name="id" value={objeto.id} />

            <div className="form-grid">
              <div className="field full">
                <label className="label" htmlFor="nombre">
                  Nombre *
                </label>
                <input
                  id="nombre"
                  className="input"
                  name="nombre"
                  defaultValue={objeto.nombre}
                  required
                />
              </div>

              <div className="field">
                <label className="label" htmlFor="placa">
                  Placa
                </label>
                <input
                  id="placa"
                  className="input"
                  name="placa"
                  defaultValue={objeto.es_sp ? 'S/P' : objeto.placa_original || objeto.placa?.valor || ''}
                  placeholder="S/P"
                />
              </div>

              <div className="field">
                <label className="label" htmlFor="categoria_id">
                  Categoría
                </label>
                <select
                  id="categoria_id"
                  className="input"
                  name="categoria_id"
                  defaultValue={objeto.categoria_id ?? ''}
                >
                  <option value="">Sin categoría</option>
                  {categorias.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.nombre}
                    </option>
                  ))}
                </select>
              </div>

              <div className="field">
                <label className="label" htmlFor="ambiente_id">
                  Ambiente
                </label>
                <select
                  id="ambiente_id"
                  className="input"
                  name="ambiente_id"
                  defaultValue={objeto.ambiente_id ?? ''}
                >
                  <option value="">Sin asignar</option>
                  {ambientes.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.codigo} · {a.nombre}
                    </option>
                  ))}
                </select>
              </div>

              <div className="field">
                <label className="label" htmlFor="condicion">
                  Condición
                </label>
                <select
                  id="condicion"
                  className="input"
                  name="condicion"
                  defaultValue={objeto.condicion}
                >
                  {CONDICIONES.map((c) => (
                    <option key={c} value={c}>
                      {titulo(c)}
                    </option>
                  ))}
                </select>
              </div>

              <div className="field">
                <label className="label" htmlFor="criticidad">
                  Criticidad
                </label>
                <select
                  id="criticidad"
                  className="input"
                  name="criticidad"
                  defaultValue={objeto.criticidad}
                >
                  {CRITICIDADES.map((c) => (
                    <option key={c} value={c}>
                      {titulo(c)}
                    </option>
                  ))}
                </select>
              </div>

              <div className="field">
                <label className="label" htmlFor="cantidad_actual">
                  Cantidad
                </label>
                <input
                  id="cantidad_actual"
                  className="input"
                  name="cantidad_actual"
                  type="number"
                  min="1"
                  defaultValue={objeto.cantidad_actual}
                />
              </div>

              <div className="field">
                <label className="label" htmlFor="stock_minimo">
                  Stock mínimo
                </label>
                <input
                  id="stock_minimo"
                  className="input"
                  name="stock_minimo"
                  type="number"
                  min="0"
                  defaultValue={objeto.stock_minimo ?? ''}
                />
              </div>

              <div className="field full">
                <label className="label" htmlFor="descripcion">
                  Descripción
                </label>
                <textarea
                  id="descripcion"
                  className="input"
                  name="descripcion"
                  rows={2}
                  defaultValue={objeto.descripcion || ''}
                />
              </div>

              <div className="field full">
                <label className="label" htmlFor="observaciones">
                  Observaciones
                </label>
                <textarea
                  id="observaciones"
                  className="input"
                  name="observaciones"
                  rows={2}
                  defaultValue={objeto.observaciones || ''}
                />
              </div>

              <div className="field full">
                <label className="row" style={{ gap: 8 }}>
                  <input
                    type="checkbox"
                    name="es_consumible"
                    defaultChecked={objeto.es_consumible}
                  />
                  <span>Es consumible</span>
                </label>
              </div>
            </div>

            <button className="btn btn-primary" type="submit">
              Guardar cambios
            </button>
          </form>
        </div>

        <div className="card" style={{ textAlign: 'center' }}>
          <h2>QR del objeto</h2>
          <div className="qr-box">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={`/api/qr?data=${encodeURIComponent(objeto.codigo_qr)}&size=260`}
              alt={`QR de ${objeto.codigo_interno}`}
              width={150}
              height={150}
            />
            <code>{objeto.codigo_qr}</code>
          </div>
          <p className="muted" style={{ marginTop: 10 }}>
            <small>
              {objeto.placa
                ? `Placa ${objeto.placa.valor}`
                : objeto.es_sp
                ? 'Sin placa (S/P)'
                : 'Sin placa registrada'}
            </small>
          </p>
          <p className="muted">
            <small>
              {objeto.ambiente
                ? `Ubicación: ${objeto.ambiente.codigo} · ${objeto.ambiente.nombre}`
                : 'Sin ambiente asignado'}
            </small>
          </p>
        </div>
      </div>

      <div className="grid cols-3" style={{ marginTop: 14 }}>
        <div className="card">
          <h2>Trasladar</h2>
          <form action={trasladarObjeto}>
            <input type="hidden" name="id" value={objeto.id} />
            <div className="field">
              <label className="label" htmlFor="ambiente_destino_id">
                Ambiente destino *
              </label>
              <select
                id="ambiente_destino_id"
                className="input"
                name="ambiente_destino_id"
                required
                defaultValue=""
              >
                <option value="">Selecciona</option>
                {ambientes
                  .filter((a) => a.id !== objeto.ambiente_id)
                  .map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.codigo} · {a.nombre}
                    </option>
                  ))}
              </select>
            </div>
            <div className="field">
              <label className="label" htmlFor="detalle">
                Detalle
              </label>
              <input
                id="detalle"
                className="input"
                name="detalle"
                placeholder="Motivo del traslado"
              />
            </div>
            <button className="btn btn-primary" type="submit">
              Trasladar
            </button>
          </form>
        </div>

        <div className="card">
          <h2>Cambiar estado</h2>
          <form action={cambiarEstadoObjeto}>
            <input type="hidden" name="id" value={objeto.id} />
            <div className="field">
              <label className="label" htmlFor="estado">
                Estado
              </label>
              <select
                id="estado"
                className="input"
                name="estado"
                defaultValue={objeto.estado}
              >
                {ESTADOS_OBJETO.map((e) => (
                  <option key={e} value={e}>
                    {titulo(e)}
                  </option>
                ))}
              </select>
            </div>
            <button className="btn" type="submit">
              Actualizar estado
            </button>
          </form>
        </div>

        <div className="card">
          <h2>Dar de baja</h2>
          <p className="muted">
            <small>
              El objeto deja de aparecer en el inventario activo, pero su historial se conserva.
            </small>
          </p>
          <details>
            <summary style={{ cursor: 'pointer', fontWeight: 600, color: 'var(--rojo)' }}>
              Confirmar baja
            </summary>
            <form action={darDeBajaObjeto} style={{ marginTop: 10 }}>
              <input type="hidden" name="id" value={objeto.id} />
              <div className="field">
                <label className="label" htmlFor="detalle_baja">
                  Motivo
                </label>
                <input
                  id="detalle_baja"
                  className="input"
                  name="detalle"
                  placeholder="Ej. Obsoleto, irreparable..."
                />
              </div>
              <button className="btn btn-danger" type="submit">
                Dar de baja definitivamente
              </button>
            </form>
          </details>
        </div>
      </div>

      <div className="seccion">
        <h2>Historial del objeto</h2>
      </div>

      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Fecha</th>
              <th>Evento</th>
              <th>Detalle</th>
              <th className="hide-sm">Origen → destino</th>
            </tr>
          </thead>
          <tbody>
            {historial.length === 0 ? (
              <tr>
                <td colSpan={4}>
                  <div className="empty">Sin movimientos registrados.</div>
                </td>
              </tr>
            ) : (
              historial.map((h) => (
                <tr key={h.id}>
                  <td>{fmtFechaHora(h.fecha)}</td>
                  <td>
                    <span className={claseBadge(h.tipo_evento)}>{titulo(h.tipo_evento)}</span>
                  </td>
                  <td>{h.detalle || '—'}</td>
                  <td className="hide-sm">
                    {h.ambiente_origen?.codigo || '—'} → {h.ambiente_destino?.codigo || '—'}
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

