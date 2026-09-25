-- Percentual de estorno por participante (categoria do vendedor, SUPERVISAO ou GERENCIA).
-- Nulo = regra padrão, que vale para quem não tiver percentual próprio. Nada existente muda.
ALTER TABLE "regra_estorno" ADD COLUMN "participante" TEXT;

ALTER TABLE "regra_estorno" DROP CONSTRAINT ex_regra_estorno_sobreposicao;
ALTER TABLE "regra_estorno" ADD CONSTRAINT ex_regra_estorno_sobreposicao
  EXCLUDE USING gist (
    "tipo" WITH =,
    COALESCE("participante", '') WITH =,
    COALESCE("titularVendedorId", '') WITH =,
    daterange("vigenteDe", "vigenteAte", '[]') WITH &&
  );

-- Exceção individual (titular) já identifica a pessoa; não se combina com participante.
ALTER TABLE "regra_estorno" ADD CONSTRAINT ck_regra_estorno_escopo
  CHECK ("participante" IS NULL OR "titularVendedorId" IS NULL);
