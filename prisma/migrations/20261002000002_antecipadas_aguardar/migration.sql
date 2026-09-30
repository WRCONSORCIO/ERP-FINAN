-- Antecipação: a base informa quantas das parcelas pagas foram antecipadas (o cliente paga as ÚLTIMAS parcelas).
-- A conferência da 2ª parcela do Iniciante passa a contar só as pagas em sequência (pagas − antecipadas).
ALTER TABLE "cota" ADD COLUMN "parcelasAntecipadas" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "cota" ADD CONSTRAINT ck_cota_antecipadas CHECK ("parcelasAntecipadas" >= 0 AND "parcelasAntecipadas" <= "parcelasPagas");

-- "Ainda não pagou — perguntar de novo": sai da lista e volta quando o cliente pagar mais uma parcela.
ALTER TYPE "DecisaoConferencia" ADD VALUE IF NOT EXISTS 'AGUARDAR';
ALTER TABLE "conferencia_parcela" ADD COLUMN "parcelasNaDecisao" INTEGER;
