import { describe, expect, it } from 'vitest';
import { dec } from '@/lib/dinheiro';
import { deISO, formatarData } from '@/lib/datas';
import { planejarNaLinhaDoTempo, planejarNovaVigencia, resolverVigente } from '@/dominio/vigencia';
import { situacaoDePromocao } from '@/dominio/promocao';
import { casarVendedor } from '@/dominio/casamento';
import { MATRIZ, pode, PERFIS, RECURSOS } from '@/lib/permissoes';
import { escopoCotas, escopoVendedores, exigir, recorteDe, type Sessao } from '@/servidor/contexto';
import { pessoaDesligada } from '@/servidor/consultas/vendedores';

const ontem = deISO('2026-09-23') as Date;
const hoje = deISO('2026-09-24') as Date;

describe('vigência (regra pela data do fato)', () => {
  const regras = [
    { id: 'antiga', vigenteDe: deISO('2026-01-01') as Date, vigenteAte: ontem },
    { id: 'nova', vigenteDe: hoje, vigenteAte: null },
  ];
  it('venda de ontem usa a regra de ontem; venda de hoje usa a nova', () => {
    expect(resolverVigente(regras, ontem)?.id).toBe('antiga');
    expect(resolverVigente(regras, hoje)?.id).toBe('nova');
    expect(resolverVigente(regras, deISO('2025-12-31') as Date)).toBeNull();
  });
  it('nova vigência encerra a atual no dia anterior e nunca reescreve o passado', () => {
    const plano = planejarNovaVigencia({ vigenteDe: deISO('2026-01-01') as Date, vigenteAte: null }, hoje);
    expect(formatarData(plano.encerrarAtualEm)).toBe('23/09/2026');
    expect(() => planejarNovaVigencia({ vigenteDe: hoje, vigenteAte: null }, hoje)).toThrow(/não reescreve o passado/);
  });
  it('duas regras vigentes na mesma data interrompem o cálculo', () => {
    expect(() => resolverVigente([{ vigenteDe: ontem, vigenteAte: null }, { vigenteDe: hoje, vigenteAte: null }], hoje)).toThrow();
  });
});

describe('promoção (manual, sinalizada)', () => {
  const metas = [{ categoriaOrigemId: 'INI', categoriaAlvoId: 'VET', categoriaAlvoNome: 'Veterano', volumeMinimo: dec('3000000'), alertaAoFaltar: dec('500000'), documentoExigido: 'CNPJ' as const }];
  it('alerta a R$ 500.000 da meta e sinaliza meta atingida sem promover', () => {
    expect(situacaoDePromocao(dec('2400000'), 'INI', metas).proxima).toBe(false);
    const perto = situacaoDePromocao(dec('2500000'), 'INI', metas);
    expect(perto.proxima).toBe(true);
    expect(perto.falta?.toFixed(2)).toBe('500000.00');
    const atingiu = situacaoDePromocao(dec('3000000'), 'INI', metas);
    expect(atingiu.atingiu).toBe(true);
    expect(atingiu.falta?.toFixed(2)).toBe('0.00');
    expect(situacaoDePromocao(dec('1'), 'EXPERT', metas).proximaCategoria).toBeNull();
  });
});

describe('casamento de vendedor', () => {
  const cad = { porDocumento: new Map([['52998224725', 'v1']]), porNome: new Map([['ANA PAULA SOUZA', ['v1']], ['JOSE SILVA', ['v2', 'v3']]]) };
  it('documento primeiro; nome só quando aponta para um único cadastro', () => {
    expect(casarVendedor('qualquer', '529.982.247-25', cad)).toEqual({ vendedorId: 'v1', criterio: 'DOCUMENTO' });
    expect(casarVendedor('Ana  Paula Souza', null, cad)).toEqual({ vendedorId: 'v1', criterio: 'NOME' });
    expect(casarVendedor('José Silva', null, cad)).toEqual({ vendedorId: null, motivo: 'AMBIGUO' });
    expect(casarVendedor('Ana P. Souza', null, cad)).toEqual({ vendedorId: null, motivo: 'SEM_CADASTRO' });
    expect(casarVendedor('Ana Paula Souza', '11222333000181', cad)).toEqual({ vendedorId: null, motivo: 'DOCUMENTO_SEM_CADASTRO' });
    expect(casarVendedor('', '', cad)).toEqual({ vendedorId: null, motivo: 'SEM_VENDEDOR' });
  });
});

