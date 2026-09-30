/**
 * Migração única dos dados do módulo "Cartas Contempladas" do Supabase antigo
 * (repo wrconsorcio/github-import-helper) para o Postgres do ERP.
 *
 *   SUPABASE_DB_URL=... DATABASE_URL=... DIRECT_URL=... tsx scripts/migrar-cartas-contempladas.ts
 *
 * SUPABASE_DB_URL é só para LEITURA da origem (via `pg`, sem o SDK do Supabase — não precisamos
 * de auth/storage, só das tabelas). A escrita no ERP é sempre via Prisma. Rode primeiro contra
 * uma cópia/branch de teste do banco do Supabase (ver docs/plano) e confira as contagens e as
 * divergências de lucro logadas antes de rodar contra o dado real.
 *
 * Passe SOMENTE_CONTAR=1 para só ler a origem, mostrar as contagens e sair sem escrever nada.
 *
 * Ordem (por causa das FKs): Administradora (resolve-or-create, normalizando casing UMA vez,
 * aqui) → ClienteCarta → VendedorCarta → Carta (reaproveita o código original; recalcula o lucro
 * com calcularLucro() do próprio domínio e só LOGA divergência com o valor gravado na origem —
 * nunca sobrescreve silenciosamente).
 */
import { Client } from 'pg';
import { PrismaClient } from '@prisma/client';
import { calcularLucro } from '../src/dominio/cartas';
import { somenteDigitos, tipoDoDocumento } from '../src/lib/documento';

const prisma = new PrismaClient();
const somenteContar = process.env.SOMENTE_CONTAR === '1';

// ---------------- Tipos da origem (Supabase antigo) ----------------

interface ClienteOrigem {
  id: string;
  nome: string;
  documento: string;
  tipo_pessoa: 'fisica' | 'juridica';
  telefone: string | null;
  email: string | null;
  created_at: Date;
}

interface VendedorOrigem {
  id: string;
  nome: string;
  telefone: string | null;
  email: string | null;
  ativo: boolean;
  created_at: Date;
}

interface CartaOrigem {
  id: string;
  codigo: string;
  administradora: string;
  tipo_negociacao: 'compra_venda' | 'intermediacao';
  status: 'estoque' | 'vendida' | 'transferida';
  vendedor_id: string | null;
  cliente_vendedor_id: string;
  cliente_comprador_id: string | null;
  valor_carta: string;
  valor_compra: string;
  valor_venda: string | null;
  valor_parcela: string;
  parcelas_pagas: number;
  parcelas_a_pagar: number;
  comissao_vendedor: string;
  data_compra: Date;
  data_venda: Date | null;
  data_transferencia: Date | null;
  observacoes: string | null;
  lucro: string | null; // coluna gerada na origem — só usada pra checagem de integridade
  created_at: Date;
}

// ---------------- Administradora: mesmo agrupamento por maioria do app antigo (lib/administradora.ts) ----------------

/** Agrupa nomes ignorando maiúsculas/minúsculas e escolhe a grafia mais usada como "canônica". */
function agruparPorMaioria(nomes: string[]): Map<string, string> {
  const contagemPorChave = new Map<string, Map<string, number>>();
  for (const nome of nomes) {
    const chave = nome.trim().toLowerCase();
    if (!chave) continue;
    const formas = contagemPorChave.get(chave) ?? new Map<string, number>();
    formas.set(nome, (formas.get(nome) ?? 0) + 1);
    contagemPorChave.set(chave, formas);
  }
  const canonico = new Map<string, string>();
  for (const [chave, formas] of contagemPorChave) {
    let melhorForma = chave;
    let melhorContagem = -1;
    for (const [forma, contagem] of formas) {
      if (contagem > melhorContagem) {
        melhorForma = forma;
        melhorContagem = contagem;
      }
    }
    canonico.set(chave, melhorForma);
  }
  return canonico;
}

function codigoDeAdministradora(nome: string, usados: Set<string>): string {
  const base = nome
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 16) || 'ADMINISTRADORA';
  let codigo = base;
  let n = 2;
  while (usados.has(codigo)) {
    codigo = `${base.slice(0, 18)}${n}`;
    n++;
  }
  usados.add(codigo);
  return codigo;
}

