-- Regra da WR: o CNPJ Expert não vende; recebe o % do Expert sobre as vendas do CNPJ Veterano da
-- mesma pessoa (pago pela administradora), a partir da data em que virou Expert, e devolve estorno.

ALTER TYPE "DestinoComissao" ADD VALUE IF NOT EXISTS 'EXPERT';

ALTER TABLE "categoria_vendedor" ADD COLUMN "recebeSobreOutrosDocumentos" BOOLEAN NOT NULL DEFAULT false;
UPDATE "categoria_vendedor" SET "recebeSobreOutrosDocumentos" = true WHERE "codigo" = 'EXPERT';

ALTER TABLE "cota" ADD COLUMN "snapExpertVendedorId" TEXT;
ALTER TABLE "cota" ADD COLUMN "snapExpertCategoriaId" TEXT;
ALTER TABLE "cota" ADD COLUMN "snapExpertPagaPelaWr" BOOLEAN;
ALTER TABLE "cota" ADD CONSTRAINT "cota_snapExpertVendedorId_fkey" FOREIGN KEY ("snapExpertVendedorId") REFERENCES "vendedor"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "cota" ADD CONSTRAINT "cota_snapExpertCategoriaId_fkey" FOREIGN KEY ("snapExpertCategoriaId") REFERENCES "categoria_vendedor"("id") ON DELETE SET NULL ON UPDATE CASCADE;
CREATE INDEX "cota_snapExpertVendedorId_idx" ON "cota"("snapExpertVendedorId");

-- Quem paga a linha do Expert: o que a categoria dele (congelada na venda) diz.
CREATE OR REPLACE FUNCTION fn_comissao_quem_paga() RETURNS trigger AS $$
DECLARE
  v_paga boolean;
BEGIN
  -- Ajustes carregam quem pagou a linha original (ex.: devolução após troca de categoria).
  IF NEW."ajusteDeId" IS NOT NULL THEN
    RETURN NEW;
  END IF;
  IF NEW."destino"::text = 'VENDEDOR' THEN
    SELECT q."snapPagaPelaWr" INTO v_paga FROM "cota" q WHERE q."id" = NEW."cotaId";
    IF v_paga IS NULL THEN
      RAISE EXCEPTION 'Comissão de vendedor sem categoria congelada na cota %', NEW."cotaId";
    END IF;
    IF NEW."pagaPelaWr" <> v_paga THEN
      RAISE EXCEPTION 'Quem paga incoerente: categoria da venda diz pagaPelaWr=%, comissão diz %', v_paga, NEW."pagaPelaWr";
    END IF;
  ELSIF NEW."destino"::text = 'EXPERT' THEN
    SELECT q."snapExpertPagaPelaWr" INTO v_paga FROM "cota" q WHERE q."id" = NEW."cotaId";
    IF v_paga IS NULL THEN
      RAISE EXCEPTION 'Comissão de Expert sem documento Expert congelado na cota %', NEW."cotaId";
    END IF;
    IF NEW."pagaPelaWr" <> v_paga THEN
      RAISE EXCEPTION 'Quem paga incoerente: categoria do Expert diz pagaPelaWr=%, comissão diz %', v_paga, NEW."pagaPelaWr";
    END IF;
  ELSIF NOT NEW."pagaPelaWr" THEN
    RAISE EXCEPTION 'Supervisão e gerência são sempre pagas pela WR';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- A linha do Expert também tem documento (o CNPJ Expert) como titular.
ALTER TABLE "comissao_apurada" DROP CONSTRAINT ck_comissao_titular;
ALTER TABLE "comissao_apurada" ADD CONSTRAINT ck_comissao_titular CHECK (("destino"::text IN ('VENDEDOR', 'EXPERT')) = ("titularVendedorId" IS NOT NULL));
