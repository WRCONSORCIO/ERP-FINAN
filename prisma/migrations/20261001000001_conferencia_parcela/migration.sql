-- Regra da WR: a WR não recebe a 2ª parcela do Iniciante da administradora, mas paga o vendedor. Quando o cliente
-- paga essa parcela, a comissão fica prevista com um aviso até alguém decidir (Pagar / Não pagar), com rastro.

ALTER TYPE "TipoPendencia" ADD VALUE IF NOT EXISTS 'CONFERENCIA_PARCELA';
CREATE TYPE "DecisaoConferencia" AS ENUM ('PAGAR', 'NAO_PAGAR');

ALTER TABLE "categoria_vendedor" ADD COLUMN "parcelasConferenciaManual" INTEGER[] NOT NULL DEFAULT ARRAY[]::INTEGER[];
UPDATE "categoria_vendedor" SET "parcelasConferenciaManual" = ARRAY[2] WHERE "codigo" = 'INICIANTE';

ALTER TABLE "cota" ADD COLUMN "snapParcelasConferencia" INTEGER[] NOT NULL DEFAULT ARRAY[]::INTEGER[];
-- Vendas já registradas passam a seguir a regra; o que já foi liberado ou pago não muda (a apuração só segura liberação nova).
UPDATE "cota" c SET "snapParcelasConferencia" = cat."parcelasConferenciaManual"
  FROM "categoria_vendedor" cat WHERE cat."id" = c."snapCategoriaId" AND cardinality(cat."parcelasConferenciaManual") > 0;

CREATE TABLE "conferencia_parcela" (
    "id" TEXT NOT NULL,
    "cotaId" TEXT NOT NULL,
    "parcela" INTEGER NOT NULL,
    "decisao" "DecisaoConferencia" NOT NULL,
    "motivo" TEXT NOT NULL,
    "decididoPorId" TEXT NOT NULL,
    "decididoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "conferencia_parcela_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "conferencia_parcela_cotaId_parcela_key" ON "conferencia_parcela"("cotaId", "parcela");
ALTER TABLE "conferencia_parcela" ADD CONSTRAINT "conferencia_parcela_cotaId_fkey" FOREIGN KEY ("cotaId") REFERENCES "cota"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "conferencia_parcela" ADD CONSTRAINT "conferencia_parcela_decididoPorId_fkey" FOREIGN KEY ("decididoPorId") REFERENCES "usuario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "conferencia_parcela" ADD CONSTRAINT ck_conferencia_parcela CHECK ("parcela" >= 1 AND length(trim("motivo")) > 0);
