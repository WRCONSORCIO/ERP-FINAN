-- =====================================================================
-- ERP WR Consórcio — DIAGNÓSTICO (somente leitura: só SELECT, não altera nada)
-- Supabase › SQL Editor › New query › cole tudo › Run › exporte o resultado em CSV.
-- Cada linha: seção | item | detalhe. Linhas com "ATENÇÃO" apontam algo a corrigir.
-- =====================================================================
WITH
hoje AS (SELECT current_date AS d),
cat_vigente AS (
  SELECT DISTINCT ON (vc."vendedorId") vc."vendedorId", c.codigo, c.nome
  FROM vendedor_categoria vc JOIN categoria_vendedor c ON c.id = vc."categoriaId", hoje
  WHERE vc."vigenteDe" <= hoje.d AND (vc."vigenteAte" IS NULL OR vc."vigenteAte" >= hoje.d)
  ORDER BY vc."vendedorId", vc."vigenteDe" DESC
),
primeira_venda AS (
  SELECT "snapVendedorId" AS vid, min("dataVenda") AS primeira, count(*) AS vendas
  FROM cota WHERE "snapVendedorId" IS NOT NULL GROUP BY 1
),
docs_importados AS (
  SELECT "vendedorDocImportado" AS doc, min("vendedorNomeImportado") AS nome, min("dataVenda") AS primeira, count(*) AS vendas
  FROM cota GROUP BY 1
)
-- ---------------- 1. CONFIGURAÇÃO ----------------
SELECT '01 Categorias' AS secao, c.codigo AS item,
  'aceita ' || array_to_string(c."documentosAceitos", '/') || ' · paga: ' || CASE WHEN c."pagaPelaWr" THEN 'WR' ELSE 'administradora' END
  || ' · supervisor: ' || CASE WHEN c."geraSupervisao" THEN 'sim' ELSE 'não' END || ' · gerente: ' || CASE WHEN c."geraGerencia" THEN 'sim' ELSE 'não' END
  || ' · recebe sobre outro CNPJ: ' || CASE WHEN c."recebeSobreOutrosDocumentos" THEN 'sim' ELSE 'não' END
  || ' · conferir parcela: ' || coalesce(nullif(array_to_string(c."parcelasConferenciaManual", ','), ''), '—')
  || CASE WHEN c.ativo THEN '' ELSE ' · INATIVA' END AS detalhe
FROM categoria_vendedor c
UNION ALL
SELECT '02 Tabelas de comissão (vigentes hoje)', t.destino::text || ' · ' || coalesce(c.codigo, '—') || ' · ' || s.codigo
  || CASE WHEN t."titularVendedorId" IS NOT NULL OR t."titularPessoaId" IS NOT NULL THEN ' · EXCEÇÃO individual' ELSE '' END,
  'desde ' || to_char(t."vigenteDe", 'DD/MM/YYYY') || ' · ' || coalesce((SELECT string_agg(f.parcela || 'ª=' || f.percentual::text || '%', ' ' ORDER BY f.parcela) FROM faixa_comissao f WHERE f."tabelaId" = t.id), 'SEM PARCELAS (não paga)')
FROM tabela_comissao t JOIN segmento s ON s.id = t."segmentoId" LEFT JOIN categoria_vendedor c ON c.id = t."categoriaId", hoje
WHERE t."vigenteDe" <= hoje.d AND (t."vigenteAte" IS NULL OR t."vigenteAte" >= hoje.d)
UNION ALL
SELECT '02 Tabelas de comissão', 'ATENÇÃO: categoria ativa sem tabela de vendedor vigente', c.codigo || ' · ' || s.codigo
FROM categoria_vendedor c CROSS JOIN segmento s, hoje
WHERE c.ativo AND s.ativo AND NOT EXISTS (
  SELECT 1 FROM tabela_comissao t WHERE t.destino = 'VENDEDOR' AND t."categoriaId" = c.id AND t."segmentoId" = s.id
    AND t."titularVendedorId" IS NULL AND t."vigenteDe" <= hoje.d AND (t."vigenteAte" IS NULL OR t."vigenteAte" >= hoje.d))
