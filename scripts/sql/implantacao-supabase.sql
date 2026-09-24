-- =====================================================================
-- ERP WR Consórcio — CARGA INICIAL + PRIMEIRO ADMINISTRADOR (Supabase)
-- Cole no Supabase: SQL Editor › New query › Run.
-- Antes de rodar, troque as 3 linhas marcadas com  <<< TROQUE  no fim do arquivo.
-- Roda uma única vez: se a carga já existir, o script para sem alterar nada.
-- Valores = especificação (seções 6.4 a 6.7), vigência a partir de 01/09/2026.
-- Gerado a partir de prisma/carga-inicial.ts (npm run db:seed produz o mesmo resultado).
-- =====================================================================
BEGIN;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.categoria_vendedor) THEN
    RAISE EXCEPTION 'A carga inicial já foi aplicada neste banco. Nada foi alterado.';
  END IF;
END $$;

INSERT INTO public.administradora (id, codigo, nome, cnpj, ativo, "criadoEm") VALUES ('cmufzerb900007de0oexj0fp1', 'SERVOPA', 'SERVOPA', NULL, true, '2026-09-24 20:25:47.973');

INSERT INTO public.segmento (id, codigo, nome, aliases, ativo) VALUES ('cmufzerbg00017de05rcjxcqf', 'IMOVEIS', 'Imóveis', '{IMOVEIS,IMOVEL,IMOBILIARIO,IMOB}', true);
INSERT INTO public.segmento (id, codigo, nome, aliases, ativo) VALUES ('cmufzerbl00027de0lcab7pl9', 'MOVEIS', 'Móveis', '{MOVEIS,MOVEL,VEICULO,VEICULOS,AUTOMOVEL,AUTOMOVEIS,AUTO,MOTO,MOTOCICLETA,CAMINHAO,PESADOS,LEVES}', true);

INSERT INTO public.categoria_vendedor (id, codigo, nome, descricao, ordem, "documentosAceitos", "pagaPelaWr", "geraSupervisao", "geraGerencia", "contaParaPromocao", ativo, "criadoEm") VALUES ('cmufzerbo00037de090jvcp0a', 'INICIANTE', 'Iniciante', NULL, 1, '{CPF}', true, true, true, true, true, '2026-09-24 20:25:47.988');
INSERT INTO public.categoria_vendedor (id, codigo, nome, descricao, ordem, "documentosAceitos", "pagaPelaWr", "geraSupervisao", "geraGerencia", "contaParaPromocao", ativo, "criadoEm") VALUES ('cmufzerbs00047de0x3ubnaur', 'VETERANO', 'Veterano', NULL, 2, '{CNPJ}', false, false, true, true, true, '2026-09-24 20:25:47.992');
INSERT INTO public.categoria_vendedor (id, codigo, nome, descricao, ordem, "documentosAceitos", "pagaPelaWr", "geraSupervisao", "geraGerencia", "contaParaPromocao", ativo, "criadoEm") VALUES ('cmufzerbv00057de0aw6529qs', 'EXPERT', 'Expert', NULL, 3, '{CNPJ}', false, false, true, true, true, '2026-09-24 20:25:47.995');

