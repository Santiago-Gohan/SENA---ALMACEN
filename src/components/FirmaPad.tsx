'use client';

import { useEffect, useRef, useState } from 'react';

type Props = {
  name?: string;
  label?: string;
};

/** Firma del instructor con el dedo o el mouse. Guarda un PNG en base64. */
export default function FirmaPad({ name = 'firma_data', label = 'Firma del instructor' }: Props) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const dibujando = useRef(false);
  const [dataUrl, setDataUrl] = useState('');
  const [vacio, setVacio] = useState(true);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ratio = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    canvas.width = Math.max(1, Math.floor(rect.width * ratio));
    canvas.height = Math.max(1, Math.floor(rect.height * ratio));

    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.scale(ratio, ratio);
    ctx.lineWidth = 2;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = '#14231a';
  }, []);

  function posicion(e: React.PointerEvent<HTMLCanvasElement>) {
    const canvas = canvasRef.current!;
    const rect = canvas.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  }

  function iniciar(e: React.PointerEvent<HTMLCanvasElement>) {
    e.preventDefault();
    const canvas = canvasRef.current;
    if (!canvas) return;
    canvas.setPointerCapture(e.pointerId);
    dibujando.current = true;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const p = posicion(e);
    ctx.beginPath();
    ctx.moveTo(p.x, p.y);
  }

  function mover(e: React.PointerEvent<HTMLCanvasElement>) {
    if (!dibujando.current) return;
    e.preventDefault();
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;
    const p = posicion(e);
    ctx.lineTo(p.x, p.y);
    ctx.stroke();
    setVacio(false);
  }

  function terminar(e: React.PointerEvent<HTMLCanvasElement>) {
    if (!dibujando.current) return;
    dibujando.current = false;
    const canvas = canvasRef.current;
    if (!canvas) return;
    try {
      canvas.releasePointerCapture(e.pointerId);
    } catch {
      /* noop */
    }
    setDataUrl(canvas.toDataURL('image/png'));
  }

  function limpiar() {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (canvas && ctx) {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      setDataUrl('');
      setVacio(true);
    }
  }

  return (
    <div className="field">
      <label className="label">{label}</label>
      <canvas
        ref={canvasRef}
        className="firma-canvas"
        onPointerDown={iniciar}
        onPointerMove={mover}
        onPointerUp={terminar}
        onPointerLeave={terminar}
      />
      <input type="hidden" name={name} value={dataUrl} />
      <div className="row" style={{ justifyContent: 'space-between' }}>
        <small className="muted">
          {vacio ? 'Firma dentro del recuadro' : 'Firma capturada ✓'}
        </small>
        <button type="button" className="btn btn-sm" onClick={limpiar}>
          Limpiar
        </button>
      </div>
    </div>
  );
}
