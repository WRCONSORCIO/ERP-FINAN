import { NextResponse, type NextRequest } from 'next/server';
import { timingSafeEqual } from 'node:crypto';
import { processarFila } from '@/servidor/fila';
import { log } from '@/lib/log';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/**
 * Processamento agendado da fila de recálculo (Vercel Cron). Protegido por CRON_SECRET:
 * sem segredo configurado, a rota não existe. Não expõe dado algum — devolve só contagens.
 */
export async function GET(req: NextRequest) {
  const segredo = process.env.CRON_SECRET ?? '';
  const enviado = (req.headers.get('authorization') ?? '').replace(/^Bearer\s+/i, '');
  if (segredo.length < 16) return new NextResponse('Não encontrado', { status: 404 });
  const a = Buffer.from(enviado);
  const b = Buffer.from(segredo);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return new NextResponse('Não autorizado', { status: 401 });
  try {
    const r = await processarFila(200);
    log.info('cron.fila', { ...r });
    return NextResponse.json(r);
  } catch (e) {
    log.erro('cron.fila.erro', { erro: e });
    return new NextResponse('Falha ao processar a fila', { status: 500 });
  }
}
