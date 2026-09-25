-- Critério de parcelas pagas para o estorno por RECUPERAÇÃO (ex.: cancelada com menos de 6 pagas).
-- Nulos = qualquer quantidade (comportamento anterior). Nada existente muda.
ALTER TABLE "configuracao_estorno" ADD COLUMN "criterioRecuperacao" "CriterioCancelamento";
ALTER TABLE "configuracao_estorno" ADD COLUMN "limiteRecuperacao" INTEGER;
ALTER TABLE "configuracao_estorno" ADD CONSTRAINT ck_configuracao_estorno_recuperacao
  CHECK (("criterioRecuperacao" IS NULL) = ("limiteRecuperacao" IS NULL) AND ("limiteRecuperacao" IS NULL OR "limiteRecuperacao" >= 1));
