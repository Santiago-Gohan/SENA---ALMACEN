'use client';

import { useState } from 'react';

/** Permite pegar la planilla o cargar un archivo CSV/TXT y lo deja en el textarea. */
export default function AreaPlanilla({ name = 'datos' }: { name?: string }) {
  const [texto, setTexto] = useState('');
  const [archivo, setArchivo] = useState('');

  async function leerArchivo(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const contenido = await file.text();
    setTexto(contenido);
    setArchivo(file.name);
  }

  return (
    <>
      <div className="row" style={{ marginBottom: 10 }}>
        <input
          type="file"
          accept=".csv,.tsv,.txt,.tab"
          onChange={leerArchivo}
          className="input"
          style={{ maxWidth: 320 }}
        />
        {archivo && <small className="muted">Archivo: {archivo}</small>}
      </div>

      <textarea
        className="input mono"
        name={name}
        rows={11}
        value={texto}
        onChange={(e) => setTexto(e.target.value)}
        placeholder={'FECHA\tFICHA\tNOMBRES Y APELLIDOS\tPROGRAMA DE FORMACIÓN\tNOMBRE DE AMBIENTE\tHORA DE ENTRADA\tHORA DE SALIDA\tFIRMA\tOBSERVACIONES\n26/08/2026\t3535013\tErika Sánchez\tADSO\t203\t7:00\t12:00\tS\t'}
      />
      <small className="muted">
        Puedes pegar directamente desde Excel (se copia con tabulaciones) o cargar un CSV.
      </small>
    </>
  );
}