/** Resolve (ou cria) cada administradora canônica da origem → mapa "nome canônico" → id no ERP. */
async function migrarAdministradoras(nomesBrutos: string[]): Promise<Map<string, string>> {
  const canonicoPorChave = agruparPorMaioria(nomesBrutos);
  const existentes = await prisma.administradora.findMany();
  const codigosUsados = new Set(existentes.map((a) => a.codigo));
  const idPorNomeCanonico = new Map<string, string>();

  for (const nomeCanonico of new Set(canonicoPorChave.values())) {
    const existente = existentes.find((a) => a.nome.trim().toLowerCase() === nomeCanonico.trim().toLowerCase());
    if (existente) {
      idPorNomeCanonico.set(nomeCanonico, existente.id);
      continue;
    }
    if (somenteContar) {
      idPorNomeCanonico.set(nomeCanonico, `(nova: ${nomeCanonico})`);
      continue;
    }
    const codigo = codigoDeAdministradora(nomeCanonico, codigosUsados);
    const criada = await prisma.administradora.create({ data: { codigo, nome: nomeCanonico } });
    console.log(`  + administradora nova: ${criada.codigo} — ${criada.nome}`);
    idPorNomeCanonico.set(nomeCanonico, criada.id);
  }

  // mapa auxiliar: chave em minúsculo (como aparece bruto na carta de origem) → id
  const idPorChaveOriginal = new Map<string, string>();
  for (const [chave, nomeCanonico] of canonicoPorChave) {
    const id = idPorNomeCanonico.get(nomeCanonico);
    if (id) idPorChaveOriginal.set(chave, id);
  }
  return idPorChaveOriginal;
}

// ---------------- Clientes ----------------

async function migrarClientes(clientes: ClienteOrigem[]): Promise<Map<string, string>> {
  const mapa = new Map<string, string>();
  for (const c of clientes) {
    const doc = somenteDigitos(c.documento);
    const tipoEsperado = c.tipo_pessoa === 'juridica' ? 'CNPJ' : 'CPF';
    const docAjustado = doc.padStart(tipoEsperado === 'CNPJ' ? 14 : 11, '0');
    const tipoDocumento = tipoDoDocumento(docAjustado) ?? tipoEsperado;
    if (tipoDoDocumento(docAjustado) === null) {
      console.warn(`  ! cliente ${c.id} (${c.nome}): documento "${c.documento}" não bate com CPF nem CNPJ mesmo ajustado — usando ${tipoDocumento} como veio da origem.`);
    }
    if (somenteContar) { mapa.set(c.id, '(contagem)'); continue; }
    const gravado = await prisma.clienteCarta.upsert({
      where: { documento: docAjustado },
      update: {},
      create: {
        nome: c.nome.trim(), documento: docAjustado, tipoDocumento, telefone: c.telefone, email: c.email,
        criadoEm: c.created_at,
      },
    });
    mapa.set(c.id, gravado.id);
  }
  return mapa;
}

// ---------------- Vendedores ----------------

async function migrarVendedores(vendedores: VendedorOrigem[]): Promise<Map<string, string>> {
  const mapa = new Map<string, string>();
  for (const v of vendedores) {
    if (somenteContar) { mapa.set(v.id, '(contagem)'); continue; }
    const existente = await prisma.vendedorCarta.findFirst({ where: { nome: v.nome.trim() } });
    const gravado = existente ?? await prisma.vendedorCarta.create({
      data: { nome: v.nome.trim(), telefone: v.telefone, email: v.email, ativo: v.ativo, criadoEm: v.created_at },
    });
    mapa.set(v.id, gravado.id);
  }
  return mapa;
}

// ---------------- Cartas ----------------

