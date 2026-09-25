import type { Db } from '@/lib/db';
import {
  CHAVES_LAYOUT, LAYOUT_CARTEIRA_INICIAL, LAYOUT_CV056E_INICIAL, LAYOUT_CV069E_INICIAL, LAYOUT_GC070A_INICIAL,
  type LayoutCarteira, type LayoutPdf,
} from '@/dominio/importacao/layouts';
import { z } from 'zod';

/** Parâmetros gerais (ConfiguracaoSistema). Valores iniciais só entram pelo seed; aqui se lê o banco. */
export const CHAVES = {
  ...CHAVES_LAYOUT,
  PROMOCAO_INCLUI_CANCELADAS: 'promocao.inclui_canceladas',
  LOGIN_LIMITES: 'seguranca.login',
  LGPD_RETENCAO_MESES: 'lgpd.retencao_meses',
  TAMANHO_LOTE: 'importacao.tamanho_lote',
} as const;

const esquemaLayoutCarteira = z.object({
  separador: z.string().min(1).max(1),
  colunas: z.record(z.string(), z.array(z.string())),
  situacoesCanceladas: z.array(z.string()),
});
const esquemaLayoutPdf = z.object({
  marcador: z.string().min(2),
  linha: z.string().min(5),
  total: z.string().min(3),
  classificacao: z.object({ CANCELAMENTO: z.array(z.string()), COMISSAO_PARCELA: z.array(z.string()) }).optional(),
});

export const esquemaLimitesLogin = z.object({
  janelaMinutos: z.number().int().positive(),
  falhasParaAtraso: z.number().int().positive(),
  falhasParaBloqueioEmail: z.number().int().positive(),
  falhasParaBloqueioIp: z.number().int().positive(),
  bloqueioMinutos: z.number().int().positive(),
});
export type LimitesLogin = z.infer<typeof esquemaLimitesLogin>;

/** Defesa contra força bruta: valores técnicos de segurança (não são regra financeira). */
export const LIMITES_LOGIN_PADRAO: LimitesLogin = {
  janelaMinutos: 15, falhasParaAtraso: 3, falhasParaBloqueioEmail: 5, falhasParaBloqueioIp: 20, bloqueioMinutos: 15,
};

async function ler(db: Db, chave: string): Promise<unknown> {
  const r = await db.configuracaoSistema.findUnique({ where: { chave } });
  return r?.valor ?? null;
}

export async function layoutCarteira(db: Db): Promise<LayoutCarteira> {
  const v = esquemaLayoutCarteira.safeParse(await ler(db, CHAVES.CARTEIRA_CSV));
  if (!v.success) return LAYOUT_CARTEIRA_INICIAL;
  return { ...LAYOUT_CARTEIRA_INICIAL, ...v.data, colunas: { ...LAYOUT_CARTEIRA_INICIAL.colunas, ...v.data.colunas } } as LayoutCarteira;
}

export async function layoutsPdf(db: Db): Promise<Record<'FECHAMENTO_CV056E' | 'COMISSAO_VENDEDOR_CV069E' | 'BONUS_GC070A', LayoutPdf>> {
  const lerPdf = async (chave: string, padrao: LayoutPdf): Promise<LayoutPdf> => {
    const v = esquemaLayoutPdf.safeParse(await ler(db, chave));
    if (!v.success) return padrao;
    const l: LayoutPdf = { marcador: v.data.marcador, linha: v.data.linha, total: v.data.total };
    if (v.data.classificacao) l.classificacao = v.data.classificacao;
    else if (padrao.classificacao) l.classificacao = padrao.classificacao;
    return l;
  };
  return {
    FECHAMENTO_CV056E: await lerPdf(CHAVES.FECHAMENTO_CV056E, LAYOUT_CV056E_INICIAL),
    COMISSAO_VENDEDOR_CV069E: await lerPdf(CHAVES.COMISSAO_VENDEDOR_CV069E, LAYOUT_CV069E_INICIAL),
    BONUS_GC070A: await lerPdf(CHAVES.BONUS_GC070A, LAYOUT_GC070A_INICIAL),
  };
}

export async function promocaoIncluiCanceladas(db: Db): Promise<boolean> {
  const v = await ler(db, CHAVES.PROMOCAO_INCLUI_CANCELADAS);
  return typeof v === 'boolean' ? v : true;
}

export async function limitesLogin(db: Db): Promise<LimitesLogin> {
  const v = esquemaLimitesLogin.safeParse(await ler(db, CHAVES.LOGIN_LIMITES));
  return v.success ? v.data : LIMITES_LOGIN_PADRAO;
}

export async function tamanhoLote(db: Db): Promise<number> {
  const v = await ler(db, CHAVES.TAMANHO_LOTE);
  return typeof v === 'number' && v >= 10 && v <= 2000 ? v : 250;
}
