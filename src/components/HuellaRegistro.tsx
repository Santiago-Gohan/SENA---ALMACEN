'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

type Props = {
  activa: boolean;
  yaTiene?: boolean;
};

/**
 * Inscripción de la huella del usuario actual.
 * El navegador pide la huella (o Windows Hello / Touch ID) y devuelve una
 * llave pública; la huella como tal nunca sale del dispositivo.
 */
export default function HuellaRegistro({ activa, yaTiene = false }: Props) {
  const router = useRouter();
  const [etiqueta, setEtiqueta] = useState('');
  const [cargando, setCargando] = useState(false);
  const [ok, setOk] = useState('');
  const [error, setError] = useState('');

  async function inscribir() {
    setCargando(true);
    setOk('');
    setError('');

    try {
      const resOpciones = await fetch('/api/huella/registro/opciones', { method: 'POST' });
      const opciones = await resOpciones.json();
      if (!resOpciones.ok) throw new Error(opciones.error || 'No se pudo iniciar el registro');

      const { startRegistration } = await import('@simplewebauthn/browser');
      const respuesta = await startRegistration({ optionsJSON: opciones });

      const res = await fetch('/api/huella/registro/verificar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ response: respuesta, label: etiqueta }),
      });
      const datos = await res.json();
      if (!res.ok) throw new Error(datos.error || 'No se pudo guardar la huella');

      setOk(`Huella inscrita en ${datos.etiqueta ?? 'este dispositivo'}`);
      setEtiqueta('');
      router.refresh();
    } catch (e) {
      const mensaje = e instanceof Error ? e.message : 'No se pudo inscribir la huella';
      setError(
        /not allowed|abort/i.test(mensaje)
          ? 'Se canceló la validación en el dispositivo.'
          : mensaje
      );
    } finally {
      setCargando(false);
    }
  }

  if (!activa) {
    return (
      <div className="alert error">
        ⚠ La huella está desactivada. El administrador debe activarla en Configuración.
      </div>
    );
  }

  return (
    <div>
      <p className="muted">
        <small>
          {yaTiene
            ? 'Puedes inscribir otro dispositivo (otro computador o celular) con la misma huella.'
            : 'Inscribe la huella de este dispositivo. Sirve para identificarte en portería sin firmar.'}
        </small>
      </p>

      <div className="field">
        <label className="label" htmlFor="huella-etiqueta">
          Nombre del dispositivo (opcional)
        </label>
        <input
          id="huella-etiqueta"
          className="input"
          value={etiqueta}
          onChange={(e) => setEtiqueta(e.target.value)}
          placeholder="Ej. Portátil de portería"
          maxLength={80}
        />
      </div>

      <button className="btn btn-primary" type="button" onClick={inscribir} disabled={cargando}>
        {cargando ? 'Esperando al dispositivo…' : '☝ Inscribir mi huella'}
      </button>

      {ok && <div className="alert ok" style={{ marginTop: 12 }}>✓ {ok}</div>}
      {error && <div className="alert error" style={{ marginTop: 12 }}>⚠ {error}</div>}

      <p className="muted" style={{ marginTop: 12 }}>
        <small>
          La huella no se almacena: el dispositivo guarda una llave privada y el sistema solo
          conserva la llave pública. Requiere un equipo con lector de huella, Windows Hello,
          Touch ID o similar.
        </small>
      </p>
    </div>
  );
}