INSERT INTO public.modalidade_flex (id, codigo, nome, percentual, aliases, "vigenteDe", "vigenteAte", "criadoPorId", "criadoEm") VALUES ('cmufzerd5001g7de068f9zhu8', 'FLEX10', 'Flex 10', 10.0000, '{"FLEX 10",FLEX10,"FLEX 10","FLEX 10"}', '2026-09-01', NULL, NULL, '2026-09-24 20:25:48.041');
INSERT INTO public.modalidade_flex (id, codigo, nome, percentual, aliases, "vigenteDe", "vigenteAte", "criadoPorId", "criadoEm") VALUES ('cmufzerd8001h7de0kopuc3zs', 'FLEX20', 'Flex 20', 20.0000, '{"FLEX 20",FLEX20,"FLEX 20","FLEX 20"}', '2026-09-01', NULL, NULL, '2026-09-24 20:25:48.044');
INSERT INTO public.modalidade_flex (id, codigo, nome, percentual, aliases, "vigenteDe", "vigenteAte", "criadoPorId", "criadoEm") VALUES ('cmufzerda001i7de08h19p64r', 'FLEX30', 'Flex 30', 30.0000, '{"FLEX 30",FLEX30,"FLEX 30","FLEX 30"}', '2026-09-01', NULL, NULL, '2026-09-24 20:25:48.046');
INSERT INTO public.modalidade_flex (id, codigo, nome, percentual, aliases, "vigenteDe", "vigenteAte", "criadoPorId", "criadoEm") VALUES ('cmufzerdc001j7de0m0evmk3v', 'FLEX40', 'Flex 40', 40.0000, '{"FLEX 40",FLEX40,"FLEX 40","FLEX 40"}', '2026-09-01', NULL, NULL, '2026-09-24 20:25:48.048');
INSERT INTO public.modalidade_flex (id, codigo, nome, percentual, aliases, "vigenteDe", "vigenteAte", "criadoPorId", "criadoEm") VALUES ('cmufzerdd001k7de0fbaj3oyg', 'FLEX50', 'Flex 50', 50.0000, '{"FLEX 50",FLEX50,"FLEX 50","FLEX 50"}', '2026-09-01', NULL, NULL, '2026-09-24 20:25:48.05');
INSERT INTO public.modalidade_flex (id, codigo, nome, percentual, aliases, "vigenteDe", "vigenteAte", "criadoPorId", "criadoEm") VALUES ('cmufzerdf001l7de0myxia29j', 'FLEX60', 'Flex 60', 60.0000, '{"FLEX 60",FLEX60,"FLEX 60","FLEX 60"}', '2026-09-01', NULL, NULL, '2026-09-24 20:25:48.052');
INSERT INTO public.modalidade_flex (id, codigo, nome, percentual, aliases, "vigenteDe", "vigenteAte", "criadoPorId", "criadoEm") VALUES ('cmufzerdh001m7de0rn9elmge', 'FLEX70', 'Flex 70', 70.0000, '{"FLEX 70",FLEX70,"FLEX 70","FLEX 70"}', '2026-09-01', NULL, NULL, '2026-09-24 20:25:48.054');
INSERT INTO public.modalidade_flex (id, codigo, nome, percentual, aliases, "vigenteDe", "vigenteAte", "criadoPorId", "criadoEm") VALUES ('cmufzerdl001n7de0hlij8pm6', 'FLEX80', 'Flex 80', 80.0000, '{"FLEX 80",FLEX80,"FLEX 80","FLEX 80"}', '2026-09-01', NULL, NULL, '2026-09-24 20:25:48.058');
INSERT INTO public.modalidade_flex (id, codigo, nome, percentual, aliases, "vigenteDe", "vigenteAte", "criadoPorId", "criadoEm") VALUES ('cmufzerdp001o7de0joap9wv7', 'FLEX90', 'Flex 90', 90.0000, '{"FLEX 90",FLEX90,"FLEX 90","FLEX 90"}', '2026-09-01', NULL, NULL, '2026-09-24 20:25:48.061');
INSERT INTO public.modalidade_flex (id, codigo, nome, percentual, aliases, "vigenteDe", "vigenteAte", "criadoPorId", "criadoEm") VALUES ('cmufzerds001p7de0sjvnixlj', 'FLEX100', 'Flex 100', 100.0000, '{"FLEX 100",FLEX100,"FLEX 100","FLEX 100"}', '2026-09-01', NULL, NULL, '2026-09-24 20:25:48.064');
INSERT INTO public.modalidade_flex (id, codigo, nome, percentual, aliases, "vigenteDe", "vigenteAte", "criadoPorId", "criadoEm") VALUES ('cmufzerdu001q7de05cwi41zk', 'INTEGRAL', 'Integral', 100.0000, '{INTEGRAL}', '2026-09-01', NULL, NULL, '2026-09-24 20:25:48.066');

