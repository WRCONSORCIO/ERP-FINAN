# ERP Financeiro e Comercial — WR Consórcio

Responde, com rastro, **quanto a WR deve a cada pessoa, e por quê**: produção, comissões por parcela, liberação pela parcela paga pelo cliente, folha, estornos, bônus da administradora, promoção de categoria e auditoria de cada alteração.

- Especificação funcional (fonte de verdade): [`docs/Especificacao-ERP-WR.pdf`](docs/Especificacao-ERP-WR.pdf)
- Regras financeiras implementadas, decisões e pontos em aberto: [`docs/REGRAS-FINANCEIRAS.md`](docs/REGRAS-FINANCEIRAS.md)

## Stack

Next.js 15 (App Router, Server Components, Server Actions) · React 19 · TypeScript 5.7 strict (`exactOptionalPropertyTypes`, `noUncheckedIndexedAccess`) · PostgreSQL 16 + `btree_gist` · Prisma 6 · Tailwind CSS 4 (tokens em `@theme`) · decimal.js (ROUND_HALF_UP) · jose + bcryptjs (custo 12) · Zod · ExcelJS · pdfjs-dist · pdf-lib · Vitest.

## Instalação local

```bash
npm ci
cp .env.example .env            # ajuste DATABASE_URL, DIRECT_URL e AUTH_SECRET
cp .env.test.example .env.test  # banco EXCLUSIVO de teste (nome precisa conter "test")
npm run db:migrate              # prisma migrate deploy
npm run db:seed                 # carga inicial da especificação (idempotente)
ADMIN_EMAIL=voce@wr.com.br ADMIN_NOME="Seu Nome" ADMIN_SENHA="uma-senha-longa" npm run db:criar-admin
npm run dev                     # http://localhost:3000
```

Dados de demonstração (somente banco local cujo nome contenha `dev`, `demo` ou `local`): `npm run db:demo`.
Para que a base sintética (vendas de setembro/2026) seja apurada, rode o seed com `CARGA_VIGENCIA_INICIO=2026-01-01`.

## Variáveis de ambiente

| Variável | Obrigatória | Uso |
|---|---|---|
| `DATABASE_URL` | sim | Conexão da aplicação. Na Supabase, a string do **pooler** (porta 6543) com `?pgbouncer=true&connection_limit=1`. |
| `DIRECT_URL` | sim | Conexão direta (porta 5432), usada só por `prisma migrate deploy`. |
| `AUTH_SECRET` | sim | Segredo do JWT de sessão, 32+ caracteres aleatórios (`openssl rand -base64 48`). |
| `CRON_SECRET` | não | Protege `/cron/fila` (processamento agendado da fila de recálculo). Sem ele, a rota não existe. |
| `CARGA_VIGENCIA_INICIO` | não | Só no seed: início da vigência da carga inicial (padrão `2026-09-01`). |
| `ADMIN_EMAIL`, `ADMIN_NOME`, `ADMIN_SENHA` | não | Só no script do primeiro administrador. |

Nunca commite `.env` nem `.env.test` (já estão no `.gitignore`).

## Scripts

| Comando | O que faz |
|---|---|
| `npm run lint` | ESLint (sem avisos permitidos) |
| `npm run typecheck` | `tsc --noEmit` em modo strict |
| `npm test` | Suíte **unitária** (em memória) |
| `npm run test:integration` | Suíte de **integração** em PostgreSQL real — recusa banco sem "test" no nome e apaga todas as tabelas a cada teste |
| `npm run build` | `prisma generate` + build de produção |
| `npm run db:migrate` | Aplica migrations (`prisma migrate deploy`) |
| `npm run db:seed` | Carga inicial (categorias, segmentos, tabelas de comissão, flex, estorno, metas, layouts) |
| `npm run db:criar-admin` | Cria o primeiro administrador (recusa se já existir um ativo) |
| `npm run db:demo` | Dados de demonstração (só em banco de desenvolvimento) |

## Arquitetura

