-- Regra da WR: a conferência da parcela que a WR não recebe (2ª do Iniciante) só vale para venda recente.
-- Cliente que já pagou muitas parcelas em sequência é "velho": a parcela sai da lista e não é paga.
-- Recalcula as vendas que estão hoje na lista "Conferir antes de pagar".
INSERT INTO "evento_dominio" ("id", "tipo", "cotaId", "payload", "status", "tentativas", "proximaTentativaEm", "criadoEm")
SELECT 'evt_' || md5(random()::text || p."cotaId"), 'APURAR_COTA', p."cotaId",
       '{"motivo": "conferência só para venda recente"}'::jsonb, 'PENDENTE', 0, now(), now()
FROM (SELECT DISTINCT "cotaId" FROM "pendencia" WHERE "tipo" = 'CONFERENCIA_PARCELA' AND "resolvidaEm" IS NULL AND "cotaId" IS NOT NULL) p
ON CONFLICT DO NOTHING;
