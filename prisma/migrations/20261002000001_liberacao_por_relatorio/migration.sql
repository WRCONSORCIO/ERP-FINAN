-- Regra da WR: a comissão passa a ser devida quando a parcela aparece no relatório da administradora
-- (CV056E para o que a WR recebe e repassa; CV069E para o que a administradora paga direto), não quando a
-- base de clientes diz que o cliente pagou (a base conta antecipação como parcela paga).
ALTER TABLE "comissao_vendedor_adm" ADD COLUMN "vendedorDocumento" TEXT;
CREATE INDEX "comissao_vendedor_adm_grupo_cota_idx" ON "comissao_vendedor_adm"("grupo", "cota");

-- Recalcula todas as vendas: o que foi liberado só pela base volta a "prevista" até o relatório chegar
-- (o que já está em folha fechada ou paga não muda).
INSERT INTO "evento_dominio" ("id", "tipo", "cotaId", "payload", "status", "tentativas", "proximaTentativaEm", "criadoEm")
SELECT 'evt_' || md5(random()::text || c."id"), 'APURAR_COTA', c."id",
       '{"motivo": "liberação passa a ser pelo relatório da administradora"}'::jsonb, 'PENDENTE', 0, now(), now()
FROM "cota" c
ON CONFLICT DO NOTHING;