INSERT INTO public.tabela_comissao (id, destino, "segmentoId", "categoriaId", "titularVendedorId", "titularPessoaId", "vigenteDe", "vigenteAte", observacao, "criadoPorId", "criadoEm") VALUES ('cmufzerc100077de04qfpfko1', 'VENDEDOR', 'cmufzerbg00017de05rcjxcqf', 'cmufzerbo00037de090jvcp0a', NULL, NULL, '2026-09-01', NULL, 'Carga inicial (especificação, setembro/2026)', NULL, '2026-09-24 20:25:48.001');
INSERT INTO public.tabela_comissao (id, destino, "segmentoId", "categoriaId", "titularVendedorId", "titularPessoaId", "vigenteDe", "vigenteAte", observacao, "criadoPorId", "criadoEm") VALUES ('cmufzerc8000d7de0lbmah1d8', 'VENDEDOR', 'cmufzerbg00017de05rcjxcqf', 'cmufzerbs00047de0x3ubnaur', NULL, NULL, '2026-09-01', NULL, 'Carga inicial (especificação, setembro/2026)', NULL, '2026-09-24 20:25:48.008');
INSERT INTO public.tabela_comissao (id, destino, "segmentoId", "categoriaId", "titularVendedorId", "titularPessoaId", "vigenteDe", "vigenteAte", observacao, "criadoPorId", "criadoEm") VALUES ('cmufzercc000j7de0u9sypzd9', 'VENDEDOR', 'cmufzerbg00017de05rcjxcqf', 'cmufzerbv00057de0aw6529qs', NULL, NULL, '2026-09-01', NULL, 'Carga inicial (especificação, setembro/2026)', NULL, '2026-09-24 20:25:48.013');
INSERT INTO public.tabela_comissao (id, destino, "segmentoId", "categoriaId", "titularVendedorId", "titularPessoaId", "vigenteDe", "vigenteAte", observacao, "criadoPorId", "criadoEm") VALUES ('cmufzercg000o7de0o0zfm6zl', 'SUPERVISAO', 'cmufzerbg00017de05rcjxcqf', NULL, NULL, NULL, '2026-09-01', NULL, 'Carga inicial (especificação, setembro/2026)', NULL, '2026-09-24 20:25:48.017');
INSERT INTO public.tabela_comissao (id, destino, "segmentoId", "categoriaId", "titularVendedorId", "titularPessoaId", "vigenteDe", "vigenteAte", observacao, "criadoPorId", "criadoEm") VALUES ('cmufzerck000t7de09sgbtla4', 'GERENCIA', 'cmufzerbg00017de05rcjxcqf', NULL, NULL, NULL, '2026-09-01', NULL, 'Carga inicial (especificação, setembro/2026)', NULL, '2026-09-24 20:25:48.02');
INSERT INTO public.tabela_comissao (id, destino, "segmentoId", "categoriaId", "titularVendedorId", "titularPessoaId", "vigenteDe", "vigenteAte", observacao, "criadoPorId", "criadoEm") VALUES ('cmufzerco000w7de0i3hi1gbb', 'VENDEDOR', 'cmufzerbl00027de0lcab7pl9', 'cmufzerbo00037de090jvcp0a', NULL, NULL, '2026-09-01', NULL, 'Carga inicial (especificação, setembro/2026)', NULL, '2026-09-24 20:25:48.024');
INSERT INTO public.tabela_comissao (id, destino, "segmentoId", "categoriaId", "titularVendedorId", "titularPessoaId", "vigenteDe", "vigenteAte", observacao, "criadoPorId", "criadoEm") VALUES ('cmufzercr00117de0xivkzkag', 'VENDEDOR', 'cmufzerbl00027de0lcab7pl9', 'cmufzerbs00047de0x3ubnaur', NULL, NULL, '2026-09-01', NULL, 'Carga inicial (especificação, setembro/2026)', NULL, '2026-09-24 20:25:48.028');
INSERT INTO public.tabela_comissao (id, destino, "segmentoId", "categoriaId", "titularVendedorId", "titularPessoaId", "vigenteDe", "vigenteAte", observacao, "criadoPorId", "criadoEm") VALUES ('cmufzercv00167de0mcrgkr01', 'VENDEDOR', 'cmufzerbl00027de0lcab7pl9', 'cmufzerbv00057de0aw6529qs', NULL, NULL, '2026-09-01', NULL, 'Carga inicial (especificação, setembro/2026)', NULL, '2026-09-24 20:25:48.031');
INSERT INTO public.tabela_comissao (id, destino, "segmentoId", "categoriaId", "titularVendedorId", "titularPessoaId", "vigenteDe", "vigenteAte", observacao, "criadoPorId", "criadoEm") VALUES ('cmufzercy001a7de0cocjhzhh', 'SUPERVISAO', 'cmufzerbl00027de0lcab7pl9', NULL, NULL, NULL, '2026-09-01', NULL, 'Carga inicial (especificação, setembro/2026)', NULL, '2026-09-24 20:25:48.035');
INSERT INTO public.tabela_comissao (id, destino, "segmentoId", "categoriaId", "titularVendedorId", "titularPessoaId", "vigenteDe", "vigenteAte", observacao, "criadoPorId", "criadoEm") VALUES ('cmufzerd1001e7de0l7r4ddvz', 'GERENCIA', 'cmufzerbl00027de0lcab7pl9', NULL, NULL, NULL, '2026-09-01', NULL, 'Carga inicial (especificação, setembro/2026)', NULL, '2026-09-24 20:25:48.038');