describe('permissões (padrão negar)', () => {
  it('reproduz a matriz da especificação', () => {
    expect(pode('ADMINISTRADOR', 'auditoria', 'tudo')).toBe(true);
    expect(pode('FINANCEIRO', 'vendedores')).toBe(false);
    expect(pode('FINANCEIRO', 'comissoes', 'editar')).toBe(true);
    expect(pode('FINANCEIRO', 'comissoes', 'tudo')).toBe(false);
    expect(pode('CADASTRO', 'cotas')).toBe(false);
    expect(pode('GERENTE', 'gerencias', 'ver')).toBe(true);
    expect(pode('SUPERVISOR', 'gerencias')).toBe(false);
    expect(pode('SUPERVISOR', 'bonus')).toBe(false);
    expect(pode('GERENTE', 'transferencias')).toBe(false);
  });
  it('administrador tem tudo em todos os recursos; célula vazia é sem acesso', () => {
    for (const r of RECURSOS) expect(MATRIZ[r].ADMINISTRADOR).toBe('tudo');
    for (const p of PERFIS) expect(pode(p, 'nao-existe' as never)).toBe(false);
  });
  it('exigir() lança sem sessão ou sem permissão', () => {
    const s: Sessao = { usuarioId: 'u', nome: 'n', email: 'e', perfil: 'SUPERVISOR', gerenciaId: null, equipeId: 'eq', ip: null };
    expect(() => exigir(null, 'dashboard')).toThrow();
    expect(() => exigir(s, 'usuarios')).toThrow();
    expect(() => exigir(s, 'cotas', 'editar')).toThrow();
    expect(() => exigir(s, 'cotas', 'ver')).not.toThrow();
  });
});

describe('recorte de visibilidade', () => {
  const base = { usuarioId: 'u', nome: 'n', email: 'e', ip: null };
  it('gerente vê a gerência; supervisor a equipe; sem unidade não vê nada', () => {
    expect(escopoCotas({ ...base, perfil: 'GERENTE', gerenciaId: 'g1', equipeId: null })).toEqual({ snapGerenciaId: 'g1' });
    expect(escopoCotas({ ...base, perfil: 'SUPERVISOR', gerenciaId: null, equipeId: 'e1' })).toEqual({ snapEquipeId: 'e1' });
    expect(recorteDe({ ...base, perfil: 'GERENTE', gerenciaId: null, equipeId: null }).tipo).toBe('NENHUM');
    expect(escopoCotas({ ...base, perfil: 'GERENTE', gerenciaId: null, equipeId: null })).toEqual({ id: '__sem_escopo__' });
    expect(escopoVendedores({ ...base, perfil: 'SUPERVISOR', gerenciaId: null, equipeId: null })).toEqual({ id: '__sem_escopo__' });
    expect(escopoCotas({ ...base, perfil: 'FINANCEIRO', gerenciaId: null, equipeId: null })).toEqual({});
  });
});

describe('pessoa desligada', () => {
  it('só quando TODOS os documentos pararam; sem documento não é desligada', () => {
    expect(pessoaDesligada([{ status: 'DESLIGADO' }, { status: 'ATIVO' }])).toBe(false);
    expect(pessoaDesligada([{ status: 'DESLIGADO' }, { status: 'DESLIGADO' }])).toBe(true);
    expect(pessoaDesligada([])).toBe(false);
  });
});

describe('encaixe na linha do tempo', () => {
  const D = (s: string) => deISO(s) as Date;
  const lista = [
    { id: 'a', vigenteDe: D('2026-01-01'), vigenteAte: D('2026-05-31') },
    { id: 'b', vigenteDe: D('2026-06-01'), vigenteAte: null },
  ];
  it('data passada antes do primeiro período termina na véspera dele', () => {
    const p = planejarNaLinhaDoTempo(lista, D('2025-03-01'));
    expect(p.anterior).toBeNull();
    expect(p.seguinte?.id).toBe('a');
    expect(p.vigenteAte?.getTime()).toBe(D('2025-12-31').getTime());
  });
  it('data no meio de um período encerra-o na véspera e herda o fim dele', () => {
    const p = planejarNaLinhaDoTempo(lista, D('2026-03-01'));
    expect(p.anterior?.id).toBe('a');
    expect(p.encerrarAnteriorEm?.getTime()).toBe(D('2026-02-28').getTime());
    expect(p.vigenteAte?.getTime()).toBe(D('2026-05-31').getTime());
  });
  it('data depois do último período aberto encerra o último', () => {
    const p = planejarNaLinhaDoTempo(lista, D('2026-10-01'));
    expect(p.anterior?.id).toBe('b');
    expect(p.vigenteAte).toBeNull();
  });
  it('mesma data de início é identificada', () => {
    expect(planejarNaLinhaDoTempo(lista, D('2026-06-01')).mesma?.id).toBe('b');
  });
});
