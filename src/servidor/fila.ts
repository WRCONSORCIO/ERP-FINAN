import { Prisma } from '@prisma/client';
import { prisma, type Db } from '@/lib/db';
import { log } from '@/lib/log';
import { apurarCota } from './apuracao';
import { notificar } from './notificacoes';

export const TIPO_APURAR_COTA = 'APURAR_COTA';
const MAX_TENTATIVAS = 5;

/**
 * Pede a apuração de uma cota. Deve ser chamado com o `tx` da operação que mexeu na cota:
 * o pedido é gravado junto com a cota — nenhuma venda entra sem que a apuração seja pedida.
 * Idempotente: se já houver pedido pendente, não duplica.
 */
export async function enfileirarApuracao(db: Db, cotaId: string, motivo: string): Promise<void> {
  await db.$executeRaw`
    INSERT INTO "evento_dominio" ("id", "tipo", "cotaId", "payload", "status", "tentativas", "proximaTentativaEm", "criadoEm")
    VALUES (${'evt_' + crypto.randomUUID()}, ${TIPO_APURAR_COTA}, ${cotaId}, ${JSON.stringify({ motivo })}::jsonb, 'PENDENTE', 0, now(), now())
    ON CONFLICT DO NOTHING`;
}

export async function enfileirarVarias(db: Db, cotaIds: readonly string[], motivo: string): Promise<void> {
  for (const id of cotaIds) await enfileirarApuracao(db, id, motivo);
}

export interface ResultadoFila {
  processados: number;
  concluidos: number;
  falhas: number;
  restantes: number;
}

/** Espera após falha: 1, 2, 4, 8 minutos. */
export function esperaAposFalha(tentativa: number): number {
  return Math.min(2 ** Math.max(0, tentativa - 1), 60) * 60_000;
}

/**
 * Processa um lote da fila. Cada evento roda na própria transação:
 * uma falha registra a tentativa, agenda nova e NÃO interrompe o restante do lote.
 */
export async function processarFila(limite = 100, agora = new Date()): Promise<ResultadoFila> {
  const eventos = await prisma.eventoDominio.findMany({
    where: { status: 'PENDENTE', proximaTentativaEm: { lte: agora } },
    orderBy: { criadoEm: 'asc' },
    take: limite,
  });
  let concluidos = 0;
  let falhas = 0;
  for (const ev of eventos) {
    const tentativa = ev.tentativas + 1;
    const reservado = await prisma.eventoDominio.updateMany({
      where: { id: ev.id, status: 'PENDENTE' },
      data: { status: 'PROCESSANDO', tentativas: tentativa },
    });
    if (reservado.count === 0) continue; // outro processo pegou
    const entrega = await prisma.eventoEntrega.create({ data: { eventoId: ev.id, tentativa } });
    try {
      if (ev.tipo !== TIPO_APURAR_COTA || !ev.cotaId) throw new Error(`Tipo de evento desconhecido: ${ev.tipo}`);
      const cotaId = ev.cotaId;
      await prisma.$transaction((tx) => apurarCota(tx, cotaId), { timeout: 30_000 });
      await prisma.$transaction([
        prisma.eventoDominio.update({ where: { id: ev.id }, data: { status: 'CONCLUIDO', processadoEm: new Date(), ultimoErro: null } }),
        prisma.eventoEntrega.update({ where: { id: entrega.id }, data: { concluidoEm: new Date(), sucesso: true } }),
      ]);
      concluidos++;
    } catch (e) {
      falhas++;
      const msg = e instanceof Error ? e.message.slice(0, 2000) : String(e);
      log.erro('fila.falha', { eventoId: ev.id, cotaId: ev.cotaId, tentativa, erro: msg });
      await prisma.eventoEntrega.update({ where: { id: entrega.id }, data: { concluidoEm: new Date(), sucesso: false, erro: msg } });
      const esgotou = tentativa >= MAX_TENTATIVAS;
      try {
        await prisma.eventoDominio.update({
          where: { id: ev.id },
          data: esgotou
            ? { status: 'ERRO', ultimoErro: msg }
            : { status: 'PENDENTE', ultimoErro: msg, proximaTentativaEm: new Date(agora.getTime() + esperaAposFalha(tentativa)) },
        });
      } catch (e2) {
        // Já existe um pedido pendente mais novo para a mesma cota: este fica registrado como erro.
        if (e2 instanceof Prisma.PrismaClientKnownRequestError && e2.code === 'P2002') {
          await prisma.eventoDominio.update({ where: { id: ev.id }, data: { status: 'ERRO', ultimoErro: msg + ' (substituído por pedido mais recente)' } });
        } else throw e2;
      }
      if (esgotou) {
        await notificar(prisma, {
          tipo: 'FALHA_PROCESSAMENTO', severidade: 'CRITICA', titulo: 'Apuração falhou após várias tentativas',
          mensagem: `A apuração de uma cota falhou ${tentativa} vezes: ${msg.slice(0, 200)}`,
          link: ev.cotaId ? `/clientes/${ev.cotaId}` : '/importacoes', chave: `fila-erro-${ev.id}`, perfis: ['ADMINISTRADOR', 'FINANCEIRO'],
        });
      }
    }
  }
  const restantes = await prisma.eventoDominio.count({ where: { status: 'PENDENTE' } });
  return { processados: eventos.length, concluidos, falhas, restantes };
}

/** Recoloca na fila os eventos que esgotaram as tentativas (ação manual "reprocessar"). */
export async function reprocessarErros(db: Db): Promise<number> {
  const erros = await db.eventoDominio.findMany({ where: { status: 'ERRO', cotaId: { not: null } }, select: { id: true, cotaId: true } });
  for (const e of erros) {
    await enfileirarApuracao(db, e.cotaId as string, 'reprocessamento manual');
    await db.eventoDominio.update({ where: { id: e.id }, data: { status: 'CONCLUIDO', ultimoErro: 'reenfileirado manualmente', processadoEm: new Date() } });
  }
  return erros.length;
}