UNION ALL
SELECT '02 Tabelas de comissão', 'ATENÇÃO: tabela começa depois de 01/11/2024 (vendas antigas ficam sem regra)', t.destino::text || ' · ' || coalesce(c.codigo, '—') || ' · ' || s.codigo || ' · primeira vigência ' || to_char(min(t."vigenteDe"), 'DD/MM/YYYY')
FROM tabela_comissao t JOIN segmento s ON s.id = t."segmentoId" LEFT JOIN categoria_vendedor c ON c.id = t."categoriaId"
WHERE t."titularVendedorId" IS NULL AND t."titularPessoaId" IS NULL
GROUP BY t.destino, c.codigo, s.codigo HAVING min(t."vigenteDe") > DATE '2024-11-01'
UNION ALL
SELECT '03 Estorno (configuração vigente)', to_char(e."vigenteDe", 'DD/MM/YYYY'),
  'quem devolve: ' || array_to_string(e.participantes, ', ') || ' · cancelamento: ' || e."criterioCancelamento"::text || ' ' || e."limiteParcelas"
  || ' · recuperação: ' || coalesce(e."criterioRecuperacao"::text || ' ' || e."limiteRecuperacao", '—')
  || ' · base do estorno: ' || coalesce(e."escopoBase"::text, 'ATENÇÃO: NÃO DEFINIDA (nenhum estorno é calculado)')
FROM configuracao_estorno e, hoje WHERE e."vigenteDe" <= hoje.d AND (e."vigenteAte" IS NULL OR e."vigenteAte" >= hoje.d)
UNION ALL
SELECT '03 Estorno (percentuais vigentes)', r.tipo::text || ' · ' || coalesce(r.participante, CASE WHEN r."titularVendedorId" IS NOT NULL THEN 'exceção de vendedor' ELSE 'padrão' END),
  r.percentual::text || '% desde ' || to_char(r."vigenteDe", 'DD/MM/YYYY')
FROM regra_estorno r, hoje WHERE r."vigenteDe" <= hoje.d AND (r."vigenteAte" IS NULL OR r."vigenteAte" >= hoje.d)
UNION ALL
SELECT '04 Flex', m.codigo, m.nome || ' · base ' || m.percentual::text || '% desde ' || to_char(m."vigenteDe", 'DD/MM/YYYY')
FROM modalidade_flex m, hoje WHERE m."vigenteDe" <= hoje.d AND (m."vigenteAte" IS NULL OR m."vigenteAte" >= hoje.d)
-- ---------------- 2. ESTRUTURA ----------------
UNION ALL
SELECT '05 Estrutura', 'ATENÇÃO: equipe ativa sem supervisor hoje', g.nome || ' › ' || e.nome
FROM equipe e JOIN gerencia g ON g.id = e."gerenciaId", hoje
WHERE e.status = 'ATIVO' AND NOT EXISTS (SELECT 1 FROM responsavel_unidade r WHERE r."equipeId" = e.id AND r.papel = 'SUPERVISOR' AND r."vigenteDe" <= hoje.d AND (r."vigenteAte" IS NULL OR r."vigenteAte" >= hoje.d))
UNION ALL
SELECT '05 Estrutura', 'ATENÇÃO: gerência ativa sem gerente hoje', g.nome
FROM gerencia g, hoje
WHERE g.status = 'ATIVO' AND NOT EXISTS (SELECT 1 FROM responsavel_unidade r WHERE r."gerenciaId" = g.id AND r.papel = 'GERENTE' AND r."vigenteDe" <= hoje.d AND (r."vigenteAte" IS NULL OR r."vigenteAte" >= hoje.d))
-- ---------------- 3. VENDEDORES ----------------
UNION ALL
SELECT '06 Vendedores por categoria atual', coalesce(cv.nome, 'SEM CATEGORIA HOJE'), count(*)::text || ' documento(s) ativo(s)'
FROM vendedor v LEFT JOIN cat_vigente cv ON cv."vendedorId" = v.id WHERE v.status = 'ATIVO' GROUP BY 2
UNION ALL
SELECT '07 Vendedores', 'ATENÇÃO: categoria começa DEPOIS da 1ª venda (vendas antigas sem comissão)',
  v.nome || ' · ' || v."tipoDocumento"::text || ' ' || v.documento || ' · categoria desde ' || to_char(min(vc."vigenteDe"), 'DD/MM/YYYY') || ' · 1ª venda ' || to_char(pv.primeira, 'DD/MM/YYYY')
FROM vendedor v JOIN vendedor_categoria vc ON vc."vendedorId" = v.id JOIN primeira_venda pv ON pv.vid = v.id
GROUP BY v.id, v.nome, v."tipoDocumento", v.documento, pv.primeira HAVING min(vc."vigenteDe") > pv.primeira
UNION ALL
SELECT '07 Vendedores', 'ATENÇÃO: equipe começa DEPOIS da 1ª venda (vendas antigas sem supervisor/gerente)',
  v.nome || ' · ' || v.documento || ' · equipe desde ' || to_char(min(va."vigenteDe"), 'DD/MM/YYYY') || ' · 1ª venda ' || to_char(pv.primeira, 'DD/MM/YYYY')
