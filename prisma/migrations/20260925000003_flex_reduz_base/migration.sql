-- Regra da WR: "Flex N" REDUZ a base em N% (Flex 10 = comissão sobre 90% do crédito; Flex 30 = 70%).
-- Não existe Flex 100. Venda sem flex = Integral (100%).
-- Corrige só a carga inicial (percentual ainda igual a N) e só o que nenhuma venda usou:
-- nada já calculado é reescrito. Cada correção vai para a auditoria.

WITH alvo AS (
  SELECT f.id, f.codigo, f.percentual AS antes, (100 - f.percentual) AS depois
  FROM "modalidade_flex" f
  WHERE f.codigo IN ('FLEX10','FLEX20','FLEX30','FLEX40','FLEX60','FLEX70','FLEX80','FLEX90')
    AND f.percentual = CAST(substring(f.codigo FROM 5) AS NUMERIC)
    AND NOT EXISTS (SELECT 1 FROM "cota" c WHERE c."snapModalidadeFlexId" = f.id)
), atualizado AS (
  UPDATE "modalidade_flex" f SET percentual = alvo.depois FROM alvo WHERE f.id = alvo.id
  RETURNING f.id, f.codigo, alvo.antes, alvo.depois
)
INSERT INTO "audit_log" ("acao", "entidade", "entidadeId", "antes", "depois", "contexto")
SELECT 'ALTERACAO_REGRA'::"AcaoAuditoria", 'ModalidadeFlex', id,
       jsonb_build_object('codigo', codigo, 'percentual', antes),
       jsonb_build_object('codigo', codigo, 'percentual', depois),
       jsonb_build_object('operacao', 'migration: Flex N reduz a base em N% (regra da WR)')
FROM atualizado;

WITH removido AS (
  DELETE FROM "modalidade_flex" f
  WHERE f.codigo = 'FLEX100'
    AND NOT EXISTS (SELECT 1 FROM "cota" c WHERE c."snapModalidadeFlexId" = f.id)
  RETURNING f.id, f.codigo, f.percentual
)
INSERT INTO "audit_log" ("acao", "entidade", "entidadeId", "antes", "contexto")
SELECT 'EXCLUSAO'::"AcaoAuditoria", 'ModalidadeFlex', id, jsonb_build_object('codigo', codigo, 'percentual', percentual),
       jsonb_build_object('operacao', 'migration: não existe Flex 100 (regra da WR)')
FROM removido;

UPDATE "modalidade_flex"
SET nome = 'Integral (sem flex)',
    aliases = CASE WHEN 'SEM FLEX' = ANY(aliases) THEN aliases ELSE array_append(aliases, 'SEM FLEX') END
WHERE codigo = 'INTEGRAL' AND nome = 'Integral';
