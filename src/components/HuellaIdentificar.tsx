'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

type Props = {
  activa: boolean;
  identificado?: string;
};

/**
 * Identificación del instructor con la huella.
 * Devuelve una cookie corta de identidad para que vigilancia registre el
 * préstamo sin cerrar su propia sesión.
 */
export default function HuellaIdentificar({ activa, identificado }: Props) {
  const router = useRouter();
  const [cargando, setCargando] = useState(false);
  const [ok, setOk] = useState('');
  const [error, setError] = useState('');

  async function identificar() {
    setCargando(true);
    setOk('');
    setError('');

    try {
      const resOpciones = await fetch('/api/huella/identificar/opciones', { method: 'POST' });
      const opciones = await resOpciones.json();
      if (!resOpciones.ok) throw new Error(opciones.error || 'No se pudo iniciar la identificación');

      const { startAuthentication } = await import('@simplewebauthn/browser');
      const respuesta = await startAuthentication({ optionsJSON: opciones });

      const res = await fetch('/api/huella/identificar/verificar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ response: respuesta }),
      });
      const datos = await res.json();
      if (!res.ok) throw new Error(datos.error || 'No se pudo verificar la huella');

      setOk(`Instructor identificado: ${datos.nombre}`);
      router.refresh();
    } catch (e) {
      const mensaje = e instanceof Error ? e.message : 'No se pudo verificar la huella';
      setError(
        /not allowed|abort/i.test(mensaje)
          ? 'Se canceló la validación en el dispositivo.'
          : mensaje
      );
    } finally {
      setCargando(false);
    }
  }

  if (!activa) return null;

  return (
    <div>
      <button
        className="btn btn-primary"
        type="button"
        onClick={identificar}
        disabled={cargando}
        style={{ width: '100%', justifyContent: 'center', padding: '14px 16px' }}
      >
        {cargando ? 'Esperando la huella…' : '☝ Identificar instructor con huella'}
      </button>

      {identificado && !ok && (
        <p className="muted" style={{ marginTop: 8 }}>
          <small>Ya hay una identidad verificada: {identificado}</small>
        </p>
      )}

      {ok && <div className="alert ok" style={{ marginTop: 12 }}>✓ {ok}</div>}
      {error && <div className="alert error" style={{ marginTop: 12 }}>⚠ {error}</div>}
    </div>
  );
}