INSERT INTO public.faixa_comissao (id, "tabelaId", parcela, percentual) VALUES ('cmufzerc100087de0bqjdtcoy', 'cmufzerc100077de04qfpfko1', 1, 0.5000);
INSERT INTO public.faixa_comissao (id, "tabelaId", parcela, percentual) VALUES ('cmufzerc100097de0x30uik0p', 'cmufzerc100077de04qfpfko1', 2, 0.4000);
INSERT INTO public.faixa_comissao (id, "tabelaId", parcela, percentual) VALUES ('cmufzerc1000a7de0mo7wsj45', 'cmufzerc100077de04qfpfko1', 3, 0.3000);
INSERT INTO public.faixa_comissao (id, "tabelaId", parcela, percentual) VALUES ('cmufzerc1000b7de0qxdeh9ji', 'cmufzerc100077de04qfpfko1', 4, 0.3000);
INSERT INTO public.faixa_comissao (id, "tabelaId", parcela, percentual) VALUES ('cmufzerc8000e7de0v5ke64c2', 'cmufzerc8000d7de0lbmah1d8', 1, 0.8000);
INSERT INTO public.faixa_comissao (id, "tabelaId", parcela, percentual) VALUES ('cmufzerc8000f7de03herel1l', 'cmufzerc8000d7de0lbmah1d8', 3, 0.4000);
INSERT INTO public.faixa_comissao (id, "tabelaId", parcela, percentual) VALUES ('cmufzerc8000g7de08gldwuz7', 'cmufzerc8000d7de0lbmah1d8', 4, 0.4000);
INSERT INTO public.faixa_comissao (id, "tabelaId", parcela, percentual) VALUES ('cmufzerc8000h7de0v5h8u187', 'cmufzerc8000d7de0lbmah1d8', 6, 0.4000);
INSERT INTO public.faixa_comissao (id, "tabelaId", parcela, percentual) VALUES ('cmufzercc000k7de0qjpey9qb', 'cmufzercc000j7de0u9sypzd9', 1, 0.3000);
INSERT INTO public.faixa_comissao (id, "tabelaId", parcela, percentual) VALUES ('cmufzercc000l7de072yrp6ky', 'cmufzercc000j7de0u9sypzd9', 3, 0.1000);
INSERT INTO public.faixa_comissao (id, "tabelaId", parcela, percentual) VALUES ('cmufzercc000m7de0jcf8whqe', 'cmufzercc000j7de0u9sypzd9', 4, 0.1000);
INSERT INTO public.faixa_comissao (id, "tabelaId", parcela, percentual) VALUES ('cmufzercg000p7de0iit1v0pa', 'cmufzercg000o7de0o0zfm6zl', 1, 0.3000);
INSERT INTO public.faixa_comissao (id, "tabelaId", parcela, percentual) VALUES ('cmufzercg000q7de0g8549a61', 'cmufzercg000o7de0o0zfm6zl', 3, 0.1000);
INSERT INTO public.faixa_comissao (id, "tabelaId", parcela, percentual) VALUES ('cmufzercg000r7de0sez3w1ch', 'cmufzercg000o7de0o0zfm6zl', 4, 0.1000);
INSERT INTO public.faixa_comissao (id, "tabelaId", parcela, percentual) VALUES ('cmufzerck000u7de0d7w2fz8p', 'cmufzerck000t7de09sgbtla4', 1, 0.3000);
INSERT INTO public.faixa_comissao (id, "tabelaId", parcela, percentual) VALUES ('cmufzerco000x7de0yjsctx7y', 'cmufzerco000w7de0i3hi1gbb', 1, 0.4000);
INSERT INTO public.faixa_comissao (id, "tabelaId", parcela, percentual) VALUES ('cmufzerco000y7de0ef520fu3', 'cmufzerco000w7de0i3hi1gbb', 2, 0.4000);
INSERT INTO public.faixa_comissao (id, "tabelaId", parcela, percentual) VALUES ('cmufzerco000z7de0k1tyuhhs', 'cmufzerco000w7de0i3hi1gbb', 3, 0.4000);
INSERT INTO public.faixa_comissao (id, "tabelaId", parcela, percentual) VALUES ('cmufzercr00127de05398istl', 'cmufzercr00117de0xivkzkag', 1, 0.5000);
INSERT INTO public.faixa_comissao (id, "tabelaId", parcela, percentual) VALUES ('cmufzercr00137de0u4pls2n3', 'cmufzercr00117de0xivkzkag', 3, 0.5000);
INSERT INTO public.faixa_comissao (id, "tabelaId", parcela, percentual) VALUES ('cmufzercr00147de0s5uuw3wq', 'cmufzercr00117de0xivkzkag', 5, 0.5000);
INSERT INTO public.faixa_comissao (id, "tabelaId", parcela, percentual) VALUES ('cmufzercv00177de0pvnyudtc', 'cmufzercv00167de0mcrgkr01', 1, 0.3000);
INSERT INTO public.faixa_comissao (id, "tabelaId", parcela, percentual) VALUES ('cmufzercv00187de0nuofmf1u', 'cmufzercv00167de0mcrgkr01', 3, 0.2000);
INSERT INTO public.faixa_comissao (id, "tabelaId", parcela, percentual) VALUES ('cmufzercy001b7de0q6feqt1b', 'cmufzercy001a7de0cocjhzhh', 1, 0.3000);
INSERT INTO public.faixa_comissao (id, "tabelaId", parcela, percentual) VALUES ('cmufzercy001c7de0wwe62h73', 'cmufzercy001a7de0cocjhzhh', 3, 0.2000);
INSERT INTO public.faixa_comissao (id, "tabelaId", parcela, percentual) VALUES ('cmufzerd2001f7de051gwvj8u', 'cmufzerd1001e7de0l7r4ddvz', 1, 0.3000);