FROM vendedor v JOIN vendedor_alocacao va ON va."vendedorId" = v.id JOIN primeira_venda pv ON pv.vid = v.id
GROUP BY v.id, v.nome, v.documento, pv.primeira HAVING min(va."vigenteDe") > pv.primeira
UNION ALL
SELECT '07 Vendedores', 'ATENÇÃO: pessoas com o MESMO nome (documento na pessoa errada?)',
  p."nomeNormalizado" || ' · ' || count(*)::text || ' pessoas: ' || string_agg((SELECT string_agg(v."tipoDocumento"::text || ' ' || v.documento, ' + ') FROM vendedor v WHERE v."pessoaId" = p.id), ' | ')
FROM pessoa p WHERE EXISTS (SELECT 1 FROM vendedor v WHERE v."pessoaId" = p.id)
GROUP BY p."nomeNormalizado" HAVING count(*) > 1
UNION ALL
SELECT '07 Vendedores', 'ATENÇÃO: CNPJ Expert numa pessoa sem CNPJ Veterano (não recebe os 0,3%)', v.nome || ' · ' || v.documento
FROM vendedor v JOIN cat_vigente cv ON cv."vendedorId" = v.id
WHERE cv.codigo = 'EXPERT' AND NOT EXISTS (
  SELECT 1 FROM vendedor o JOIN vendedor_categoria oc ON oc."vendedorId" = o.id JOIN categoria_vendedor c ON c.id = oc."categoriaId"
  WHERE o."pessoaId" = v."pessoaId" AND o.id <> v.id AND c.codigo = 'VETERANO')
-- ---------------- 4. VENDAS ----------------
UNION ALL
SELECT '08 Vendas', 'totais', count(*)::text || ' vendas · ' || count(*) FILTER (WHERE cancelada)::text || ' canceladas · ' || count(*) FILTER (WHERE "snapVendedorId" IS NULL)::text || ' sem vendedor cadastrado'
FROM cota
UNION ALL
SELECT '09 Pendências abertas', p.tipo::text, count(*)::text FROM pendencia p WHERE p."resolvidaEm" IS NULL GROUP BY p.tipo
UNION ALL
SELECT '10 Vendedores do arquivo SEM cadastro (top 40)', coalesce(d.nome, '—') || ' · ' || coalesce(d.doc, 'sem documento'), d.vendas::text || ' venda(s) desde ' || to_char(d.primeira, 'DD/MM/YYYY')
FROM (SELECT di.* FROM docs_importados di WHERE NOT EXISTS (SELECT 1 FROM vendedor v WHERE v.documento = di.doc) ORDER BY di.vendas DESC LIMIT 40) d
-- ---------------- 5. COMISSÕES ----------------
UNION ALL
SELECT '11 Comissões', status::text || ' · ' || CASE WHEN "pagaPelaWr" THEN 'WR paga' ELSE 'administradora paga' END, count(*)::text || ' linha(s) · R$ ' || to_char(sum(valor), 'FM999G999G990D00')
FROM comissao_apurada GROUP BY status, "pagaPelaWr"
UNION ALL
SELECT '12 Conferência 2ª parcela', 'aguardando decisão', count(*)::text || ' (sendo ' || count(*) FILTER (WHERE c.cancelada)::text || ' em vendas canceladas)'
FROM pendencia p JOIN cota c ON c.id = p."cotaId" WHERE p.tipo = 'CONFERENCIA_PARCELA' AND p."resolvidaEm" IS NULL
UNION ALL
SELECT '12 Conferência 2ª parcela', 'decisões tomadas', decisao::text || ': ' || count(*)::text FROM conferencia_parcela GROUP BY decisao
UNION ALL
SELECT '13 Folhas', competencia || ' · ' || status::text, 'R$ ' || to_char(total, 'FM999G999G990D00') || ' · ' || quantidade || ' linha(s) · fechada em ' || to_char("fechadaEm", 'DD/MM/YYYY')
FROM folha_comissao
-- ---------------- 6. IMPORTAÇÕES ----------------
UNION ALL
SELECT '14 Importações (últimas 30)', to_char(i."enviadoEm", 'DD/MM/YYYY HH24:MI') || ' · ' || i.tipo::text,
  i."nomeArquivo" || ' · ' || i."totalLinhas" || ' linhas · ' || i.erros || ' erro(s) · status ' || i.status::text
  || coalesce(' · diferença do rodapé ' || i."diferencaConferencia"::text, '')
FROM (SELECT * FROM importacao ORDER BY "enviadoEm" DESC LIMIT 30) i
ORDER BY 1, 2;
