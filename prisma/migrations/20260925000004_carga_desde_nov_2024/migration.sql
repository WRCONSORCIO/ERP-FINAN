-- Decisão da WR: as regras da carga inicial valem desde 01/11/2024 (antes: 01/09/2026).
-- Move só o que ainda está na data da carga (01/09/2026), que nenhum cálculo usou e que não
-- tem período anterior da mesma regra (senão sobreporia). O que a WR já alterou fica como está.
-- Cada mudança vai para a auditoria. Continua editável em Configurações › "Corrigir / excluir".

WITH m AS (
  UPDATE "tabela_comissao" t SET "vigenteDe" = DATE '2024-11-01'
  WHERE t."vigenteDe" = DATE '2026-09-01'
    AND NOT EXISTS (SELECT 1 FROM "comissao_apurada" c WHERE c."tabelaId" = t.id)
    AND NOT EXISTS (SELECT 1 FROM "tabela_comissao" o WHERE o.id <> t.id AND o."vigenteDe" < t."vigenteDe"
      AND o.destino = t.destino AND o."segmentoId" = t."segmentoId"
      AND o."categoriaId" IS NOT DISTINCT FROM t."categoriaId"
      AND o."titularVendedorId" IS NOT DISTINCT FROM t."titularVendedorId"
      AND o."titularPessoaId" IS NOT DISTINCT FROM t."titularPessoaId")
  RETURNING t.id
)
INSERT INTO "audit_log" ("acao", "entidade", "entidadeId", "antes", "depois", "contexto")
SELECT 'ALTERACAO_REGRA'::"AcaoAuditoria", 'TabelaComissao', id,
       jsonb_build_object('vigenteDe', '2026-09-01'), jsonb_build_object('vigenteDe', '2024-11-01'),
       jsonb_build_object('operacao', 'migration: carga inicial vale desde 01/11/2024 (decisão da WR)')
FROM m;

WITH m AS (
  UPDATE "modalidade_flex" f SET "vigenteDe" = DATE '2024-11-01'
  WHERE f."vigenteDe" = DATE '2026-09-01'
    AND NOT EXISTS (SELECT 1 FROM "cota" c WHERE c."snapModalidadeFlexId" = f.id)
    AND NOT EXISTS (SELECT 1 FROM "modalidade_flex" o WHERE o.id <> f.id AND o.codigo = f.codigo AND o."vigenteDe" < f."vigenteDe")
  RETURNING f.id
)
INSERT INTO "audit_log" ("acao", "entidade", "entidadeId", "antes", "depois", "contexto")
SELECT 'ALTERACAO_REGRA'::"AcaoAuditoria", 'ModalidadeFlex', id,
       jsonb_build_object('vigenteDe', '2026-09-01'), jsonb_build_object('vigenteDe', '2024-11-01'),
       jsonb_build_object('operacao', 'migration: carga inicial vale desde 01/11/2024 (decisão da WR)')
FROM m;

WITH m AS (
  UPDATE "configuracao_estorno" c SET "vigenteDe" = DATE '2024-11-01'
  WHERE c."vigenteDe" = DATE '2026-09-01'
    AND NOT EXISTS (SELECT 1 FROM "estorno" e WHERE e."configuracaoId" = c.id)
    AND NOT EXISTS (SELECT 1 FROM "configuracao_estorno" o WHERE o.id <> c.id AND o."vigenteDe" < c."vigenteDe")
  RETURNING c.id
)
INSERT INTO "audit_log" ("acao", "entidade", "entidadeId", "antes", "depois", "contexto")
SELECT 'ALTERACAO_REGRA'::"AcaoAuditoria", 'ConfiguracaoEstorno', id,
       jsonb_build_object('vigenteDe', '2026-09-01'), jsonb_build_object('vigenteDe', '2024-11-01'),
       jsonb_build_object('operacao', 'migration: carga inicial vale desde 01/11/2024 (decisão da WR)')
FROM m;

WITH m AS (
  UPDATE "regra_estorno" r SET "vigenteDe" = DATE '2024-11-01'
  WHERE r."vigenteDe" = DATE '2026-09-01'
    AND NOT EXISTS (SELECT 1 FROM "estorno" e WHERE e."regraId" = r.id)
    AND NOT EXISTS (SELECT 1 FROM "regra_estorno" o WHERE o.id <> r.id AND o."vigenteDe" < r."vigenteDe"
      AND o.tipo = r.tipo AND o.participante IS NOT DISTINCT FROM r.participante
      AND o."titularVendedorId" IS NOT DISTINCT FROM r."titularVendedorId")
  RETURNING r.id
)
INSERT INTO "audit_log" ("acao", "entidade", "entidadeId", "antes", "depois", "contexto")
SELECT 'ALTERACAO_REGRA'::"AcaoAuditoria", 'RegraEstorno', id,
       jsonb_build_object('vigenteDe', '2026-09-01'), jsonb_build_object('vigenteDe', '2024-11-01'),
       jsonb_build_object('operacao', 'migration: carga inicial vale desde 01/11/2024 (decisão da WR)')
FROM m;

WITH m AS (
  UPDATE "meta_promocao" p SET "vigenteDe" = DATE '2024-11-01'
  WHERE p."vigenteDe" = DATE '2026-09-01'
    AND NOT EXISTS (SELECT 1 FROM "meta_promocao" o WHERE o.id <> p.id AND o."categoriaOrigemId" = p."categoriaOrigemId" AND o."vigenteDe" < p."vigenteDe")
  RETURNING p.id
)
INSERT INTO "audit_log" ("acao", "entidade", "entidadeId", "antes", "depois", "contexto")
SELECT 'ALTERACAO_REGRA'::"AcaoAuditoria", 'MetaPromocao', id,
       jsonb_build_object('vigenteDe', '2026-09-01'), jsonb_build_object('vigenteDe', '2024-11-01'),
       jsonb_build_object('operacao', 'migration: carga inicial vale desde 01/11/2024 (decisão da WR)')
FROM m;
