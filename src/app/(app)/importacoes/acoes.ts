'use server';

import { z } from 'zod';
import { ErroDeDominio } from '@/lib/erros';
import { executar, formParaObjeto, type Resultado } from '@/servidor/acao';
import { aplicarLote, receberArquivo } from '@/servidor/importacao';
import { processarFila, reprocessarErros } from '@/servidor/fila';
import { prisma } from '@/lib/db';
import { recongelarPendentes } from '@/servidor/servicos/cotas';
import { esquemaLayoutPdf, salvarLayoutCarteira, salvarLayoutPdf } from '@/servidor/servicos/regras';
import { ROTULO_TIPO_ARQUIVO } from '@/dominio/importacao/deteccao';
import type { ProgressoLote } from '@/ui/processo-em-lotes';

type Estado = Resultado<unknown> | null;

export async function receberArquivoAcao(_: Estado, fd: FormData) {
  const arquivo = fd.get('arquivo');
  return executar('importacoes', 'editar', z.object({ administradoraId: z.string().min(1, 'Escolha a administradora') }), { administradoraId: fd.get('administradoraId') }, async (s, d) => {
    if (!(arquivo instanceof File) || arquivo.size === 0) throw new ErroDeDominio('Escolha um arquivo.');
    const bytes = new Uint8Array(await arquivo.arrayBuffer());
    const r = await receberArquivo(s, { administradoraId: d.administradoraId, nomeArquivo: arquivo.name, bytes });
    const conf = r.diferencaConferencia && r.diferencaConferencia !== '0' ? ` Conferência NÃO fecha (diferença ${r.diferencaConferencia}).` : '';
    return {
      mensagem: `Reconhecido pelo conteúdo como ${ROTULO_TIPO_ARQUIVO[r.tipo]}: ${r.linhas} linha(s) guardada(s), ${r.erros} não reconhecida(s).${r.jaEnviadoAntes ? ' Arquivo idêntico já enviado: as linhas voltarão como sem mudança.' : ''}${conf} Agora aplique em “Falta aplicar”.`,
    };
  });
}

/** Aplica o próximo lote da importação pendente mais antiga (ordem de envio preservada). */
export async function aplicarPendentesAcao(): Promise<Resultado<ProgressoLote>> {
  return executar('importacoes', 'editar', z.undefined(), undefined, async (s) => {
    const proxima = await prisma.importacao.findFirst({ where: { status: { in: ['RECEBIDA', 'APLICANDO'] } }, orderBy: { enviadoEm: 'asc' } });
    if (!proxima) return { mensagem: 'Nada a aplicar.', dados: { processadas: 0, restantes: 0, concluida: true } };
    const r = await aplicarLote(s, proxima.id);
    const restantes = await prisma.linhaDeImportacao.count({ where: { status: 'PENDENTE' } });
    return {
      mensagem: restantes === 0 ? 'Importações aplicadas. Agora rode a fila de recálculo (Apurar tudo).' : 'Lote aplicado.',
      dados: { processadas: r.processadas, restantes, concluida: restantes === 0 },
    };
  });
}

export async function apurarFilaAcao(): Promise<Resultado<ProgressoLote>> {
  return executar('importacoes', 'editar', z.undefined(), undefined, async () => {
    const r = await processarFila(100);
    return {
      mensagem: r.falhas > 0 ? `Lote apurado com ${r.falhas} falha(s) — ficam agendadas para nova tentativa.` : r.restantes === 0 ? 'Fila de recálculo vazia.' : 'Lote apurado.',
      dados: { processadas: r.processados, restantes: r.restantes, concluida: r.restantes === 0 || r.processados === 0 },
    };
  });
}

export async function reprocessarErrosAcao(_: Estado, _fd: FormData) {
  return executar('importacoes', 'editar', z.object({}), {}, async () => {
    const n = await reprocessarErros(prisma);
    return { mensagem: `${n} pedido(s) de apuração recolocado(s) na fila.` };
  });
}

export async function recongelarTodasAcao(): Promise<Resultado<ProgressoLote>> {
  return executar('importacoes', 'editar', z.undefined(), undefined, async (s) => {
    const r = await recongelarPendentes(s, 150);
    return { mensagem: r.restantes === 0 ? `Recongelamento concluído. ${r.alteradas} venda(s) mudaram e foram para a fila de apuração.` : 'Lote recongelado.', dados: { processadas: r.processadas, restantes: r.restantes, concluida: r.restantes === 0 || r.processadas === 0 } };
  });
}

export async function salvarLayoutCarteiraAcao(_: Estado, fd: FormData) {
  return executar('importacoes', 'editar', z.record(z.string(), z.unknown()), formParaObjeto(fd), async (s, d) => {
    await salvarLayoutCarteira(s, d);
    return { mensagem: 'Layout da base de clientes salvo. Vale para as próximas importações.' };
  });
}

export async function salvarLayoutPdfAcao(_: Estado, fd: FormData) {
  return executar('importacoes', 'editar', esquemaLayoutPdf, formParaObjeto(fd), async (s, d) => {
    await salvarLayoutPdf(s, d);
    return { mensagem: 'Layout do relatório salvo. Vale para as próximas importações.' };
  });
}
