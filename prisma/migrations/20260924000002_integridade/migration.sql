-- ============================================================
-- Integridade que não depende do código da aplicação (seção 09).
-- ============================================================

CREATE EXTENSION IF NOT EXISTS btree_gist;

-- ---------- Vigência coerente (fim nunca antes do início) ----------
ALTER TABLE "vendedor_categoria"   ADD CONSTRAINT ck_vendedor_categoria_vigencia   CHECK ("vigenteAte" IS NULL OR "vigenteAte" >= "vigenteDe");
ALTER TABLE "vendedor_alocacao"    ADD CONSTRAINT ck_vendedor_alocacao_vigencia    CHECK ("vigenteAte" IS NULL OR "vigenteAte" >= "vigenteDe");
ALTER TABLE "responsavel_unidade"  ADD CONSTRAINT ck_responsavel_vigencia          CHECK ("vigenteAte" IS NULL OR "vigenteAte" >= "vigenteDe");
ALTER TABLE "periodo_recuperacao"  ADD CONSTRAINT ck_recuperacao_vigencia          CHECK ("fim" IS NULL OR "fim" >= "inicio");
ALTER TABLE "tabela_comissao"      ADD CONSTRAINT ck_tabela_comissao_vigencia      CHECK ("vigenteAte" IS NULL OR "vigenteAte" >= "vigenteDe");
ALTER TABLE "modalidade_flex"      ADD CONSTRAINT ck_modalidade_flex_vigencia      CHECK ("vigenteAte" IS NULL OR "vigenteAte" >= "vigenteDe");
ALTER TABLE "configuracao_estorno" ADD CONSTRAINT ck_configuracao_estorno_vigencia CHECK ("vigenteAte" IS NULL OR "vigenteAte" >= "vigenteDe");
ALTER TABLE "regra_estorno"        ADD CONSTRAINT ck_regra_estorno_vigencia        CHECK ("vigenteAte" IS NULL OR "vigenteAte" >= "vigenteDe");
ALTER TABLE "meta_promocao"        ADD CONSTRAINT ck_meta_promocao_vigencia        CHECK ("vigenteAte" IS NULL OR "vigenteAte" >= "vigenteDe");

-- ---------- Vigência sem sobreposição (EXCLUDE USING gist) ----------
ALTER TABLE "vendedor_categoria" ADD CONSTRAINT ex_vendedor_categoria_sobreposicao
  EXCLUDE USING gist ("vendedorId" WITH =, daterange("vigenteDe", "vigenteAte", '[]') WITH &&);

ALTER TABLE "vendedor_alocacao" ADD CONSTRAINT ex_vendedor_alocacao_sobreposicao
  EXCLUDE USING gist ("vendedorId" WITH =, daterange("vigenteDe", "vigenteAte", '[]') WITH &&);

-- Períodos de recuperação cancelados são ignorados (não apagados).
ALTER TABLE "periodo_recuperacao" ADD CONSTRAINT ex_recuperacao_sobreposicao
  EXCLUDE USING gist ("vendedorId" WITH =, daterange("inicio", "fim", '[]') WITH &&) WHERE ("canceladoEm" IS NULL);

-- Uma unidade tem um único responsável por vez.
ALTER TABLE "responsavel_unidade" ADD CONSTRAINT ex_responsavel_sobreposicao
  EXCLUDE USING gist (
    "papel" WITH =,
    (COALESCE("gerenciaId", '') || '|' || COALESCE("equipeId", '')) WITH =,
    daterange("vigenteDe", "vigenteAte", '[]') WITH &&
  );

ALTER TABLE "tabela_comissao" ADD CONSTRAINT ex_tabela_comissao_sobreposicao
  EXCLUDE USING gist (
    "destino" WITH =,
    "segmentoId" WITH =,
    (COALESCE("categoriaId", '') || '|' || COALESCE("titularVendedorId", '') || '|' || COALESCE("titularPessoaId", '')) WITH =,
    daterange("vigenteDe", "vigenteAte", '[]') WITH &&
  );

