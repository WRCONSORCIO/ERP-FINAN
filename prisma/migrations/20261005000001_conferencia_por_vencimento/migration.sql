-- Regra da WR (01/10/2026): a conferência da 2ª parcela vale só para o que venceu a partir de setembro/2026
-- (o sistema começa pagando em outubro o que o cliente pagou em setembro). Substitui a regra por quantidade de
-- parcelas. Recalcula as vendas que estão na lista e as que a regra anterior tinha tirado como "venda antiga".
INSERT INTO "evento_dominio" ("id", "tipo", "cotaId", "payload", "status", "tentativas", "proximaTentativaEm", "criadoEm")
SELECT 'evt_' || md5(random()::text || x."cotaId"), 'APURAR_COTA', x."cotaId",
       '{"motivo": "conferência pelo vencimento da parcela"}'::jsonb, 'PENDENTE', 0, now(), now()
FROM (
  SELECT "cotaId" FROM "pendencia" WHERE "tipo" = 'CONFERENCIA_PARCELA' AND "resolvidaEm" IS NULL AND "cotaId" IS NOT NULL
  UNION
  SELECT "cotaId" FROM "comissao_apurada" WHERE "status" = 'CANCELADA' AND "motivoCancelamento" LIKE 'Venda antiga%'
) x
ON CONFLICT DO NOTHING;
