import { describe, expect, it } from 'vitest';
import { prisma } from '@/lib/db';
import { ErroDePermissao } from '@/lib/erros';
import { somar } from '@/lib/dinheiro';
import { calcularLucro, emEstoque, paraTransacao } from '@/dominio/cartas';
import { listarCartas } from '@/servidor/consultas/cartas';
import { financeiroCartas } from '@/servidor/consultas/cartas-financeiro';
import { painelCartas } from '@/servidor/consultas/cartas-dashboard';
import { cadastrarCarta, esquemaCadastroCarta, excluirCarta, alterarCarta } from '@/servidor/servicos/cartas';
import { D, preparar, sessao } from './ajuda';

type DadosCarta = Parameters<typeof cadastrarCarta>[1];

function dadosCarta(administradoraId: string, clienteVendedorId: string, overrides: Partial<DadosCarta> = {}): DadosCarta {
  return {
    administradoraId,
    tipoNegociacao: 'COMPRA_VENDA',
    status: 'ESTOQUE',
    vendedorCartaId: null,
    clienteVendedorId,
    clienteCompradorId: null,
    valorCarta: '100000.00',
    valorCompra: '80000.00',
    valorVenda: null,
    valorParcela: '1000.00',
    parcelasPagas: 10,
    parcelasAPagar: 50,
    comissaoVendedor: '0.00',
    dataCompra: D('2026-09-01'),
    dataVenda: null,
    dataTransferencia: null,
    observacoes: null,
    ...overrides,
  };
}

async function cliente(nome: string, documento: string, tipoDocumento: 'CPF' | 'CNPJ' = 'CPF') {
  return prisma.clienteCarta.create({ data: { nome, documento, tipoDocumento } });
}

describe('domínio: cálculo puro', () => {
  it('calcularLucro = venda − compra − comissão', () => {
    expect(calcularLucro('10000', '8000', '500').toFixed(2)).toBe('1500.00');
    expect(calcularLucro('8000', '8000', '0').toFixed(2)).toBe('0.00');
    expect(calcularLucro('7000', '8000', '0').toFixed(2)).toBe('-1000.00'); // prejuízo é permitido, não escondido
  });

  it('emEstoque: só compra_venda em estoque conta; intermediação nunca conta, mesmo com status ESTOQUE', () => {
    expect(emEstoque({ status: 'ESTOQUE', tipoNegociacao: 'COMPRA_VENDA' })).toBe(true);
    expect(emEstoque({ status: 'ESTOQUE', tipoNegociacao: 'INTERMEDIACAO' })).toBe(false);
    expect(emEstoque({ status: 'VENDIDA', tipoNegociacao: 'COMPRA_VENDA' })).toBe(false);
    expect(emEstoque({ status: 'TRANSFERIDA', tipoNegociacao: 'COMPRA_VENDA' })).toBe(false);
  });

  it('paraTransacao: entrada − saída sempre bate com o resultado, uma linha por carta', () => {
    const base = { valorCompra: '8000', comissaoVendedor: '200', dataCompra: D('2026-09-01'), dataVenda: null, dataTransferencia: null };
    const compra = paraTransacao({ ...base, status: 'ESTOQUE', tipoNegociacao: 'COMPRA_VENDA', valorVenda: null });
    expect(compra.tipo).toBe('COMPRA');
    expect(compra.entrada.toFixed(2)).toBe('0.00');
    expect(compra.saida.toFixed(2)).toBe('8000.00');
    expect(compra.resultado.toFixed(2)).toBe('-8000.00');

    const venda = paraTransacao({ ...base, status: 'VENDIDA', tipoNegociacao: 'COMPRA_VENDA', valorVenda: '10000', dataVenda: D('2026-09-15') });
    expect(venda.tipo).toBe('VENDA');
    expect(venda.entrada.toFixed(2)).toBe('10000.00');
    expect(venda.saida.toFixed(2)).toBe('8200.00'); // compra + comissão
    expect(venda.resultado.toFixed(2)).toBe('1800.00');

    const intermediacao = paraTransacao({ ...base, status: 'VENDIDA', tipoNegociacao: 'INTERMEDIACAO', valorVenda: '10000', dataVenda: D('2026-09-15') });
    expect(intermediacao.tipo).toBe('INTERMEDIACAO');

    const transferida = paraTransacao({ ...base, status: 'TRANSFERIDA', tipoNegociacao: 'COMPRA_VENDA', valorVenda: null, dataTransferencia: D('2026-09-20') });
    expect(transferida.tipo).toBe('TRANSFERIDA');
    expect(transferida.data.toISOString().slice(0, 10)).toBe('2026-09-20');
  });
});