ALTER TABLE "modalidade_flex" ADD CONSTRAINT ex_modalidade_flex_sobreposicao
  EXCLUDE USING gist ("codigo" WITH =, daterange("vigenteDe", "vigenteAte", '[]') WITH &&);

ALTER TABLE "configuracao_estorno" ADD CONSTRAINT ex_configuracao_estorno_sobreposicao
  EXCLUDE USING gist (daterange("vigenteDe", "vigenteAte", '[]') WITH &&);

ALTER TABLE "regra_estorno" ADD CONSTRAINT ex_regra_estorno_sobreposicao
  EXCLUDE USING gist (
    "tipo" WITH =,
    COALESCE("titularVendedorId", '') WITH =,
    daterange("vigenteDe", "vigenteAte", '[]') WITH &&
  );

ALTER TABLE "meta_promocao" ADD CONSTRAINT ex_meta_promocao_sobreposicao
  EXCLUDE USING gist ("categoriaOrigemId" WITH =, daterange("vigenteDe", "vigenteAte", '[]') WITH &&);

-- ---------- Papel coerente ----------
ALTER TABLE "responsavel_unidade" ADD CONSTRAINT ck_responsavel_papel CHECK (
  ("papel" = 'GERENTE'    AND "gerenciaId" IS NOT NULL AND "equipeId" IS NULL) OR
  ("papel" = 'SUPERVISOR' AND "equipeId" IS NOT NULL AND "gerenciaId" IS NULL)
);

-- Exceção de comissão: titular coerente com o destino.
ALTER TABLE "tabela_comissao" ADD CONSTRAINT ck_tabela_comissao_destino CHECK (
  ("destino" = 'VENDEDOR' AND "categoriaId" IS NOT NULL AND "titularPessoaId" IS NULL) OR
  ("destino" IN ('SUPERVISAO', 'GERENCIA') AND "categoriaId" IS NULL AND "titularVendedorId" IS NULL)
);

