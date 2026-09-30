-- CreateEnum
CREATE TYPE "TipoNegociacaoCarta" AS ENUM ('COMPRA_VENDA', 'INTERMEDIACAO');

-- CreateEnum
CREATE TYPE "StatusCarta" AS ENUM ('ESTOQUE', 'VENDIDA', 'TRANSFERIDA');

-- CreateTable
CREATE TABLE "cliente_carta" (
    "id" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "documento" TEXT NOT NULL,
    "tipoDocumento" "TipoDocumento" NOT NULL,
    "telefone" TEXT,
    "email" TEXT,
    "criadoPorId" TEXT,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizadoEm" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "cliente_carta_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vendedor_carta" (
    "id" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "telefone" TEXT,
    "email" TEXT,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "criadoPorId" TEXT,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizadoEm" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "vendedor_carta_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "carta" (
    "id" TEXT NOT NULL,
    "codigo" TEXT NOT NULL,
    "administradoraId" TEXT NOT NULL,
    "tipoNegociacao" "TipoNegociacaoCarta" NOT NULL DEFAULT 'COMPRA_VENDA',
    "status" "StatusCarta" NOT NULL DEFAULT 'ESTOQUE',
    "vendedorCartaId" TEXT,
    "clienteVendedorId" TEXT NOT NULL,
    "clienteCompradorId" TEXT,
    "valorCarta" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "valorCompra" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "valorVenda" DECIMAL(18,2),
    "valorParcela" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "parcelasPagas" INTEGER NOT NULL DEFAULT 0,
    "parcelasAPagar" INTEGER NOT NULL DEFAULT 0,
    "comissaoVendedor" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "dataCompra" DATE NOT NULL,
    "dataVenda" DATE,
    "dataTransferencia" DATE,
    "observacoes" TEXT,
    "lucro" DECIMAL(18,2),
    "criadoPorId" TEXT,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizadoEm" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "carta_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "cliente_carta_documento_key" ON "cliente_carta"("documento");

-- CreateIndex
CREATE INDEX "cliente_carta_nome_idx" ON "cliente_carta"("nome");

-- CreateIndex
CREATE UNIQUE INDEX "carta_codigo_key" ON "carta"("codigo");

-- CreateIndex
CREATE INDEX "carta_status_idx" ON "carta"("status");

-- CreateIndex
CREATE INDEX "carta_tipoNegociacao_idx" ON "carta"("tipoNegociacao");

-- CreateIndex
CREATE INDEX "carta_administradoraId_idx" ON "carta"("administradoraId");

-- CreateIndex
CREATE INDEX "carta_vendedorCartaId_idx" ON "carta"("vendedorCartaId");

-- CreateIndex
CREATE INDEX "carta_dataCompra_idx" ON "carta"("dataCompra");

-- CreateIndex
CREATE INDEX "carta_dataVenda_idx" ON "carta"("dataVenda");

-- AddForeignKey
ALTER TABLE "carta" ADD CONSTRAINT "carta_administradoraId_fkey" FOREIGN KEY ("administradoraId") REFERENCES "administradora"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "carta" ADD CONSTRAINT "carta_vendedorCartaId_fkey" FOREIGN KEY ("vendedorCartaId") REFERENCES "vendedor_carta"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "carta" ADD CONSTRAINT "carta_clienteVendedorId_fkey" FOREIGN KEY ("clienteVendedorId") REFERENCES "cliente_carta"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "carta" ADD CONSTRAINT "carta_clienteCompradorId_fkey" FOREIGN KEY ("clienteCompradorId") REFERENCES "cliente_carta"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ============================================================
-- Apêndice manual (mesmo estilo de 20260924000002_integridade): código
-- sequencial da carta e validação condicional por status, que o Prisma não expressa.
-- ============================================================

-- Código "CART-0001" gerado pelo serviço (cadastrarCarta) via SELECT nextval(...); sem trigger.
CREATE SEQUENCE IF NOT EXISTS carta_codigo_seq;

-- Situação da carta: ESTOQUE não exige nada extra; VENDIDA exige comprador e data da venda;
-- TRANSFERIDA exige data da transferência (transferida para o nome da própria empresa).
ALTER TABLE "carta" ADD CONSTRAINT ck_carta_situacao CHECK (
  CASE "status"
    WHEN 'ESTOQUE' THEN TRUE
    WHEN 'VENDIDA' THEN "clienteCompradorId" IS NOT NULL AND "dataVenda" IS NOT NULL
    WHEN 'TRANSFERIDA' THEN "dataTransferencia" IS NOT NULL
    ELSE FALSE
  END
);
