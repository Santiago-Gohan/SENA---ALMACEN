'use client';

import { useEffect, useId, useRef, useState } from 'react';
import { parseQr } from '@/lib/utils';

type Props = {
  name: string;
  label?: string;
  placeholder?: string;
  tipo?: 'ambiente' | 'objeto';
  defaultValue?: string;
  required?: boolean;
};

/**
 * Campo de texto + botón para escanear el QR con la cámara del celular.
 * Si la cámara no está disponible, el usuario puede escribir el código.
 */
export default function ScanQR({
  name,
  label = 'Código del ambiente',
  placeholder = 'Ej. 203 o SENA-AMB:203',
  tipo = 'ambiente',
  defaultValue = '',
  required = false,
}: Props) {
  const id = useId().replace(/:/g, '');
  const [valor, setValor] = useState(defaultValue);
  const [escaneando, setEscaneando] = useState(false);
  const [error, setError] = useState('');
  const [aviso, setAviso] = useState('');
  const lectorRef = useRef<any>(null);

  useEffect(() => {
    if (!escaneando) return;

    let cancelado = false;
    let lector: any = null;

    (async () => {
      try {
        const mod: any = await import('html5-qrcode');
        if (cancelado) return;

        lector = new mod.Html5Qrcode(`camara-${id}`);
        lectorRef.current = lector;

        await lector.start(
          { facingMode: 'environment' },
          { fps: 10, qrbox: { width: 240, height: 240 } },
          (texto: string) => {
            const leido = parseQr(texto);
            setValor(leido.codigo || texto);
            setAviso(
              leido.tipo === 'desconocido'
                ? 'Código leído (sin prefijo SENA)'
                : `Leído: ${leido.tipo} ${leido.codigo}`
            );
            setEscaneando(false);
            try {
              lector?.stop().then(() => lector?.clear()).catch(() => {});
            } catch {
              /* noop */
            }
          },
          () => {
            /* errores de cuadro no se muestran */
          }
        );
      } catch {
        if (!cancelado) {
          setError('No se pudo abrir la cámara. Escribe el código a mano.');
          setEscaneando(false);
        }
      }
    })();

    return () => {
      cancelado = true;
      const l = lectorRef.current;
      lectorRef.current = null;
      if (l) {
        try {
          l.stop().then(() => l.clear()).catch(() => {});
        } catch {
          /* noop */
        }
      }
    };
  }, [escaneando, id]);

  return (
    <div className="field">
      <label className="label" htmlFor={`in-${id}`}>
        {label}
      </label>

      <div className="row">
        <input
          id={`in-${id}`}
          className="input"
          name={name}
          value={valor}
          onChange={(e) => setValor(e.target.value)}
          placeholder={placeholder}
          required={required}
          autoComplete="off"
        />
        <button
          type="button"
          className={`btn ${escaneando ? 'btn-danger' : ''}`}
          onClick={() => {
            setError('');
            setAviso('');
            setEscaneando((v) => !v);
          }}
        >
          {escaneando ? 'Detener' : '📷 Escanear'}
        </button>
      </div>

      {escaneando && (
        <div className="camara">
          <div id={`camara-${id}`} style={{ width: '100%' }} />
          <small className="muted">Apunta la cámara al QR del {tipo}.</small>
        </div>
      )}

      {aviso && <small className="ok-text">{aviso}</small>}
      {error && <small className="error-text">{error}</small>}
    </div>
  );
}