-- ---------- Valores válidos ----------
ALTER TABLE "faixa_comissao"       ADD CONSTRAINT ck_faixa_parcela     CHECK ("parcela" >= 1);
ALTER TABLE "faixa_comissao"       ADD CONSTRAINT ck_faixa_percentual  CHECK ("percentual" >= 0 AND "percentual" <= 100);
ALTER TABLE "modalidade_flex"      ADD CONSTRAINT ck_flex_percentual   CHECK ("percentual" > 0 AND "percentual" <= 100);
ALTER TABLE "regra_estorno"        ADD CONSTRAINT ck_regra_estorno_pct CHECK ("percentual" >= 0 AND "percentual" <= 100);
ALTER TABLE "configuracao_estorno" ADD CONSTRAINT ck_config_estorno_limite CHECK ("limiteParcelas" >= 0);
ALTER TABLE "meta_promocao"        ADD CONSTRAINT ck_meta_valores CHECK ("volumeMinimo" > 0 AND "alertaAoFaltar" >= 0);
ALTER TABLE "meta_promocao"        ADD CONSTRAINT ck_meta_categorias CHECK ("categoriaOrigemId" <> "categoriaAlvoId");
ALTER TABLE "cota"                 ADD CONSTRAINT ck_cota_credito CHECK ("credito" >= 0);
ALTER TABLE "cota"                 ADD CONSTRAINT ck_cota_parcelas CHECK ("parcelasPagas" >= 0);
ALTER TABLE "cota"                 ADD CONSTRAINT ck_cota_snap_categoria CHECK (
  ("snapCategoriaId" IS NULL) = ("snapPagaPelaWr" IS NULL) AND ("snapCategoriaId" IS NULL) = ("snapGeraSupervisao" IS NULL) AND ("snapCategoriaId" IS NULL) = ("snapGeraGerencia" IS NULL)
);
ALTER TABLE "cota"                 ADD CONSTRAINT ck_cota_cancelamento CHECK (NOT "cancelada" OR "dataCancelamento" IS NOT NULL);
ALTER TABLE "comissao_apurada"     ADD CONSTRAINT ck_comissao_parcela CHECK ("parcela" >= 1);
ALTER TABLE "comissao_apurada"     ADD CONSTRAINT ck_comissao_valores CHECK ("base" >= 0 AND ("valor" >= 0 OR "ajusteDeId" IS NOT NULL) AND "percentual" >= 0 AND "percentual" <= 100);
ALTER TABLE "comissao_apurada"     ADD CONSTRAINT ck_comissao_titular CHECK (("destino" = 'VENDEDOR') = ("titularVendedorId" IS NOT NULL));
ALTER TABLE "comissao_apurada"     ADD CONSTRAINT ck_comissao_liberacao CHECK (
  ("status" IN ('PREVISTA', 'CANCELADA')) OR ("liberadaEm" IS NOT NULL AND "parcelasPagasNaLiberacao" IS NOT NULL)
);
ALTER TABLE "comissao_apurada"     ADD CONSTRAINT ck_comissao_folha CHECK (("status" IN ('EM_FOLHA', 'PAGA')) = ("folhaId" IS NOT NULL));
ALTER TABLE "comissao_apurada"     ADD CONSTRAINT ck_comissao_folha_paga_wr CHECK ("folhaId" IS NULL OR "pagaPelaWr");
ALTER TABLE "comissao_apurada"     ADD CONSTRAINT ck_comissao_cancelada CHECK (("status" = 'CANCELADA') = ("canceladaEm" IS NOT NULL));
ALTER TABLE "estorno"              ADD CONSTRAINT ck_estorno_valores CHECK ("comissaoBase" >= 0 AND "valor" >= 0 AND "percentual" >= 0 AND "percentual" <= 100);
ALTER TABLE "estorno"              ADD CONSTRAINT ck_estorno_invalidado CHECK (("status" = 'INVALIDADO') = ("invalidadoEm" IS NOT NULL));
ALTER TABLE "folha_comissao"       ADD CONSTRAINT ck_folha_total CHECK ("total" >= 0 AND "quantidade" >= 0);
ALTER TABLE "folha_comissao"       ADD CONSTRAINT ck_folha_paga CHECK (("status" = 'PAGA') = ("pagaEm" IS NOT NULL));
ALTER TABLE "bonus_incentivo"      ADD CONSTRAINT ck_bonus_pct CHECK ("percentualIncentivo" >= 0);
ALTER TABLE "usuario"              ADD CONSTRAINT ck_usuario_escopo CHECK (
  ("perfil" = 'GERENTE' AND "equipeId" IS NULL) OR
  ("perfil" = 'SUPERVISOR' AND "gerenciaId" IS NULL) OR
  ("perfil" NOT IN ('GERENTE', 'SUPERVISOR') AND "gerenciaId" IS NULL AND "equipeId" IS NULL)
);
ALTER TABLE "vendedor" ADD CONSTRAINT ck_vendedor_documento CHECK (
  ("tipoDocumento" = 'CPF' AND "documento" ~ '^[0-9]{11}$') OR
  ("tipoDocumento" = 'CNPJ' AND "documento" ~ '^[0-9]{14}$')
);
ALTER TABLE "vendedor" ADD CONSTRAINT ck_vendedor_desligado CHECK (("status" = 'DESLIGADO') = ("desligadoEm" IS NOT NULL));

-- ---------- Comissão única / estorno único (a trava contra pagar/cobrar duas vezes) ----------
-- Registros cancelados/invalidados ficam como histórico (append-only), por isso o índice é parcial.
CREATE UNIQUE INDEX ux_comissao_cota_parcela_destino ON "comissao_apurada" ("cotaId", "parcela", "destino") WHERE "status" <> 'CANCELADA' AND "ajusteDeId" IS NULL;
CREATE UNIQUE INDEX ux_estorno_cota_destino ON "estorno" ("cotaId", "destino") WHERE "status" <> 'INVALIDADO';
CREATE UNIQUE INDEX ux_pendencia_aberta ON "pendencia" (COALESCE("cotaId", ''), "chave") WHERE "resolvidaEm" IS NULL;
CREATE UNIQUE INDEX ux_evento_pendente ON "evento_dominio" ("tipo", "cotaId") WHERE "status" = 'PENDENTE';