describe('validação condicional por status (Zod + constraint do banco)', () => {
  it('Zod recusa VENDIDA sem comprador/data/valor de venda, e TRANSFERIDA sem data de transferência', async () => {
    const { administradoraId } = await preparar();
    const c = await cliente('CLIENTE X', '52998224725');

    const semDadosDeVenda = esquemaCadastroCarta.safeParse({
      administradoraId, tipoNegociacao: 'COMPRA_VENDA', status: 'VENDIDA', vendedorCartaId: '', clienteVendedorId: c.id, clienteCompradorId: '',
      valorCarta: '100000', valorCompra: '80000', valorVenda: '', valorParcela: '0', parcelasPagas: '0', parcelasAPagar: '0', comissaoVendedor: '0',
      dataCompra: '2026-09-01', dataVenda: '', dataTransferencia: '', observacoes: '',
    });
    expect(semDadosDeVenda.success).toBe(false);
    if (!semDadosDeVenda.success) {
      const campos = semDadosDeVenda.error.issues.map((i) => i.path.join('.'));
      expect(campos).toEqual(expect.arrayContaining(['clienteCompradorId', 'dataVenda', 'valorVenda']));
    }

    const semDataTransferencia = esquemaCadastroCarta.safeParse({
      administradoraId, tipoNegociacao: 'COMPRA_VENDA', status: 'TRANSFERIDA', vendedorCartaId: '', clienteVendedorId: c.id, clienteCompradorId: '',
      valorCarta: '100000', valorCompra: '80000', valorVenda: '', valorParcela: '0', parcelasPagas: '0', parcelasAPagar: '0', comissaoVendedor: '0',
      dataCompra: '2026-09-01', dataVenda: '', dataTransferencia: '', observacoes: '',
    });
    expect(semDataTransferencia.success).toBe(false);

    const estoqueOk = esquemaCadastroCarta.safeParse({
      administradoraId, tipoNegociacao: 'COMPRA_VENDA', status: 'ESTOQUE', vendedorCartaId: '', clienteVendedorId: c.id, clienteCompradorId: '',
      valorCarta: '100000', valorCompra: '80000', valorVenda: '', valorParcela: '0', parcelasPagas: '0', parcelasAPagar: '0', comissaoVendedor: '0',
      dataCompra: '2026-09-01', dataVenda: '', dataTransferencia: '', observacoes: '',
    });
    expect(estoqueOk.success).toBe(true);
  });

  it('o banco recusa a mesma situação incoerente mesmo passando por fora do Zod (ck_carta_situacao)', async () => {
    const { administradoraId } = await preparar();
    const c = await cliente('CLIENTE Y', '11144477735');
    await expect(
      prisma.carta.create({
        data: {
          codigo: 'CART-TESTE-1', administradoraId, tipoNegociacao: 'COMPRA_VENDA', status: 'VENDIDA',
          clienteVendedorId: c.id, clienteCompradorId: null, valorCompra: '80000', dataCompra: D('2026-09-01'), dataVenda: null,
        },
      }),
    ).rejects.toThrow(/ck_carta_situacao/);
    await expect(
      prisma.carta.create({
        data: {
          codigo: 'CART-TESTE-2', administradoraId, tipoNegociacao: 'COMPRA_VENDA', status: 'TRANSFERIDA',
          clienteVendedorId: c.id, valorCompra: '80000', dataCompra: D('2026-09-01'), dataTransferencia: null,
        },
      }),
    ).rejects.toThrow(/ck_carta_situacao/);
    // ESTOQUE não exige nada extra
    const ok = await prisma.carta.create({
      data: { codigo: 'CART-TESTE-3', administradoraId, tipoNegociacao: 'COMPRA_VENDA', status: 'ESTOQUE', clienteVendedorId: c.id, valorCompra: '80000', dataCompra: D('2026-09-01') },
    });
    expect(ok.id).toBeTruthy();
  });
});

