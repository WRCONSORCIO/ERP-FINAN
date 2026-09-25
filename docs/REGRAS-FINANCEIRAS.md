# Regras financeiras — como o ERP calcula, e o que ainda depende de decisão

Complementa a especificação (`docs/Especificacao-ERP-WR.pdf`). Cada item diz **onde** a regra está no código e **qual teste** a garante.

## 1. Comissão (especificação 6.4)

```
base  = crédito × % da base do flex         (Flex N = 100 − N %; sem flex = 100%; arredondada a centavos, ROUND_HALF_UP)
valor = base × percentual da parcela no destino
```

- **Regra pela data da venda**: `TabelaComissao` vigente em `cota.dataVenda`. Exceção individual (documento para vendedor, pessoa para supervisão/gerência) vence a padrão. — `src/servidor/apuracao.ts › tabelaVigente`
- **Destinos pela categoria congelada**: vendedor sempre; supervisão se `geraSupervisao`; gerência se `geraGerencia`. As flags da categoria são **congeladas na venda** junto com ela (`snapPagaPelaWr`, `snapGeraSupervisao`, `snapGeraGerencia`): editar a categoria muda só o futuro.
- **Parcela sem faixa não paga** (é como a WR desliga parcelas).
- **Quem paga**: vendedor → a WR se a categoria disser `pagaPelaWr`; senão a administradora (o valor é calculado mesmo assim, é a base do estorno). Supervisão e gerência → sempre a WR. Gatilho `tg_comissao_quem_paga` no banco.
- **Liberação**: a comissão da parcela N é liberada quando a base de clientes registra `parcelasPagas ≥ N`. Fica gravado quantas parcelas o cliente havia pago (`parcelasPagasNaLiberacao`). O repasse da administradora (CV056E) **não** é gatilho.
- **Memória de cálculo** em JSON em cada linha: crédito, flex (e regra/vigência), base, percentual, tabela e vigência, exceção, data do fato, titular, quem paga, liberação e a fórmula por extenso.
- Testes: `tests/unit/comissao.test.ts`, `tests/integration/fluxo.test.ts` (R$ 100.000 × 50% × 0,50% = R$ 250,00).

## 2. Reapuração, append-only e folha fechada

- Linha igual → mantida (só muda de prevista para liberada).
- Linha diferente fora de folha → **cancelada** (com motivo) e outra criada. Nada é sobrescrito (gatilho `tg_comissao_imutavel`).
- Linha já **em folha fechada ou paga** → nunca muda. A diferença entre o devido e o já fechado vira **ajuste** por titular (pode ser negativo), que entra na próxima folha. Ex.: transferência de venda já paga → ajuste −R$ 250 para quem recebeu e +R$ 250 para o novo responsável.
- Venda cancelada → parcelas ainda não pagas são canceladas ("a parcela não será paga pelo cliente").
- Folha: entra só comissão **liberada**, paga pela WR, fora de folha, liberada até o fim da competência. Fechar congela; marcar paga registra data, valor efetivamente pago e referência (divergência fica registrada). Estorno **não** é descontado automaticamente.

## 3. Estorno (especificação 6.6)

- Só em venda **cancelada**. Tipo: **recuperação** se a venda foi feita em período de recuperação **e** casa o critério de recuperação (ex.: menos de 6 parcelas pagas; sem critério = qualquer quantidade) — tem precedência; senão **cancelamento** se o critério dele casar (`IGUAL` ou `ABAIXO_DE` o limite de parcelas pagas; limite 0 desliga).
- **Participantes** por configuração (códigos de categoria e/ou `SUPERVISAO`/`GERENCIA`). Carga inicial: Veterano e Expert.
- **Percentual** pela regra vigente na **data do cancelamento**, por tipo. Vale o mais específico: **exceção do vendedor** › **percentual da categoria** (ou supervisão/gerência) › **padrão**. Cada nível tem vigência própria, cadastrada em Configurações › Estornos. Carga inicial: padrão 50% e 50%.
- **Base** = comissões calculadas com a tabela da **data da venda**, conforme o escopo: parcelas recebidas · só a primeira · total da tabela.
- Único por (cota, destino) — `ux_estorno_cota_destino`. Estorno em cobrança/quitado/perdoado **nunca** é invalidado (gatilho).
- **Sem titular** → o estorno é criado como SEM TITULAR, vira pendência e notificação. O dinheiro não some.
- **Competência da cobrança** = data do débito do cancelamento no CV056E (`dataDebitoAdm`).
- **Ciclo**: a cobrar → em cobrança → quitado, ou perdoado (perdoar exige nível "tudo"). Cada passo em `EstornoMovimento` + auditoria. "Desconto em folha" é registrado como forma de cobrança, sem abatimento automático.
- Testes: `tests/unit/estorno.test.ts`, `tests/integration/fluxo.test.ts`, `tests/integration/vigencia.test.ts`.

## 4. Promoção (6.7)

Volume = soma do **crédito total** das vendas de todos os documentos da pessoa, em categorias que contam para promoção. Degrau atual = maior categoria vigente entre os documentos ativos. O sistema **sinaliza** (tela, faixa de avisos e notificação) ao faltar o limiar de alerta e ao atingir a meta; a promoção é um ato registrado na ficha (nova vigência de categoria marcada como promoção, auditoria `PROMOCAO`).

## 5. Vigência (6.2)

`vigenteDe`/`vigenteAte` inclusivos; `vigenteAte` nulo = vigente. Abrir vigência nova encerra a atual no dia anterior; é **recusado** se a nova começaria antes da atual ou se tiraria a regra de um fato já apurado. Sobreposição é impossível no banco (9 `EXCLUDE USING gist`). Toda alteração de regra pode ser **simulada** antes (Comissões e Estornos), sem gravar nada.