-- ---------- Quem paga coerente (TRIGGER) ----------
CREATE OR REPLACE FUNCTION fn_comissao_quem_paga() RETURNS trigger AS $$
DECLARE
  v_paga boolean;
BEGIN
  -- Ajustes carregam quem pagou a linha original (ex.: devolução após troca de categoria).
  IF NEW."ajusteDeId" IS NOT NULL THEN
    RETURN NEW;
  END IF;
  IF NEW."destino" = 'VENDEDOR' THEN
    SELECT q."snapPagaPelaWr" INTO v_paga FROM "cota" q WHERE q."id" = NEW."cotaId";
    IF v_paga IS NULL THEN
      RAISE EXCEPTION 'Comissão de vendedor sem categoria congelada na cota %', NEW."cotaId";
    END IF;
    IF NEW."pagaPelaWr" <> v_paga THEN
      RAISE EXCEPTION 'Quem paga incoerente: categoria da venda diz pagaPelaWr=%, comissão diz %', v_paga, NEW."pagaPelaWr";
    END IF;
  ELSIF NOT NEW."pagaPelaWr" THEN
    RAISE EXCEPTION 'Supervisão e gerência são sempre pagas pela WR';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER tg_comissao_quem_paga BEFORE INSERT OR UPDATE OF "pagaPelaWr", "destino", "cotaId"
  ON "comissao_apurada" FOR EACH ROW EXECUTE FUNCTION fn_comissao_quem_paga();

-- ---------- Comissão: valores congelados (append-only) ----------
CREATE OR REPLACE FUNCTION fn_comissao_imutavel() RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'Comissão apurada não se apaga: cancele e crie outra';
  END IF;
  IF NEW."base" <> OLD."base" OR NEW."percentual" <> OLD."percentual" OR NEW."valor" <> OLD."valor"
     OR NEW."cotaId" <> OLD."cotaId" OR NEW."parcela" <> OLD."parcela" OR NEW."destino" <> OLD."destino"
     OR NEW."titularPessoaId" <> OLD."titularPessoaId" OR NEW."tabelaId" <> OLD."tabelaId"
     OR NEW."memoria"::text <> OLD."memoria"::text THEN
    RAISE EXCEPTION 'Valores de comissão apurada são imutáveis: cancele e crie outra';
  END IF;
  IF OLD."status" IN ('EM_FOLHA', 'PAGA') AND NEW."status" NOT IN ('EM_FOLHA', 'PAGA') THEN
    RAISE EXCEPTION 'Comissão em folha fechada não pode sair da folha';
  END IF;
  IF OLD."status" = 'CANCELADA' AND NEW."status" <> 'CANCELADA' THEN
    RAISE EXCEPTION 'Comissão cancelada não volta a valer';
  END IF;
  IF OLD."folhaId" IS NOT NULL AND NEW."folhaId" IS DISTINCT FROM OLD."folhaId" THEN
    RAISE EXCEPTION 'Comissão não pode trocar de folha';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER tg_comissao_imutavel BEFORE UPDATE OR DELETE ON "comissao_apurada"
  FOR EACH ROW EXECUTE FUNCTION fn_comissao_imutavel();

