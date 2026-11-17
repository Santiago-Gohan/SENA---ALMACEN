'use client';

export default function PrintButton({ texto = '🖨 Imprimir' }: { texto?: string }) {
  return (
    <button type="button" className="btn btn-primary no-print" onClick={() => window.print()}>
      {texto}
    </button>
  );
}
