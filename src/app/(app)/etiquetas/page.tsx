import Link from 'next/link';
import { headers } from 'next/headers';
import { requirePermiso } from '@/lib/auth';
import { dbConfigurada, mensajeError, q } from '@/lib/db';
import { fmtFecha, hoyISO } from '@/lib/utils';
import PrintButton from '@/components/PrintButton';
import SetupNotice from '@/components/SetupNotice';
import Alerta from '@/components/Alerta';

export const dynamic = 'force-dynamic';

type SP = { tipo?: string; q?: string };

export default async function EtiquetasPage({ searchParams }: { searchParams: SP }) {
  await requirePermiso('etiquetas');

  if (!dbConfigurada()) return <SetupNotice />;

  const tipo = searchParams.tipo === 'objetos' ? 'objetos' : 'ambientes';
  const busqueda = (searchParams.q || '').trim();

  // Los QR de ambientes codifican una URL absoluta: al escanear con la cámara
  // del celular se abre directamente /a/<codigo>.
  const h = headers();
  const host = h.get('x-forwarded-host') || h.get('host') || 'localhost:3000';
  const proto =
    h.get('x-forwarded-proto') || (host.startsWith('localhost') || host.startsWith('127.0.0.1') ? 'http' : 'https');
  const baseUrl = `${proto}://${host}`;

  let items: any[] = [];
  let error = '';

  try {
    const limpio = busqueda.replace(/[%,()]/g, ' ').trim();
    const patron = limpio ? `%${limpio}%` : null;

    if (tipo === 'objetos') {
      const filas = await q<any>(
        `select o.id, o.codigo_interno, o.nombre, o.codigo_qr, a.codigo as ambiente_codigo
           from objeto o
           left join ambiente a on a.id = o.ambiente_id
          where o.activo
            and ($1::text is null or o.nombre ilike $1 or o.codigo_interno ilike $1)
          order by o.codigo_interno
          limit 400`,
        [patron]
      );
      items = filas.map((o) => ({
        ...o,
        ambiente: o.ambiente_codigo ? { codigo: o.ambiente_codigo } : null,
      }));
    } else {
      items = await q<any>(
        `select id, codigo, nombre, codigo_qr
           from ambiente
          where activo
            and ($1::text is null or codigo ilike $1 or nombre ilike $1)
          order by codigo
          limit 400`,
        [patron]
      );
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
      <div className="page-head no-print">
        <div>
          <h1>Etiquetas QR</h1>
          <p className="sub">
            {items.length} etiqueta{items.length === 1 ? '' : 's'} lista
            {items.length === 1 ? '' : 's'} para imprimir
          </p>
        </div>
        <div className="row">
          <Link className="btn" href="/etiquetas?tipo=ambientes">
            Ambientes
          </Link>
          <Link className="btn" href="/etiquetas?tipo=objetos">
            Objetos
          </Link>
          <PrintButton />
        </div>
      </div>

      <form className="filtros no-print" method="get">
        <input type="hidden" name="tipo" value={tipo} />
        <div className="field" style={{ flex: 1, minWidth: 220 }}>
          <label className="label" htmlFor="q">
            Filtrar
          </label>
          <input
            id="q"
            className="input"
            name="q"
            defaultValue={busqueda}
            placeholder={tipo === 'ambientes' ? 'Código o nombre' : 'Código o nombre del objeto'}
          />
        </div>
        <button className="btn btn-primary" type="submit">
          Filtrar
        </button>
        <Link className="btn" href={`/etiquetas?tipo=${tipo}`}>
          Limpiar
        </Link>
      </form>

      <div className="solo-impresion" style={{ marginBottom: 10 }}>
        <strong>CONTROL DE AMBIENTES DE FORMACIÓN</strong>
        <div>
          Centro de Gestión Agroempresarial del Oriente · Vélez — {fmtFecha(hoyISO())}
        </div>
      </div>

      {items.length === 0 ? (
        <div className="card empty">No hay registros para imprimir con ese filtro.</div>
      ) : (
        <div className="print-grid">
          {items.map((it) => (
            <div className="etiqueta" key={it.id}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={`/api/qr?data=${encodeURIComponent(
                  tipo === 'ambientes'
                    ? `${baseUrl}/a/${encodeURIComponent(it.codigo)}`
                    : it.codigo_qr
                )}&size=240`}
                alt={`QR ${tipo === 'ambientes' ? it.codigo : it.codigo_interno}`}
                width={112}
                height={112}
              />
              <div className="cod">
                {tipo === 'ambientes' ? it.codigo : it.codigo_interno}
              </div>
              <div className="nom">{it.nombre}</div>
              <div className="pie">
                {tipo === 'ambientes'
                  ? 'Ambiente · SENA CGAO Oriente'
                  : it.ambiente
                  ? `Ambiente ${it.ambiente.codigo}`
                  : 'SENA · Almacén'}
              </div>
            </div>
          ))}
        </div>
      )}

      <p className="muted no-print" style={{ marginTop: 16 }}>
        <small>
          Imprime en papel adhesivo o pega la etiqueta en el objeto. El QR de cada ambiente abre{' '}
          <code>{baseUrl}/a/código</code> al escanearlo con la cámara del celular; el de los objetos
          codifica <code>SENA-OBJ:código</code>.
        </small>
      </p>
    </>
  );
}
