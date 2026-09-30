-- Regras da WR:
-- 1. Estorno só existe depois que o cancelamento aparece num relatório de comissão (CV056E ou CV069E).
-- 2. Vendedor desligado não recebe mais comissão e não paga estorno.
-- Recalcula as vendas canceladas e as dos documentos desligados.
INSERT INTO "evento_dominio" ("id", "tipo", "cotaId", "payload", "status", "tentativas", "proximaTentativaEm", "criadoEm")
SELECT 'evt_' || md5(random()::text || c."id"), 'APURAR_COTA', c."id",
       '{"motivo": "estorno pelo relatório; desligado não recebe nem paga estorno"}'::jsonb, 'PENDENTE', 0, now(), now()
FROM "cota" c
WHERE c."cancelada" = true
   OR EXISTS (SELECT 1 FROM "vendedor" v WHERE v."status" = 'DESLIGADO' AND v."id" IN (c."snapVendedorId", c."snapExpertVendedorId"))
ON CONFLICT DO NOTHING;
