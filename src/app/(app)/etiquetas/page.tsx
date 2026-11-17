import Link from 'next/link';
import { requireSession } from '@/lib/auth';
import { db, dbConfigurada, mensajeError } from '@/lib/supabase';
import { fmtFecha, hoyISO } from '@/lib/utils';
import PrintButton from '@/components/PrintButton';
import SetupNotice from '@/components/SetupNotice';
import Alerta from '@/components/Alerta';

export const dynamic = 'force-dynamic';

type SP = { tipo?: string; q?: string };

export default async function EtiquetasPage({ searchParams }: { searchParams: SP }) {
  await requireSession();

  if (!dbConfigurada()) return <SetupNotice />;

  const tipo = searchParams.tipo === 'objetos' ? 'objetos' : 'ambientes';
  const q = (searchParams.q || '').trim();

  let items: any[] = [];
  let error = '';

  try {
    const sb = db();
    const limpio = q.replace(/[%,()]/g, ' ').trim();

    if (tipo === 'objetos') {
      let consulta = sb
        .from('objeto')
        .select('id, codigo_interno, nombre, codigo_qr, ambiente:ambiente_id(codigo)')
        .eq('activo', true)
        .order('codigo_interno')
        .limit(400);
      if (limpio) {
        consulta = consulta.or(
          `nombre.ilike.%${limpio}%,codigo_interno.ilike.%${limpio}%`
        );
      }
      const res = await consulta;
      if (res.error) throw new Error(res.error.message);
      items = res.data || [];
    } else {
      let consulta = sb
        .from('ambiente')
        .select('id, codigo, nombre, codigo_qr')
        .eq('activo', true)
        .order('codigo')
        .limit(400);
      if (limpio) {
        consulta = consulta.or(`codigo.ilike.%${limpio}%,nombre.ilike.%${limpio}%`);
      }
      const res = await consulta;
      if (res.error) throw new Error(res.error.message);
      items = res.data || [];
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
            defaultValue={q}
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
                src={`/api/qr?data=${encodeURIComponent(it.codigo_qr)}&size=240`}
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
          Imprime en papel adhesivo o pega la etiqueta en el objeto. El QR codifica{' '}
          <code>SENA-AMB:código</code> o <code>SENA-OBJ:código</code>, así el escáner sabe qué
          abrir.
        </small>
      </p>
    </>
  );
}