INSERT INTO public.configuracao_estorno (id, participantes, "criterioCancelamento", "limiteParcelas", "escopoBase", "vigenteDe", "vigenteAte", "criadoPorId", "criadoEm") VALUES ('cmufzerdx001r7de0tvedg1dx', '{VETERANO,EXPERT}', 'IGUAL', 1, NULL, '2026-09-01', NULL, NULL, '2026-09-24 20:25:48.069');

INSERT INTO public.regra_estorno (id, tipo, "titularVendedorId", percentual, "vigenteDe", "vigenteAte", "criadoPorId", "criadoEm") VALUES ('cmufzere1001s7de05ynouo9f', 'RECUPERACAO', NULL, 50.0000, '2026-09-01', NULL, NULL, '2026-09-24 20:25:48.073');
INSERT INTO public.regra_estorno (id, tipo, "titularVendedorId", percentual, "vigenteDe", "vigenteAte", "criadoPorId", "criadoEm") VALUES ('cmufzere3001t7de0n0spfy7f', 'CANCELAMENTO', NULL, 50.0000, '2026-09-01', NULL, NULL, '2026-09-24 20:25:48.076');

INSERT INTO public.meta_promocao (id, "categoriaOrigemId", "categoriaAlvoId", "volumeMinimo", "alertaAoFaltar", "documentoExigido", "vigenteDe", "vigenteAte", "criadoPorId", "criadoEm") VALUES ('cmufzere6001v7de04yaary8z', 'cmufzerbo00037de090jvcp0a', 'cmufzerbs00047de0x3ubnaur', 3000000.00, 500000.00, 'CNPJ', '2026-09-01', NULL, NULL, '2026-09-24 20:25:48.078');
INSERT INTO public.meta_promocao (id, "categoriaOrigemId", "categoriaAlvoId", "volumeMinimo", "alertaAoFaltar", "documentoExigido", "vigenteDe", "vigenteAte", "criadoPorId", "criadoEm") VALUES ('cmufzerec001x7de0kqdxeu2h', 'cmufzerbs00047de0x3ubnaur', 'cmufzerbv00057de0aw6529qs', 30000000.00, 500000.00, 'CNPJ', '2026-09-01', NULL, NULL, '2026-09-24 20:25:48.084');