async function migrarCartas(
  cartas: CartaOrigem[],
  administradoraPorChave: Map<string, string>,
  clientePorIdOrigem: Map<string, string>,
  vendedorPorIdOrigem: Map<string, string>,
): Promise<{ migradas: number; divergenciasLucro: number }> {
  let migradas = 0;
  let divergenciasLucro = 0;
  for (const c of cartas) {
    const administradoraId = administradoraPorChave.get(c.administradora.trim().toLowerCase());
    const clienteVendedorId = clientePorIdOrigem.get(c.cliente_vendedor_id);
    const clienteCompradorId = c.cliente_comprador_id ? clientePorIdOrigem.get(c.cliente_comprador_id) : null;
    const vendedorCartaId = c.vendedor_id ? vendedorPorIdOrigem.get(c.vendedor_id) : null;

    if (!administradoraId) { console.error(`  ! carta ${c.codigo}: administradora "${c.administradora}" não resolvida — pulando.`); continue; }
    if (!clienteVendedorId) { console.error(`  ! carta ${c.codigo}: cliente vendedor de origem ${c.cliente_vendedor_id} não resolvido — pulando.`); continue; }

    const status = c.status.toUpperCase() as 'ESTOQUE' | 'VENDIDA' | 'TRANSFERIDA';
    const tipoNegociacao = c.tipo_negociacao.toUpperCase() as 'COMPRA_VENDA' | 'INTERMEDIACAO';

    // Checagem de integridade: recalcula o lucro com a função real do domínio e só LOGA
    // divergência com o valor gravado na origem — nunca sobrescreve silenciosamente.
    let lucro: string | null = null;
    if (status === 'VENDIDA' && c.valor_venda !== null) {
      const recalculado = calcularLucro(c.valor_venda, c.valor_compra, c.comissao_vendedor);
      lucro = recalculado.toFixed(2);
      if (c.lucro !== null && recalculado.toFixed(2) !== Number(c.lucro).toFixed(2)) {
        divergenciasLucro++;
        console.warn(`  ! carta ${c.codigo}: lucro da origem (${c.lucro}) diverge do recalculado (${lucro}).`);
      }
    }

    if (somenteContar) { migradas++; continue; }

    await prisma.carta.upsert({
      where: { codigo: c.codigo },
      update: {},
      create: {
        codigo: c.codigo,
        administradoraId,
        tipoNegociacao,
        status,
        vendedorCartaId: vendedorCartaId ?? null,
        clienteVendedorId,
        clienteCompradorId: status === 'VENDIDA' ? (clienteCompradorId ?? null) : null,
        valorCarta: c.valor_carta,
        valorCompra: c.valor_compra,
        valorVenda: status === 'VENDIDA' ? c.valor_venda : null,
        valorParcela: c.valor_parcela,
        parcelasPagas: c.parcelas_pagas,
        parcelasAPagar: c.parcelas_a_pagar,
        comissaoVendedor: c.comissao_vendedor,
        dataCompra: c.data_compra,
        dataVenda: status === 'VENDIDA' ? c.data_venda : null,
        dataTransferencia: status === 'TRANSFERIDA' ? c.data_transferencia : null,
        observacoes: c.observacoes,
        lucro,
        criadoEm: c.created_at,
      },
    });
    migradas++;
  }
  return { migradas, divergenciasLucro };
}

async function main() {
  const supabaseUrl = process.env.SUPABASE_DB_URL;
  if (!supabaseUrl) throw new Error('Informe SUPABASE_DB_URL (conexão SOMENTE LEITURA com o Postgres antigo do Supabase).');

  const origem = new Client({ connectionString: supabaseUrl, ssl: process.env.SUPABASE_DB_SSL === 'false' ? undefined : { rejectUnauthorized: false } });
  await origem.connect();
  try {
    const [clientesR, vendedoresR, cartasR] = await Promise.all([
      origem.query<ClienteOrigem>('SELECT * FROM public.clientes ORDER BY created_at ASC'),
      origem.query<VendedorOrigem>('SELECT * FROM public.vendedores ORDER BY created_at ASC'),
      origem.query<CartaOrigem>('SELECT * FROM public.cartas ORDER BY created_at ASC'),
    ]);
    const clientes = clientesR.rows;
    const vendedores = vendedoresR.rows;
    const cartas = cartasR.rows;

    console.log(`Origem: ${clientes.length} cliente(s), ${vendedores.length} vendedor(es), ${cartas.length} carta(s).`);
    if (somenteContar) console.log('SOMENTE_CONTAR=1 — nada será gravado no ERP.\n');

    console.log('\n1) Administradoras…');
    const administradoraPorChave = await migrarAdministradoras(cartas.map((c) => c.administradora));
    console.log(`   ${new Set(administradoraPorChave.values()).size} administradora(s) resolvida(s).`);

    console.log('\n2) Clientes…');
    const clientePorIdOrigem = await migrarClientes(clientes);
    console.log(`   ${clientePorIdOrigem.size} cliente(s) migrado(s)/resolvido(s).`);

    console.log('\n3) Vendedores…');
    const vendedorPorIdOrigem = await migrarVendedores(vendedores);
    console.log(`   ${vendedorPorIdOrigem.size} vendedor(es) migrado(s)/resolvido(s).`);

    console.log('\n4) Cartas…');
    const { migradas, divergenciasLucro } = await migrarCartas(cartas, administradoraPorChave, clientePorIdOrigem, vendedorPorIdOrigem);
    console.log(`   ${migradas}/${cartas.length} carta(s) migrada(s). ${divergenciasLucro} divergência(s) de lucro logada(s) acima.`);

    if (!somenteContar) {
      await prisma.auditLog.create({
        data: { acao: 'IMPORTACAO', entidade: 'Carta', contexto: { origem: 'script migrar-cartas-contempladas', clientes: clientes.length, vendedores: vendedores.length, cartas: migradas, divergenciasLucro } },
      });
    }
    console.log('\nConcluído.');
  } finally {
    await origem.end();
  }
}

main()
  .catch((e) => {
    console.error(e instanceof Error ? e.message : e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