-- ---------- Estorno: valores imutáveis; estorno já cobrado nunca é invalidado ----------
CREATE OR REPLACE FUNCTION fn_estorno_imutavel() RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'Estorno não se apaga';
  END IF;
  IF NEW."valor" <> OLD."valor" OR NEW."comissaoBase" <> OLD."comissaoBase" OR NEW."percentual" <> OLD."percentual"
     OR NEW."cotaId" <> OLD."cotaId" OR NEW."destino" <> OLD."destino" OR NEW."tipo" <> OLD."tipo"
     OR NEW."memoria"::text <> OLD."memoria"::text THEN
    RAISE EXCEPTION 'Valores de estorno são imutáveis: invalide e crie outro';
  END IF;
  IF NEW."status" = 'INVALIDADO' AND OLD."status" <> 'A_COBRAR' AND OLD."status" <> 'INVALIDADO' THEN
    RAISE EXCEPTION 'Estorno já em cobrança/quitado/perdoado nunca é invalidado';
  END IF;
  IF OLD."status" IN ('QUITADO', 'PERDOADO', 'INVALIDADO') AND NEW."status" <> OLD."status" THEN
    RAISE EXCEPTION 'Estorno encerrado não muda de situação';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER tg_estorno_imutavel BEFORE UPDATE OR DELETE ON "estorno"
  FOR EACH ROW EXECUTE FUNCTION fn_estorno_imutavel();

-- ---------- Folha fechada é congelada ----------
CREATE OR REPLACE FUNCTION fn_folha_imutavel() RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'Folha fechada não se apaga';
  END IF;
  IF NEW."total" <> OLD."total" OR NEW."quantidade" <> OLD."quantidade" OR NEW."competencia" <> OLD."competencia" THEN
    RAISE EXCEPTION 'Totais de folha fechada são imutáveis';
  END IF;
  IF OLD."status" = 'PAGA' THEN
    RAISE EXCEPTION 'Folha paga não muda';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER tg_folha_imutavel BEFORE UPDATE OR DELETE ON "folha_comissao"
  FOR EACH ROW EXECUTE FUNCTION fn_folha_imutavel();

-- ---------- Código de categoria nunca muda ----------
CREATE OR REPLACE FUNCTION fn_categoria_codigo_imutavel() RETURNS trigger AS $$
BEGIN
  IF NEW."codigo" <> OLD."codigo" THEN
    RAISE EXCEPTION 'O código da categoria nunca muda (é a chave que as vendas gravadas carregam)';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER tg_categoria_codigo_imutavel BEFORE UPDATE ON "categoria_vendedor"
  FOR EACH ROW EXECUTE FUNCTION fn_categoria_codigo_imutavel();

-- ---------- Históricos append-only ----------
CREATE OR REPLACE FUNCTION fn_somente_insercao() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'Tabela % é append-only', TG_TABLE_NAME;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER tg_audit_log_append_only BEFORE UPDATE OR DELETE ON "audit_log"
  FOR EACH ROW EXECUTE FUNCTION fn_somente_insercao();
CREATE TRIGGER tg_cota_versao_append_only BEFORE UPDATE OR DELETE ON "cota_versao"
  FOR EACH ROW EXECUTE FUNCTION fn_somente_insercao();
CREATE TRIGGER tg_cota_transferencia_append_only BEFORE UPDATE OR DELETE ON "cota_transferencia"
  FOR EACH ROW EXECUTE FUNCTION fn_somente_insercao();
CREATE TRIGGER tg_estorno_movimento_append_only BEFORE UPDATE OR DELETE ON "estorno_movimento"
  FOR EACH ROW EXECUTE FUNCTION fn_somente_insercao();
CREATE TRIGGER tg_pessoa_vinculo_append_only BEFORE UPDATE OR DELETE ON "pessoa_vinculo"
  FOR EACH ROW EXECUTE FUNCTION fn_somente_insercao();
CREATE TRIGGER tg_lancamento_adm_append_only BEFORE UPDATE OR DELETE ON "lancamento_administradora"
  FOR EACH ROW EXECUTE FUNCTION fn_somente_insercao();
CREATE TRIGGER tg_comissao_adm_append_only BEFORE UPDATE OR DELETE ON "comissao_vendedor_adm"
  FOR EACH ROW EXECUTE FUNCTION fn_somente_insercao();

-- Cota nunca é apagada (cancelada continua no banco).
CREATE OR REPLACE FUNCTION fn_cota_nao_apaga() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'Cota não se apaga: cancelada continua na carteira';
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER tg_cota_nao_apaga BEFORE DELETE ON "cota" FOR EACH ROW EXECUTE FUNCTION fn_cota_nao_apaga();