INSERT INTO public.configuracao_sistema (chave, valor, descricao, "atualizadoPorId", "atualizadoEm") VALUES ('layout.carteira_csv', '{"colunas": {"cota": ["COTA", "NR COTA", "NUMERO COTA", "NUM COTA"], "flex": ["FLEX", "MODALIDADE", "MODALIDADE FLEX", "PLANO", "TIPO PLANO"], "grupo": ["GRUPO"], "credito": ["CREDITO", "VALOR CREDITO", "VALOR DO CREDITO", "VALOR BEM", "VALOR DO BEM", "VLR CREDITO"], "contrato": ["CONTRATO", "NR CONTRATO", "NUMERO CONTRATO", "NUM CONTRATO", "N CONTRATO"], "segmento": ["SEGMENTO", "TIPO BEM", "TIPO DE BEM", "BEM", "PRODUTO"], "situacao": ["SITUACAO", "STATUS", "SITUACAO COTA", "SITUACAO DA COTA"], "dataVenda": ["DATA VENDA", "DATA DA VENDA", "DT VENDA", "DATA ADESAO", "DATA DE ADESAO", "DT ADESAO"], "grupoCota": ["GRUPO COTA", "GRUPO/COTA", "GRUPO.COTA"], "cpfCliente": ["CPF", "CPF CNPJ", "CPF/CNPJ", "CPF CLIENTE", "CPF CONSORCIADO", "CPF CNPJ CLIENTE", "DOCUMENTO CLIENTE"], "clienteNome": ["CLIENTE", "NOME", "NOME CLIENTE", "CONSORCIADO", "NOME CONSORCIADO"], "clienteEmail": ["EMAIL", "E MAIL", "EMAIL CLIENTE"], "vendedorNome": ["VENDEDOR", "NOME VENDEDOR", "NOME DO VENDEDOR", "REPRESENTANTE", "CORRETOR"], "parcelasPagas": ["PARC PAGAS", "PARCELAS PAGAS", "QTD PARCELAS PAGAS", "QTDE PARC PAGAS", "QTD PARC PAGAS"], "clienteTelefone": ["TELEFONE", "FONE", "CELULAR", "TELEFONE CLIENTE"], "dataCancelamento": ["DATA CANCELAMENTO", "DT CANCELAMENTO", "DATA CANC", "DATA DO CANCELAMENTO"], "vendedorDocumento": ["CPF VENDEDOR", "CNPJ VENDEDOR", "CPF CNPJ VENDEDOR", "DOC VENDEDOR", "DOCUMENTO VENDEDOR"]}, "separador": ";", "situacoesCanceladas": ["CANCEL"]}', 'Layout da base de clientes (CSV)', NULL, '2026-09-24 20:25:48.086');
INSERT INTO public.configuracao_sistema (chave, valor, descricao, "atualizadoPorId", "atualizadoEm") VALUES ('layout.cv056e', '{"linha": "^\\s*(?<grupo>\\d{3,6})\\s*[/.\\- ]\\s*(?<cota>\\d{1,4})(?:-\\d)?\\s+(?:(?<contrato>\\d{5,15})\\s+)?(?<consorciado>.+?)\\s+(?<parcela>\\d{1,3})\\s+(?<tipo>[A-Za-zÀ-ú .]+?)\\s+(?<data>\\d{2}/\\d{2}/\\d{2,4})\\s+(?<valor>-?\\d{1,3}(?:\\.\\d{3})*,\\d{2}-?)\\s*$", "total": "TOTAL\\s+(?:GERAL)?[^\\d-]*(?<total>-?\\d{1,3}(?:\\.\\d{3})*,\\d{2}-?)\\s*$", "marcador": "CV056E", "classificacao": {"CANCELAMENTO": ["CANCEL", "ESTORNO", "DEBITO"], "COMISSAO_PARCELA": ["COMISS", "PARCELA", "PARC"]}}', 'Layout do relatório CV056E', NULL, '2026-09-24 20:25:48.09');
INSERT INTO public.configuracao_sistema (chave, valor, descricao, "atualizadoPorId", "atualizadoEm") VALUES ('layout.cv069e', '{"linha": "^\\s*(?<grupo>\\d{3,6})\\s*[/.\\- ]\\s*(?<cota>\\d{1,4})(?:-\\d)?\\s+(?:(?<contrato>\\d{5,15})\\s+)?(?<vendedor>.+?)\\s+(?<parcela>\\d{1,3})\\s+(?<data>\\d{2}/\\d{2}/\\d{2,4})\\s+(?<valor>-?\\d{1,3}(?:\\.\\d{3})*,\\d{2}-?)\\s*$", "total": "TOTAL\\s+(?:GERAL)?[^\\d-]*(?<total>-?\\d{1,3}(?:\\.\\d{3})*,\\d{2}-?)\\s*$", "marcador": "CV069E"}', 'Layout do relatório CV069E', NULL, '2026-09-24 20:25:48.092');
INSERT INTO public.configuracao_sistema (chave, valor, descricao, "atualizadoPorId", "atualizadoEm") VALUES ('layout.gc070a', '{"linha": "^\\s*(?<consorciado>.+?)\\s+(?<grupo>\\d{3,6})\\s*[/.\\- ]\\s*(?<cota>\\d{1,4})(?:-\\d)?\\s+(?<contrato>\\d{5,15})\\s+(?:(?<vendedor>[A-Za-zÀ-ú .]+?)\\s+)?(?<parcela>\\d{1,3})\\s+(?<valorEvento>-?\\d{1,3}(?:\\.\\d{3})*,\\d{2}-?)\\s+(?<percentual>\\d{1,3},\\d{1,4})\\s*%?\\s+(?<valor>-?\\d{1,3}(?:\\.\\d{3})*,\\d{2}-?)\\s*$", "total": "TOTAL\\s+(?:GERAL)?[^\\d-]*(?<total>-?\\d{1,3}(?:\\.\\d{3})*,\\d{2}-?)\\s*$", "marcador": "GC070A"}', 'Layout do relatório GC070A', NULL, '2026-09-24 20:25:48.094');
INSERT INTO public.configuracao_sistema (chave, valor, descricao, "atualizadoPorId", "atualizadoEm") VALUES ('promocao.inclui_canceladas', 'true', 'Produção para promoção conta a carteira completa (inclusive canceladas)', NULL, '2026-09-24 20:25:48.095');
INSERT INTO public.configuracao_sistema (chave, valor, descricao, "atualizadoPorId", "atualizadoEm") VALUES ('importacao.tamanho_lote', '250', 'Linhas aplicadas por lote de importação', NULL, '2026-09-24 20:25:48.097');

