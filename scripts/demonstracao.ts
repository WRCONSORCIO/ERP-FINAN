/**
 * DADOS DE DEMONSTRAÇÃO — somente para desenvolvimento local. Recusa rodar em produção
 * ou em banco cujo nome não contenha "dev", "demo" ou "local". Tudo passa pelos serviços reais
 * (mesmas regras, auditoria e fila), com a base sintética de tests/fixtures.
 *   npm run db:demo
 */
import { readFileSync } from 'node:fs';
import { prisma } from '../src/lib/db';
import { deISO } from '../src/lib/datas';
import type { Sessao } from '../src/servidor/contexto';
import { aplicarLote, receberArquivo } from '../src/servidor/importacao';
import { processarFila } from '../src/servidor/fila';
import { criarEquipe, criarGerencia, definirResponsavel } from '../src/servidor/servicos/estrutura';
import { cadastrarVendedor, registrarRecuperacao } from '../src/servidor/servicos/vendedores';
import { definirEscopoBase } from '../src/servidor/servicos/regras';

async function main() {
  const banco = (await prisma.$queryRaw<Array<{ db: string }>>`SELECT current_database() AS db`)[0]?.db ?? '';
  if (process.env.NODE_ENV === 'production' || !/dev|demo|local/i.test(banco)) {
    throw new Error(`RECUSADO: dados de demonstração só em banco de desenvolvimento (atual: "${banco}").`);
  }
  const u = await prisma.usuario.findFirst({ where: { perfil: 'ADMINISTRADOR', ativo: true } });
  if (!u) throw new Error('Crie o administrador antes (npm run db:criar-admin).');
  const s: Sessao = { usuarioId: u.id, nome: u.nome, email: u.email, perfil: 'ADMINISTRADOR', gerenciaId: null, equipeId: null, ip: 'script-demo' };
  const D = (x: string) => deISO(x) as Date;
  const cat = Object.fromEntries((await prisma.categoriaVendedor.findMany()).map((c) => [c.codigo, c.id]));

  const g1 = await criarGerencia(s, { nome: 'Erita' });
  const g2 = await criarGerencia(s, { nome: 'Rafael' });
  const e1 = await criarEquipe(s, { nome: 'Erita Norte', gerenciaId: g1.id });
  const e2 = await criarEquipe(s, { nome: 'Rafael Centro', gerenciaId: g2.id });
  await criarEquipe(s, { nome: 'Rafael Sul', gerenciaId: g2.id });
  await definirResponsavel(s, { papel: 'GERENTE', unidadeId: g1.id, pessoaId: null, novoNome: 'Erita Gerente', vigenteDe: D('2026-01-01') });
  await definirResponsavel(s, { papel: 'GERENTE', unidadeId: g2.id, pessoaId: null, novoNome: 'Rafael Gerente', vigenteDe: D('2026-01-01') });
  await definirResponsavel(s, { papel: 'SUPERVISOR', unidadeId: e1.id, pessoaId: null, novoNome: 'Lucas Supervisor', vigenteDe: D('2026-01-01') });

  const ana = await cadastrarVendedor(s, { pessoaId: null, tipoDocumento: 'CPF', documento: '52998224725', nome: 'Ana Paula Souza', categoriaId: cat.INICIANTE as string, equipeId: e1.id, vigenteDe: D('2026-01-01') });
  await cadastrarVendedor(s, { pessoaId: null, tipoDocumento: 'CPF', documento: '11144477735', nome: 'Bruno Lima Costa', categoriaId: cat.INICIANTE as string, equipeId: e2.id, vigenteDe: D('2026-01-01') });
  await cadastrarVendedor(s, { pessoaId: ana.pessoaId, tipoDocumento: 'CNPJ', documento: '11222333000181', nome: 'Carla Dias ME', categoriaId: cat.VETERANO as string, equipeId: e1.id, vigenteDe: D('2026-01-01') });
  await registrarRecuperacao(s, { vendedorId: ana.vendedor.id, inicio: D('2026-09-18'), fim: D('2026-09-20'), motivo: 'demonstração' });
  const cfg = await prisma.configuracaoEstorno.findFirst({ where: { escopoBase: null } });
  if (cfg) await definirEscopoBase(s, { configuracaoId: cfg.id, escopoBase: 'PARCELAS_RECEBIDAS' });

  const adm = await prisma.administradora.findFirstOrThrow();
  const bytes = new Uint8Array(readFileSync('tests/fixtures/carteira-sintetica.csv'));
  const r = await receberArquivo(s, { administradoraId: adm.id, nomeArquivo: 'carteira-sintetica.csv', bytes });
  while (!(await aplicarLote(s, r.importacaoId)).concluida) { /* lotes */ }
  for (;;) { if ((await processarFila(500)).processados === 0) break; }
  const extra = ['NOME;CPF;GRUPO;COTA;CONTRATO;VALOR DO CRÉDITO;DATA DA VENDA;PARCELAS PAGAS;SITUAÇÃO;VENDEDOR;CPF VENDEDOR;SEGMENTO;MODALIDADE;DATA CANCELAMENTO',
    'CLIENTE VETERANO 1;39053344705;1601;1;8800001;300.000,00;05/09/2026;1;CANCELADO;CARLA DIAS ME;11222333000181;IMÓVEL;INTEGRAL;22/09/2026',
    'CLIENTE VETERANO 2;39053344705;1601;2;8800002;450.000,00;08/09/2026;3;ATIVO;CARLA DIAS ME;11222333000181;IMÓVEL;FLEX 70;'].join('\r\n') + '\r\n';
  const r2 = await receberArquivo(s, { administradoraId: adm.id, nomeArquivo: 'carteira-veterano.csv', bytes: new Uint8Array(Buffer.from(extra, 'latin1')) });
  while (!(await aplicarLote(s, r2.importacaoId)).concluida) { /* lotes */ }
  for (;;) { if ((await processarFila(500)).processados === 0) break; }
  console.log('Demonstração pronta:', await prisma.cota.count(), 'cotas,', await prisma.comissaoApurada.count(), 'comissões,', await prisma.estorno.count(), 'estornos.');
}

main().catch((e) => { console.error(e instanceof Error ? e.message : e); process.exitCode = 1; }).finally(() => prisma.$disconnect());