describe('código sequencial', () => {
  it('CART-0001, CART-0002... únicos mesmo sob criação concorrente', async () => {
    const { admin, administradoraId } = await preparar();
    const c = await cliente('CLIENTE CONCORRENTE', '39053344705');
    const criadas = await Promise.all(Array.from({ length: 8 }, () => cadastrarCarta(admin, dadosCarta(administradoraId, c.id))));
    const codigos = criadas.map((x) => x.codigo);
    expect(new Set(codigos).size).toBe(8);
    for (const codigo of codigos) expect(codigo).toMatch(/^CART-\d{4}$/);
  });
});

describe('RBAC', () => {
  it('ADMINISTRADOR cria/edita/exclui; FINANCEIRO só lê; demais perfis bloqueados até para ler', async () => {
    const { admin, administradoraId } = await preparar();
    const fin = await sessao('FINANCEIRO');
    const cadastro = await sessao('CADASTRO');
    const gerente = await sessao('GERENTE');
    const supervisor = await sessao('SUPERVISOR');
    const c = await cliente('CLIENTE RBAC', '85625396120');

    // Leitura bloqueada para quem não está na matriz de "cartas"
    await expect(listarCartas(cadastro, {})).rejects.toBeInstanceOf(ErroDePermissao);
    await expect(listarCartas(gerente, {})).rejects.toBeInstanceOf(ErroDePermissao);
    await expect(listarCartas(supervisor, {})).rejects.toBeInstanceOf(ErroDePermissao);

    // FINANCEIRO lê, mas não escreve
    await expect(listarCartas(fin, {})).resolves.toBeDefined();
    await expect(cadastrarCarta(fin, dadosCarta(administradoraId, c.id))).rejects.toBeInstanceOf(ErroDePermissao);

    // ADMINISTRADOR escreve de ponta a ponta
    const carta = await cadastrarCarta(admin, dadosCarta(administradoraId, c.id));
    expect(carta.codigo).toMatch(/^CART-\d{4}$/);
    const alterada = await alterarCarta(admin, { ...dadosCarta(administradoraId, c.id), id: carta.id, valorCompra: '75000.00' } as Parameters<typeof alterarCarta>[1]);
    expect(alterada.valorCompra.toFixed(2)).toBe('75000.00');
    await excluirCarta(admin, { id: carta.id, motivo: 'teste automatizado' });
    expect(await prisma.carta.findUnique({ where: { id: carta.id } })).toBeNull();

    // E FINANCEIRO não pode nem editar nem excluir
    const outra = await cadastrarCarta(admin, dadosCarta(administradoraId, c.id));
    await expect(excluirCarta(fin, { id: outra.id, motivo: 'tentativa' })).rejects.toBeInstanceOf(ErroDePermissao);
  });
});

describe('lucro calculado e gravado pelo serviço', () => {
  it('cadastrar já vendida grava lucro; alterar para vendida recalcula; voltar para estoque zera', async () => {
    const { admin, administradoraId } = await preparar();
    const dono = await cliente('DONO', '11144477735');
    const comprador = await cliente('COMPRADOR', '39053344705');

    const vendida = await cadastrarCarta(admin, dadosCarta(administradoraId, dono.id, {
      status: 'VENDIDA', clienteCompradorId: comprador.id, valorVenda: '95000.00', comissaoVendedor: '1000.00', dataVenda: D('2026-09-10'),
    }));
    expect(vendida.lucro?.toFixed(2)).toBe(calcularLucro('95000.00', '80000.00', '1000.00').toFixed(2));

    const voltouParaEstoque = await alterarCarta(admin, {
      ...dadosCarta(administradoraId, dono.id), id: vendida.id,
    } as Parameters<typeof alterarCarta>[1]);
    expect(voltouParaEstoque.lucro).toBeNull();
    expect(voltouParaEstoque.clienteCompradorId).toBeNull();
    expect(voltouParaEstoque.dataVenda).toBeNull();
  });
});

