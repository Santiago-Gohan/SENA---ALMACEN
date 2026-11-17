import type { NextRequest } from 'next/server';
import QRCode from 'qrcode';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Genera un QR en PNG.
 * Uso: /api/qr?data=SENA-AMB:203&size=320
 */
export async function GET(req: NextRequest) {
  const params = req.nextUrl.searchParams;
  const data = params.get('data') || 'SENA';
  const size = Math.min(1000, Math.max(120, Number(params.get('size') || 320) || 320));

  try {
    const buffer = await QRCode.toBuffer(data, {
      type: 'png',
      width: size,
      margin: 1,
      errorCorrectionLevel: 'M',
      color: { dark: '#000000', light: '#ffffff' },
    });

    return new Response(new Uint8Array(buffer), {
      headers: {
        'Content-Type': 'image/png',
        'Cache-Control': 'public, max-age=31536000, immutable',
      },
    });
  } catch (e) {
    return new Response(`No se pudo generar el QR: ${(e as Error).message}`, { status: 500 });
  }
}
