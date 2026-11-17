import Link from 'next/link';
import { requireSession } from '@/lib/auth';
import { dbConfigurada, mensajeError, q } from '@/lib/db';
import {
  CONDICIONES,
  CRITICIDADES,
  ESTADOS_OBJETO,
  claseBadge,
  titulo,
} from '@/lib/utils';
import { crearObjeto } from '@/actions/objetos';
import SetupNotice from '@/components/SetupNotice';
import Alerta from '@/components/Alerta';

export const dynamic = 'force-dynamic';

type SP = {
  q?: string;
  estado?: string;
  ambiente?: string;
  ok?: string;
  error?: string;
};

export default async function InventarioPage({ searchParams }: { searchParams: SP }) {
  await requireSession();

  if (!dbConfigurada()) return <SetupNotice />;

  const busqueda = (searchParams.q || '').trim();
  const estado = searchParams.estado || '';
  const ambiente = searchParams.ambiente || '';

  let objetos: any[] = [];
  let total = 0;
  let ambientes: any[] = [];
  let categorias: any[] = [];
  let error = '';

  try {
    const condiciones: string[] = ['o.activo'];
    const valores: any[] = [];

    const limpio = busqueda.replace(/[%,()]/g, ' ').trim();
    if (limpio) {
      valores.push(`%${limpio}%`);
      const i = valores.length;
      condiciones.push(
        `(o.nombre ilike $${i} or o.codigo_interno ilike $${i} or o.placa_original ilike $${i})`
      );
    }
    if (estado) {
      valores.push(estado);
      condiciones.push(`o.estado = $${valores.length}`);
    }
    if (ambiente && Number.isFinite(Number(ambiente))) {
      valores.push(Number(ambiente));
      condiciones.push(`o.ambiente_id = $${valores.length}`);
    }

    const [res, resAmb, resCat] = await Promise.all([
      q<any>(
        `select o.id, o.codigo_interno, o.nombre, o.descripcion, o.estado, o.condicion,
                o.es_sp, o.cantidad_actual,
                pl.valor as placa_valor,
                c.nombre as categoria_nombre,
                a.codigo as ambiente_codigo, a.nombre as ambiente_nombre,
                count(*) over ()::int as total
           from objeto o
           left join placa pl on pl.id = o.placa_id
           left join categoria c on c.id = o.categoria_id
           left join ambiente a on a.id = o.ambiente_id
          where ${condiciones.join(' and ')}
          order by o.id desc
          limit 300`,
        valores
      ),
      q<any>('select id, codigo, nombre from ambiente where activo order by codigo'),
      q<any>('select id, nombre from categoria where activo order by nombre'),
    ]);

    objetos = res.map((o) => ({
      ...o,
      placa: o.placa_valor ? { valor: o.placa_valor } : null,
      categoria: o.categoria_nombre ? { nombre: o.categoria_nombre } : null,
      ambiente: o.ambiente_codigo
        ? { codigo: o.ambiente_codigo, nombre: o.ambiente_nombre }
        : null,
    }));
    total = res[0]?.total ?? objetos.length;
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

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Inventario</h1>
          <p className="sub">
            {total} objeto{total === 1 ? '' : 's'} activo{total === 1 ? '' : 's'} · el QR es la
            identidad de cada objeto
          </p>
        </div>
        <Link className="btn" href="/etiquetas?tipo=objetos">
          🏷 Imprimir etiquetas
        </Link>
      </div>

      <Alerta ok={searchParams.ok} error={searchParams.error} />

      <form className="filtros" method="get">
        <div className="field" style={{ flex: 1, minWidth: 220 }}>
          <label className="label" htmlFor="q">
            Buscar
          </label>
          <input
            id="q"
            className="input"
            name="q"
            defaultValue={busqueda}
            placeholder="Nombre, código o placa"
          />
        </div>

        <div className="field">
          <label className="label" htmlFor="estado">
            Estado
          </label>
          <select id="estado" className="input" name="estado" defaultValue={estado}>
            <option value="">Todos</option>
            {ESTADOS_OBJETO.map((e) => (
              <option key={e} value={e}>
                {titulo(e)}
              </option>
            ))}
          </select>
        </div>

        <div className="field">
          <label className="label" htmlFor="ambiente">
            Ambiente
          </label>
          <select id="ambiente" className="input" name="ambiente" defaultValue={ambiente}>
            <option value="">Todos</option>
            {ambientes.map((a) => (
              <option key={a.id} value={a.id}>
                {a.codigo} · {a.nombre}
              </option>
            ))}
          </select>
        </div>

        <button className="btn btn-primary" type="submit">
          Filtrar
        </button>
        <Link className="btn" href="/inventario">
          Limpiar
        </Link>
      </form>

      <details className="card" style={{ marginBottom: 14 }}>
        <summary>Registrar un objeto nuevo</summary>

        <form action={crearObjeto}>
          <div className="form-grid">
            <div className="field full">
              <label className="label" htmlFor="nombre">
                Nombre del objeto *
              </label>
              <input
                id="nombre"
                className="input"
                name="nombre"
                required
                placeholder="Ej. Computador de escritorio HP"
              />
            </div>

            <div className="field">
              <label className="label" htmlFor="placa">
                Placa (opcional)
              </label>
              <input
                id="placa"
                className="input"
                name="placa"
                placeholder="Ej. 123456 o S/P"
              />
              <small className="muted">Si no tiene placa escribe S/P.</small>
            </div>

            <div className="field">
              <label className="label" htmlFor="categoria_id">
                Categoría
              </label>
              <select id="categoria_id" className="input" name="categoria_id" defaultValue="">
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
              <select id="ambiente_id" className="input" name="ambiente_id" defaultValue="">
                <option value="">Sin asignar</option>
                {ambientes.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.codigo} · {a.nombre}
                  </option>
                ))}
              </select>
            </div>

            <div className="field">
              <label className="label" htmlFor="estado_obj">
                Estado inicial
              </label>
              <select id="estado_obj" className="input" name="estado" defaultValue="disponible">
                {ESTADOS_OBJETO.map((e) => (
                  <option key={e} value={e}>
                    {titulo(e)}
                  </option>
                ))}
              </select>
            </div>

            <div className="field">
              <label className="label" htmlFor="condicion">
                Condición
              </label>
              <select id="condicion" className="input" name="condicion" defaultValue="bueno">
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
              <select id="criticidad" className="input" name="criticidad" defaultValue="media">
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
                defaultValue="1"
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
                placeholder="Opcional"
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
                placeholder="Marca, modelo, color, serie..."
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
                placeholder="Novedades, accesorios, ubicación exacta..."
              />
            </div>

            <div className="field full">
              <label className="row" style={{ gap: 8 }}>
                <input type="checkbox" name="es_consumible" />
                <span>Es consumible (papelería, aseo, etc.)</span>
              </label>
            </div>
          </div>

          <div className="row">
            <button className="btn btn-primary" type="submit">
              Registrar objeto
            </button>
            <small className="muted">
              El código interno y el QR se generan automáticamente.
            </small>
          </div>
        </form>
      </details>

      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Código</th>
              <th>Objeto</th>
              <th className="hide-sm">Placa</th>
              <th className="hide-sm">Ambiente</th>
              <th>Estado</th>
              <th className="hide-sm">Cond.</th>
              <th className="num hide-sm">Cant.</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {objetos.length === 0 ? (
              <tr>
                <td colSpan={8}>
                  <div className="empty">
                    No hay objetos con esos filtros. Registra el primero arriba.
                  </div>
                </td>
              </tr>
            ) : (
              objetos.map((o) => (
                <tr key={o.id}>
                  <td>
                    <code>{o.codigo_interno}</code>
                  </td>
                  <td>
                    <Link href={`/inventario/${o.id}`}>
                      <strong>{o.nombre}</strong>
                    </Link>
                    {o.categoria && (
                      <div className="meta">
                        <small className="muted">{o.categoria.nombre}</small>
                      </div>
                    )}
                  </td>
                  <td className="hide-sm">
                    {o.es_sp ? <span className="badge">S/P</span> : o.placa?.valor || '—'}
                  </td>
                  <td className="hide-sm">
                    {o.ambiente ? `${o.ambiente.codigo}` : '—'}
                  </td>
                  <td>
                    <span className={claseBadge(o.estado)}>{titulo(o.estado)}</span>
                  </td>
                  <td className="hide-sm">{titulo(o.condicion)}</td>
                  <td className="num hide-sm">{o.cantidad_actual}</td>
                  <td>
                    <Link className="btn btn-sm" href={`/inventario/${o.id}`}>
                      Ver
                    </Link>
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
