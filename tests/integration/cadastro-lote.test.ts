import ExcelJS from 'exceljs';
import { describe, expect, it } from 'vitest';
import { prisma } from '@/lib/db';
import { executarCadastroLote, previaCadastroLote } from '@/servidor/servicos/cadastro-lote';
import { csv, estrutura, importar, preparar, vendedor } from './ajuda';

async function planilha(linhas: unknown[][]): Promise<Uint8Array> {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('CADASTRO VENDEDORES');
  ws.addRow(['CPF/CNPJ', 'Nome do vendedor', 'Primeira venda', 'GERENCIA', 'EQUIPE', 'CATEGORIA']);
  for (const l of linhas) ws.addRow(l);
  return new Uint8Array(await wb.xlsx.writeBuffer());
}

describe('cadastro de vendedores em lote (planilha)', () => {
  it('prévia sem gravar; cadastra juntando CPF e CNPJ da mesma pessoa, cria a equipe que falta e vincula as vendas', async () => {
    const { admin, administradoraId, cat } = await preparar();
    const est = await estrutura(admin, 'RAFAEL');
    await prisma.gerencia.update({ where: { id: (await prisma.equipe.findUniqueOrThrow({ where: { id: est.equipeId } })).gerenciaId }, data: { nome: 'GERENCIA RAFAEL' } });
    await prisma.equipe.update({ where: { id: est.equipeId }, data: { nome: 'TAUANNE' } });
    const jaExiste = await vendedor(admin, { nome: 'KEILA COSTA COELHO', tipo: 'CPF', doc: '52998224725', categoriaId: cat.INICIANTE, equipeId: est.equipeId, desde: '2025-08-01' });
    // Venda que aguarda o cadastro do CNPJ.
    await importar(admin, administradoraId, csv([{ grupo: '60', cota: '1', credito: '100.000,00', venda: '01/09/2026', pagas: 1, docVendedor: '11222333000181', flex: 'INTEGRAL' }]));

    const bytes = await planilha([
      ['529.982.247-25', 'KEILA COSTA COELHO', '27/11/2024', 'RAFAEL', 'TAUANNE', 'INICIANTE'],
      ['11.222.333/0001-81', 'KEILA COSTA COELHO', '18/11/2025', 'RAFAEL', 'TAUANNE', 'VETERANO'],
      ['390.533.447-05', 'TAUANNE SOUZA DOS SANTOS GOMES', '19/11/2024', 'RAFAEL', 'TAUANNE', 'INICIANTE'],
      ['11.444.777/0001-61', 'TAUANNE SOUZA DOS SANTOS', '18/11/2025', 'RAFAEL', 'NIKSON', 'VETERANO'],
      ['00.000.000/0001-91', 'CATEGORIA ERRADA', '18/11/2025', 'RAFAEL', 'NIKSON', 'INICIANTE'],
      ['123', 'DOC RUIM', '18/11/2025', 'RAFAEL', 'NIKSON', 'INICIANTE'],
    ]);
    const antes = await prisma.vendedor.count();
    const p = await previaCadastroLote(admin, { bytes, nome: 'CADASTRO.xlsx' });
    expect(await prisma.vendedor.count()).toBe(antes); // prévia não grava
    expect(p.jaCadastrados.map((j) => j.documento)).toEqual(['52998224725']);
    expect(p.jaCadastrados[0]?.aviso).toMatch(/depois da primeira venda/);
    expect(p.erros.map((e) => e.erro)).toEqual([expect.stringMatching(/não aceita CNPJ/), 'CPF/CNPJ inválido']);
    const keilaCnpj = p.cadastrar.find((i) => i.documento === '11222333000181')!;
    expect(keilaCnpj.pessoaExistente?.id).toBe(jaExiste.pessoaId);
    const tauCnpj = p.cadastrar.find((i) => i.documento === '11444777000161')!;
    expect(tauCnpj).toMatchObject({ criarGerencia: false, criarEquipe: true, conferir: true });
    expect(tauCnpj.juntarCom.map((j) => j.documento)).toEqual(['39053344705']);

    const itens = p.cadastrar.map((i) => ({
      linha: i.linha, documento: i.documento, tipo: i.tipo, nome: i.nome, inicio: i.inicio, categoriaId: i.categoriaId, gerencia: i.gerencia, equipe: i.equipe,
      juntarCom: i.juntarCom.map((j) => j.documento), pessoaExistenteId: i.pessoaExistente?.id ?? null,
    }));
    const r = await executarCadastroLote(admin, { itens });
    expect(r.every((x) => x.ok)).toBe(true);
    const v = async (doc: string) => prisma.vendedor.findUniqueOrThrow({ where: { documento: doc }, include: { alocacoes: { include: { equipe: true } }, categorias: true } });
    expect((await v('11222333000181')).pessoaId).toBe(jaExiste.pessoaId);
    expect((await v('11444777000161')).pessoaId).toBe((await v('39053344705')).pessoaId);
    expect((await v('11444777000161')).alocacoes[0]?.equipe.nome).toBe('NIKSON'); // equipe criada
    expect((await v('11444777000161')).categorias[0]?.vigenteDe.toISOString().slice(0, 10)).toBe('2025-11-18');
    expect((await prisma.cota.findFirstOrThrow({ where: { grupo: '60' } })).vendedorId).toBe((await v('11222333000181')).id);

    // Rodar de novo não duplica: já cadastrado vira erro por documento, os outros seguem.
    const again = await executarCadastroLote(admin, { itens: itens.slice(0, 1) });
    expect(again[0]).toMatchObject({ ok: false, mensagem: expect.stringMatching(/já está cadastrado/) });
  });
});
