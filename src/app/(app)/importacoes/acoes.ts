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
import type { EtapaProcessamento, ProgressoEtapa } from '@/ui/processar-tudo';

type Estado = Resultado<unknown> | null;

export async function receberArquivoAcao(_: Estado, fd: FormData) {
  const arquivo = fd.get('arquivo');
  return executar('importacoes', 'editar', z.object({ administradoraId: z.string().min(1, 'Escolha a administradora') }), { administradoraId: fd.get('administradoraId') }, async (s, d) => {
    if (!(arquivo instanceof File) || arquivo.size === 0) throw new ErroDeDominio('Escolha um arquivo.');
    const bytes = new Uint8Array(await arquivo.arrayBuffer());
    const r = await receberArquivo(s, { administradoraId: d.administradoraId, nomeArquivo: arquivo.name, bytes });
    const conf = r.diferencaConferencia && r.diferencaConferencia !== '0' ? ` Conferência NÃO fecha (diferença ${r.diferencaConferencia}).` : '';
    return {
      mensagem: `Arquivo reconhecido: ${ROTULO_TIPO_ARQUIVO[r.tipo]}. ${r.linhas} linha(s) lida(s)${r.erros > 0 ? `, ${r.erros} não reconhecida(s) (veja “Linhas não reconhecidas”)` : ''}.${r.jaEnviadoAntes ? ' Este arquivo já tinha sido enviado: nada será duplicado.' : ''}${conf}`,
    };
  });
}
export async function reprocessarErrosAcao(_: Estado, _fd: FormData) {
  return executar('importacoes', 'editar', z.object({}), {}, async () => {
    const n = await reprocessarErros(prisma);
    return { mensagem: `${n} pedido(s) de apuração recolocado(s) na fila.` };
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

/**
 * Um passo do "processar tudo": grava as linhas dos arquivos enviados, atualiza as vendas que
 * estavam com cadastro incompleto e calcula comissões e estornos. Cada chamada faz um lote curto.
 */
export async function processarEtapaAcao(etapa: EtapaProcessamento, cursor: string | null): Promise<Resultado<ProgressoEtapa>> {
  return executar('importacoes', 'editar', z.object({ etapa: z.enum(['GRAVAR', 'CADASTRO', 'CALCULAR']), cursor: z.string().nullable() }), { etapa, cursor }, async (s, d) => {
    if (d.etapa === 'GRAVAR') {
      const proxima = await prisma.importacao.findFirst({ where: { status: { in: ['RECEBIDA', 'APLICANDO'] } }, orderBy: { enviadoEm: 'asc' } });
      if (!proxima) return { mensagem: 'ok', dados: { processadas: 0, restantes: 0, concluida: true, cursor: null } };
      const r = await aplicarLote(s, proxima.id);
      const restantes = await prisma.linhaDeImportacao.count({ where: { status: 'PENDENTE' } });
      return { mensagem: 'ok', dados: { processadas: r.processadas, restantes, concluida: restantes === 0, cursor: null } };
    }
    if (d.etapa === 'CADASTRO') {
      const r = await recongelarPendentes(s, 100, d.cursor);
      return { mensagem: 'ok', dados: { processadas: r.processadas, restantes: r.restantes, concluida: r.restantes === 0 || r.processadas === 0, cursor: r.ultimo } };
    }
    const r = await processarFila(100);
    return { mensagem: r.falhas > 0 ? `${r.falhas} venda(s) com erro no cálculo; o sistema tenta de novo sozinho.` : 'ok', dados: { processadas: r.processados, restantes: r.restantes, concluida: r.restantes === 0 || r.processados === 0, cursor: null } };
  });
}
