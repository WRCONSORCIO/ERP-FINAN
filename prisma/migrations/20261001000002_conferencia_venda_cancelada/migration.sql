-- Regra da WR: venda cancelada não paga mais nada ao vendedor. As vendas canceladas que ficaram em
-- "Conferir antes de pagar" são recalculadas: a parcela sai como não paga e o aviso é resolvido.
INSERT INTO "evento_dominio" ("id", "tipo", "cotaId", "payload", "status", "tentativas", "proximaTentativaEm", "criadoEm")
SELECT 'evt_' || md5(random()::text || c."id"), 'APURAR_COTA', c."id",
       '{"motivo": "venda cancelada não passa pela conferência da parcela"}'::jsonb, 'PENDENTE', 0, now(), now()
FROM "cota" c
WHERE c."cancelada" = true
  AND EXISTS (SELECT 1 FROM "pendencia" p WHERE p."cotaId" = c."id" AND p."tipo" = 'CONFERENCIA_PARCELA' AND p."resolvidaEm" IS NULL)
ON CONFLICT DO NOTHING;