-- ---------------------------------------------------------------------
-- PRIMEIRO ADMINISTRADOR (senha com bcrypt custo 12, igual ao sistema)
-- ---------------------------------------------------------------------
CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;

DO $$
DECLARE
  v_nome  text := 'Administrador WR';             -- <<< TROQUE: seu nome
  v_email text := 'admcentralwr@gmail.com';       -- <<< TROQUE: seu e-mail de login
  v_senha text := 'TROQUE-ESTA-SENHA';            -- <<< TROQUE: senha com 10+ caracteres
BEGIN
  IF v_senha = 'TROQUE-ESTA-SENHA' OR length(v_senha) < 10 THEN
    RAISE EXCEPTION 'Defina uma senha com pelo menos 10 caracteres na linha v_senha. Nada foi alterado.';
  END IF;
  IF EXISTS (SELECT 1 FROM public.usuario WHERE perfil = 'ADMINISTRADOR' AND ativo) THEN
    RAISE EXCEPTION 'Já existe administrador ativo. Crie novos acessos pela tela Acessos. Nada foi alterado.';
  END IF;
  INSERT INTO public.usuario (id, nome, email, "senhaHash", perfil, ativo, "versaoSessao", "criadoEm", "atualizadoEm")
  VALUES (gen_random_uuid()::text, v_nome, lower(trim(v_email)), extensions.crypt(v_senha, extensions.gen_salt('bf', 12)), 'ADMINISTRADOR', true, 1, now(), now());
  INSERT INTO public.audit_log (acao, entidade, email, contexto, "criadoEm")
  VALUES ('CRIACAO', 'Usuario', lower(trim(v_email)), '{"origem": "script SQL de implantação"}'::jsonb, now());
END $$;

COMMIT;