**Data passada.** Salvar uma regra com data de início encaixa a regra na linha do tempo: depois de uma vigência, encerra a anterior na véspera; antes de uma vigência, termina na véspera da seguinte; na mesma data de uma vigência ainda não usada, substitui. É recusado só quando tiraria a regra de um fato já calculado.

**Correção de cadastro.** Vigência que ainda **não foi usada em nenhum cálculo** (nenhuma comissão, estorno ou venda congelada aponta para ela) pode ser **corrigida** — valores e datas, inclusive para trás — ou **excluída**, em Configurações (tabelas de comissão, critério e percentuais de estorno, metas, flex; segmentos sem uso também). Ao excluir, a vigência anterior da mesma regra, que tinha sido encerrada por ela, volta a valer pelo período. Motivo obrigatório, auditoria com antes e depois, e as vendas em pendência voltam para a fila. Depois de usada, a vigência é imutável: a mudança é vigência nova. — `src/servidor/servicos/vigencias.ts`, teste em `tests/integration/vigencia.test.ts`.

## 6. Decisões técnicas tomadas na implementação

| Tema | Decisão | Onde mudar |
|---|---|---|
| Flex | **Regra da WR:** "Flex N" reduz a base em N% — Flex 10 = base de 90% do crédito, Flex 30 = 70% (Flex 50 = 50%, como na especificação). Não existe Flex 100. **Venda sem flex no arquivo = Integral** (100%, crédito cheio). A migration `20260925000003_flex_reduz_base` corrigiu a carga inicial onde nenhuma venda ainda usava o plano. | Configurações › Flex |
| Data do cancelamento | Coluna de data de cancelamento da base, se existir. Senão, a data da importação que registrou o cancelamento — gravada em `origemDataCancelamento` e na memória do estorno. | Layout da base |
| Situação cancelada | Situação que contém o trecho `CANCEL` (normalizado). | Importações › Layout |
| Promoção | Conta a carteira completa, **inclusive canceladas** (texto literal da especificação). | `ConfiguracaoSistema: promocao.inclui_canceladas` |
| Casamento de vendedor | Documento primeiro; nome normalizado só quando aponta para um único cadastro; apelido só por decisão registrada ("Vincular nome"). Nunca por semelhança. | — |
| Vendedor corrigido pela administradora | Vira **divergência** visível (Importações e ficha da cota); aceitar = transferência registrada. (Pendência 2 da especificação.) | — |
| Conferência do arquivo | Em **Decimal**. (Pendência 3 da especificação.) | — |
| Estorno sem titular | Registrado como SEM TITULAR + pendência. (Pendência 4 da especificação.) | — |
| Revalidação e carregamento | Ações não usam `revalidatePath`; o formulário atualiza a tela ao dar certo (todas as telas são `force-dynamic`). O carregamento de navegação aparece no link clicado (`useLinkStatus`), sem `loading.tsx` de rota — no Next 15.5 ele prendia as transições dentro da mesma tela (verificado no navegador). | `src/servidor/acao.ts`, `src/ui/indicador-link.tsx` |

## 7. Pontos que dependem de decisão da WR

1. **Escopo da base do estorno.** A especificação lista as três opções e não informa o padrão. A carga inicial deixa **indefinido**: estornos ficam em pendência (com aviso em Configurações) até alguém escolher em Configurações › Estornos. A escolha não reescreve nada, porque com o escopo indefinido nenhum estorno foi apurado.
2. **Gerência para Veterano/Expert.** A especificação restringe a supervisão ("hoje, só iniciante"), mas não restringe a gerência. A carga inicial marca `geraGerencia = sim` nas três categorias. Se estiver errado, ajuste em Configurações › Categorias; vale para as vendas importadas depois.
3. **Início da carga inicial: 01/11/2024** (decisão da WR; `CARGA_VIGENCIA_INICIO`). A migration `20260925000004_carga_desde_nov_2024` moveu as regras da carga que ainda estavam em 01/09/2026 e não tinham sido usadas. Cada regra continua editável em Configurações › “Corrigir / excluir”. Vendas anteriores à data ficam em pendência `SEM_TABELA`.
4. **Layout real dos arquivos.** Os nomes de coluna do CSV e as expressões dos PDFs (CV056E, CV069E e GC070A) foram escritos sem amostra real. São configuração editável na tela, mas precisam ser **validados com um arquivo real de cada tipo** antes da primeira folha.
5. **Estorno na folha.** Descontar, cobrar à parte ou parcelar (seção 11, item 3). Hoje fica registrado como forma de cobrança, sem abatimento automático.
6. **Layout de exportação para banco e contabilidade.** As exportações atuais são CSV (`;`, decimal com vírgula) e XLSX. Se o banco exigir um layout de remessa, ele precisa ser informado.
7. **Retenção LGPD.** O prazo de retenção não está definido. A anonimização de contato de vendas canceladas antigas existe como ação manual.
8. **Logo oficial.** O cabeçalho usa o monograma "WR" até haver arquivo de logo.

## 8. Fora do escopo por decisão da especificação

Não existe tela de "Fechamento da Administradora", cadastro manual de cota, recuperação automática de senha nem perfil vendedor. **Anexos**: a tabela `Anexo` existe (preparação), mas não há tela, porque não foi provisionado armazenamento de arquivos. **Notificação por e-mail**: não há serviço de e-mail configurado; as notificações persistem no sistema.