```
prisma/
  schema.prisma                 44 tabelas, 24 enums
  migrations/…0001_inicial       estrutura
  migrations/…0002_integridade   btree_gist, 9 EXCLUDE de vigência, 37 CHECK, índices únicos parciais, 13 gatilhos
  carga-inicial.ts               ÚNICO lugar com percentuais e metas (valores da especificação)
src/
  lib/            dinheiro (Decimal), datas (data do fato, fuso SP), documento, permissões (matriz), sessão (JWT)
  dominio/        motores PUROS: comissão, estorno, promoção, vigência, casamento de vendedor, leitores de arquivo
  servidor/       contexto (sessão + recorte SQL), auditoria, apuração, fila, importação, promoção
    servicos/     regras de escrita (cada uma chama exigir() e grava auditoria na mesma transação)
    consultas/    leituras das telas, sempre com o recorte de visibilidade no WHERE
  app/(app)/      telas (Server Components, force-dynamic) + acoes.ts (Server Actions)
  app/exportar/   exportações CSV/XLSX/PDF com a mesma permissão e recorte das telas
  ui/             design system WR (tokens em globals.css, componentes reutilizáveis)
tests/unit        motores, dinheiro, leitores, permissões, recorte
tests/integration fluxo completo, vigência, integridade do banco, segurança, importações, fila
```

### Garantias

- **Dinheiro nunca é `number`**: Decimal em todo cálculo, `Decimal(18,2)` no banco, arredondamento ROUND_HALF_UP.
- **Nenhum percentual no código**: o motor lê regras com vigência do banco; `prisma/carga-inicial.ts` só semeia a implantação.
- **Regra pela data do fato**: comissão pela data da venda; percentual do estorno pela data do cancelamento; base do estorno pela comissão da data da venda.
- **Snapshot congelado na venda** (categoria + comportamento dela, segmento, flex, equipe, gerência, supervisor, gerente, recuperação): só importação, transferência e recongelamento o alteram.
- **Append-only**: comissão/estorno não são sobrescritos nem apagados (gatilhos no banco); folha fechada é imutável; correção após folha fechada vira **ajuste** na folha seguinte.
- **Dinheiro não apurado vira pendência**, com motivo, exemplos e conserto em Importações › Diagnóstico.
- **Recorte no SQL**: gerente vê a própria gerência, supervisor a própria equipe, sem unidade não vê nada — também nas exportações e na busca global.
- **Sessão reconferida no banco** a cada tela e ação: desativar, rebaixar ou mudar escopo vale sem logout.
- **Login**: mensagem única, custo de bcrypt também para e-mail inexistente, espera progressiva, bloqueio por e-mail e IP, aviso ao administrador; toda tentativa vai para a auditoria.

## Importações

A carteira vem **só** da base de clientes. Os quatro arquivos são reconhecidos pelo conteúdo:

| Arquivo | Formato | Reconhecimento |
|---|---|---|
| Base de clientes | CSV Latin-1, `;` | cabeçalho com grupo/cota, CPF e crédito |
| CV056E | PDF | marcador `CV056E` no texto |
| CV069E | PDF | marcador `CV069E` no texto |
| GC070A | PDF | marcador `GC070A` no texto |

Fluxo: **Enviar e ler** (guarda linhas e erros, confere contra o total do rodapé) → **Aplicar pendentes** (lotes retomáveis) → **Apurar tudo** (fila de recálculo). Reimportar é inofensivo (hash de conteúdo por linha).

> **Importante antes da produção:** os nomes de coluna do CSV e as expressões de leitura dos PDFs são **configuração** (Importações › Layout dos arquivos). A carga inicial foi escrita sem amostras reais dos arquivos da administradora; valide com um arquivo real de cada tipo e ajuste o layout na tela, se necessário. A conferência contra o total do rodapé denuncia qualquer linha não reconhecida.

## Deploy (Vercel + Supabase)

1. Crie o projeto na Supabase (PostgreSQL 16). A extensão `btree_gist` é criada pela migration.
2. Na Vercel, importe o repositório e configure `DATABASE_URL` (pooler), `DIRECT_URL` (direta), `AUTH_SECRET` e, opcionalmente, `CRON_SECRET`.
3. O `vercel.json` roda `prisma migrate deploy && npm run build` no build (região `gru1`) e agenda `/cron/fila` de hora em hora.
4. Depois do primeiro deploy, com as variáveis apontando para produção, rode **uma vez** localmente: `npm run db:seed` (defina `CARGA_VIGENCIA_INICIO` conforme a decisão da WR) e `npm run db:criar-admin`.
5. Nunca aponte `.env.test` para o banco de produção: a suíte de integração apaga tabelas (e se recusa a rodar sem "test" no nome do banco).

Migrations nunca são editadas depois de aplicadas em produção: mudança de estrutura = migration nova.