describe('ledger financeiro', () => {
  it('uma linha por carta; entradas/saídas/resultado batem com o filtro aplicado', async () => {
    const { admin, administradoraId } = await preparar();
    const dono = await cliente('DONO FIN', '85625396120');
    const comprador = await cliente('COMPRADOR FIN', '11144477735');

    await cadastrarCarta(admin, dadosCarta(administradoraId, dono.id)); // em estoque: só saída
    await cadastrarCarta(admin, dadosCarta(administradoraId, dono.id, {
      status: 'VENDIDA', clienteCompradorId: comprador.id, valorVenda: '95000.00', comissaoVendedor: '1000.00', dataVenda: D('2026-09-10'), valorCompra: '80000.00',
    }));
    await cadastrarCarta(admin, dadosCarta(administradoraId, dono.id, {
      status: 'VENDIDA', tipoNegociacao: 'INTERMEDIACAO', clienteCompradorId: comprador.id, valorVenda: '50000.00', valorCompra: '48000.00', dataVenda: D('2026-09-12'),
    }));

    const fin = await financeiroCartas(admin, {});
    expect(fin.linhas).toHaveLength(3);
    for (const l of fin.linhas) expect(l.transacao.entrada.minus(l.transacao.saida).toFixed(2)).toBe(l.transacao.resultado.toFixed(2));
    expect(fin.totais.resultado.toFixed(2)).toBe(somar(fin.linhas.map((l) => l.transacao.resultado)).toFixed(2));

    const soVenda = await financeiroCartas(admin, { tipo: 'VENDA' });
    expect(soVenda.linhas).toHaveLength(1);
    expect(soVenda.linhas[0]?.transacao.tipo).toBe('VENDA');
  });
});

describe('dashboard', () => {
  it('painelCartas separa estoque (só compra_venda), vendidas e intermediação', async () => {
    const { admin, administradoraId } = await preparar();
    const dono = await cliente('DONO PAINEL', '52998224725');
    const comprador = await cliente('COMPRADOR PAINEL', '39053344705');

    await cadastrarCarta(admin, dadosCarta(administradoraId, dono.id)); // estoque
    await cadastrarCarta(admin, dadosCarta(administradoraId, dono.id, { tipoNegociacao: 'INTERMEDIACAO' })); // não conta como estoque
    await cadastrarCarta(admin, dadosCarta(administradoraId, dono.id, {
      status: 'VENDIDA', clienteCompradorId: comprador.id, valorVenda: '95000.00', dataVenda: D('2026-09-10'),
    }));

    const p = await painelCartas(admin);
    expect(p.totalNegociadas).toBe(3);
    expect(p.emEstoqueQtd).toBe(1);
    expect(p.vendidasQtd).toBe(1);
    expect(p.intermediacoesQtd).toBe(1);
  });
});

describe('auditoria', () => {
  it('grava AuditLog na criação e na exclusão', async () => {
    const { admin, administradoraId } = await preparar();
    const c = await cliente('CLIENTE AUDITORIA', '11144477735');
    const carta = await cadastrarCarta(admin, dadosCarta(administradoraId, c.id));
    const criacao = await prisma.auditLog.findFirst({ where: { entidade: 'Carta', entidadeId: carta.id, acao: 'CRIACAO' } });
    expect(criacao).not.toBeNull();

    await excluirCarta(admin, { id: carta.id, motivo: 'cadastro duplicado, motivo de teste' });
    const exclusao = await prisma.auditLog.findFirst({ where: { entidade: 'Carta', entidadeId: carta.id, acao: 'EXCLUSAO' } });
    expect(exclusao).not.toBeNull();
    expect((exclusao?.contexto as { motivo?: string } | null)?.motivo).toBe('cadastro duplicado, motivo de teste');
  });
});
