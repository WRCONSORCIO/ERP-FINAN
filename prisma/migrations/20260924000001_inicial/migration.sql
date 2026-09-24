-- CreateEnum
CREATE TYPE "Perfil" AS ENUM ('ADMINISTRADOR', 'FINANCEIRO', 'CADASTRO', 'GERENTE', 'SUPERVISOR');

-- CreateEnum
CREATE TYPE "StatusUnidade" AS ENUM ('ATIVO', 'INATIVO');

-- CreateEnum
CREATE TYPE "TipoDocumento" AS ENUM ('CPF', 'CNPJ');

-- CreateEnum
CREATE TYPE "StatusVendedor" AS ENUM ('ATIVO', 'DESLIGADO');

-- CreateEnum
CREATE TYPE "PapelResponsavel" AS ENUM ('SUPERVISOR', 'GERENTE');

-- CreateEnum
CREATE TYPE "DestinoComissao" AS ENUM ('VENDEDOR', 'SUPERVISAO', 'GERENCIA');

-- CreateEnum
CREATE TYPE "StatusComissao" AS ENUM ('PREVISTA', 'LIBERADA', 'EM_FOLHA', 'PAGA', 'CANCELADA');

-- CreateEnum
CREATE TYPE "TipoEstorno" AS ENUM ('RECUPERACAO', 'CANCELAMENTO');

-- CreateEnum
CREATE TYPE "StatusEstorno" AS ENUM ('A_COBRAR', 'EM_COBRANCA', 'QUITADO', 'PERDOADO', 'INVALIDADO');

-- CreateEnum
CREATE TYPE "CriterioCancelamento" AS ENUM ('IGUAL', 'ABAIXO_DE');

-- CreateEnum
CREATE TYPE "EscopoBaseEstorno" AS ENUM ('PARCELAS_RECEBIDAS', 'PRIMEIRA_PARCELA', 'TOTAL_TABELA');

-- CreateEnum
CREATE TYPE "TipoImportacao" AS ENUM ('CARTEIRA_CSV', 'FECHAMENTO_CV056E', 'COMISSAO_VENDEDOR_CV069E', 'BONUS_GC070A');

-- CreateEnum
CREATE TYPE "StatusImportacao" AS ENUM ('RECEBIDA', 'APLICANDO', 'APLICADA', 'FALHOU');

-- CreateEnum
CREATE TYPE "StatusLinha" AS ENUM ('PENDENTE', 'NOVA', 'ATUALIZADA', 'SEM_MUDANCA', 'ERRO');

-- CreateEnum
CREATE TYPE "StatusFolha" AS ENUM ('FECHADA', 'PAGA');

-- CreateEnum
CREATE TYPE "AcaoAuditoria" AS ENUM ('LOGIN', 'LOGIN_FALHA', 'LOGIN_BLOQUEADO', 'LOGOUT', 'CRIACAO', 'ALTERACAO', 'EXCLUSAO', 'DESATIVACAO', 'REATIVACAO', 'ALTERACAO_REGRA', 'ALTERACAO_CATEGORIA', 'PROMOCAO', 'ALTERACAO_ALOCACAO', 'RECUPERACAO', 'TRANSFERENCIA_VENDEDOR', 'RECONGELAMENTO', 'IMPORTACAO', 'APURACAO', 'FECHAMENTO_FOLHA', 'PAGAMENTO_FOLHA', 'ESTORNO_COBRANCA', 'TROCA_SENHA', 'ACESSO_DADO_PESSOAL', 'SOLICITACAO_TITULAR', 'ANONIMIZACAO', 'EXPORTACAO');

-- CreateEnum
CREATE TYPE "TipoNotificacao" AS ENUM ('PROXIMO_DA_META', 'APTO_A_PROMOCAO', 'PENDENCIA_CADASTRO', 'DIVERGENCIA_IMPORTACAO', 'ERRO_IMPORTACAO', 'IMPORTACAO_CONCLUIDA', 'ESTORNO_SEM_TITULAR', 'REGRA_FALTANTE', 'VENDEDOR_CORRIGIDO', 'BLOQUEIO_LOGIN', 'FALHA_PROCESSAMENTO');

-- CreateEnum
CREATE TYPE "Severidade" AS ENUM ('INFO', 'ATENCAO', 'CRITICA');

-- CreateEnum
CREATE TYPE "StatusEvento" AS ENUM ('PENDENTE', 'PROCESSANDO', 'CONCLUIDO', 'ERRO');

-- CreateEnum
CREATE TYPE "TipoPendencia" AS ENUM ('SEM_VENDEDOR', 'VENDEDOR_SEM_CADASTRO', 'SEM_CATEGORIA', 'SEM_ESTRUTURA', 'SEM_SEGMENTO', 'SEM_FLEX', 'SEM_TABELA', 'SEM_RESPONSAVEL', 'ESTORNO_SEM_CONFIGURACAO', 'ESTORNO_SEM_REGRA', 'ESTORNO_SEM_TITULAR', 'AJUSTE_FOLHA_FECHADA', 'ESTORNO_DIVERGENTE', 'DIVERGENCIA_VENDEDOR');

-- CreateEnum
CREATE TYPE "StatusDivergencia" AS ENUM ('ABERTA', 'ACEITA', 'REJEITADA');

-- CreateEnum
CREATE TYPE "TipoLancamento" AS ENUM ('COMISSAO_PARCELA', 'CANCELAMENTO', 'OUTRO');

-- CreateEnum
CREATE TYPE "TipoSolicitacaoTitular" AS ENUM ('ACESSO', 'CORRECAO', 'EXCLUSAO', 'ANONIMIZACAO');

-- CreateEnum
CREATE TYPE "StatusSolicitacaoTitular" AS ENUM ('ABERTA', 'ATENDIDA', 'RECUSADA');

-- CreateTable
CREATE TABLE "usuario" (
    "id" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "senhaHash" TEXT NOT NULL,
    "perfil" "Perfil" NOT NULL,
    "gerenciaId" TEXT,
    "equipeId" TEXT,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "versaoSessao" INTEGER NOT NULL DEFAULT 1,
    "ultimoAcesso" TIMESTAMP(3),
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizadoEm" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "usuario_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "login_tentativa" (
    "id" BIGSERIAL NOT NULL,
    "email" TEXT NOT NULL,
    "ip" TEXT NOT NULL,
    "sucesso" BOOLEAN NOT NULL,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "login_tentativa_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "administradora" (
    "id" TEXT NOT NULL,
    "codigo" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "cnpj" TEXT,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "administradora_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "gerencia" (
    "id" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "status" "StatusUnidade" NOT NULL DEFAULT 'ATIVO',
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "gerencia_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "equipe" (
    "id" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "gerenciaId" TEXT NOT NULL,
    "status" "StatusUnidade" NOT NULL DEFAULT 'ATIVO',
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "equipe_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "responsavel_unidade" (
    "id" TEXT NOT NULL,
    "papel" "PapelResponsavel" NOT NULL,
    "gerenciaId" TEXT,
    "equipeId" TEXT,
    "pessoaId" TEXT NOT NULL,
    "vigenteDe" DATE NOT NULL,
    "vigenteAte" DATE,
    "criadoPorId" TEXT,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "responsavel_unidade_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pessoa" (
    "id" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "nomeNormalizado" TEXT NOT NULL,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "pessoa_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vendedor" (
    "id" TEXT NOT NULL,
    "pessoaId" TEXT NOT NULL,
    "tipoDocumento" "TipoDocumento" NOT NULL,
    "documento" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "nomeNormalizado" TEXT NOT NULL,
    "status" "StatusVendedor" NOT NULL DEFAULT 'ATIVO',
    "desligadoEm" DATE,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "vendedor_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vendedor_alias" (
    "id" TEXT NOT NULL,
    "vendedorId" TEXT NOT NULL,
    "nomeNormalizado" TEXT NOT NULL,
    "criadoPorId" TEXT,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "vendedor_alias_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pessoa_vinculo" (
    "id" TEXT NOT NULL,
    "pessoaId" TEXT NOT NULL,
    "vendedorId" TEXT NOT NULL,
    "motivo" TEXT NOT NULL,
    "criadoPorId" TEXT,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "pessoa_vinculo_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "categoria_vendedor" (
    "id" TEXT NOT NULL,
    "codigo" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "descricao" TEXT,
    "ordem" INTEGER NOT NULL,
    "documentosAceitos" "TipoDocumento"[],
    "pagaPelaWr" BOOLEAN NOT NULL,
    "geraSupervisao" BOOLEAN NOT NULL,
    "geraGerencia" BOOLEAN NOT NULL,
    "contaParaPromocao" BOOLEAN NOT NULL,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "categoria_vendedor_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vendedor_categoria" (
    "id" TEXT NOT NULL,
    "vendedorId" TEXT NOT NULL,
    "categoriaId" TEXT NOT NULL,
    "vigenteDe" DATE NOT NULL,
    "vigenteAte" DATE,
    "promocao" BOOLEAN NOT NULL DEFAULT false,
    "motivo" TEXT,
    "criadoPorId" TEXT,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "vendedor_categoria_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vendedor_alocacao" (
    "id" TEXT NOT NULL,
    "vendedorId" TEXT NOT NULL,
    "equipeId" TEXT NOT NULL,
    "vigenteDe" DATE NOT NULL,
    "vigenteAte" DATE,
    "motivo" TEXT,
    "criadoPorId" TEXT,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "vendedor_alocacao_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "periodo_recuperacao" (
    "id" TEXT NOT NULL,
    "vendedorId" TEXT NOT NULL,
    "inicio" DATE NOT NULL,
    "fim" DATE,
    "motivo" TEXT,
    "canceladoEm" TIMESTAMP(3),
    "canceladoPorId" TEXT,
    "motivoCancelamento" TEXT,
    "criadoPorId" TEXT,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "periodo_recuperacao_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "segmento" (
    "id" TEXT NOT NULL,
    "codigo" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "aliases" TEXT[],
    "ativo" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "segmento_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cota" (
    "id" TEXT NOT NULL,
    "administradoraId" TEXT NOT NULL,
    "contrato" TEXT NOT NULL,
    "grupo" TEXT NOT NULL,
    "cota" TEXT NOT NULL,
    "cpfCliente" TEXT NOT NULL,
    "clienteNome" TEXT NOT NULL,
    "clienteEmail" TEXT,
    "clienteTelefone" TEXT,
    "credito" DECIMAL(18,2) NOT NULL,
    "dataVenda" DATE NOT NULL,
    "parcelasPagas" INTEGER NOT NULL,
    "situacao" TEXT NOT NULL,
    "cancelada" BOOLEAN NOT NULL DEFAULT false,
    "dataCancelamento" DATE,
    "origemDataCancelamento" TEXT,
    "segmentoTexto" TEXT,
    "flexTexto" TEXT,
    "vendedorNomeImportado" TEXT,
    "vendedorDocImportado" TEXT,
    "hashConteudo" TEXT NOT NULL,
    "anonimizadaEm" TIMESTAMP(3),
    "vendedorId" TEXT,
    "snapVendedorId" TEXT,
    "snapCategoriaId" TEXT,
    "snapSegmentoId" TEXT,
    "snapModalidadeFlexId" TEXT,
    "snapEquipeId" TEXT,
    "snapGerenciaId" TEXT,
    "snapSupervisorPessoaId" TEXT,
    "snapGerentePessoaId" TEXT,
    "snapRecuperacao" BOOLEAN NOT NULL DEFAULT false,
    "snapPagaPelaWr" BOOLEAN,
    "snapGeraSupervisao" BOOLEAN,
    "snapGeraGerencia" BOOLEAN,
    "snapCongeladoEm" TIMESTAMP(3),
    "snapOrigem" TEXT,
    "primeiraImportacaoId" TEXT,
    "ultimaImportacaoId" TEXT,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizadoEm" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "cota_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cota_versao" (
    "id" TEXT NOT NULL,
    "cotaId" TEXT NOT NULL,
    "importacaoId" TEXT,
    "hash" TEXT NOT NULL,
    "dados" JSONB NOT NULL,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "cota_versao_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cota_transferencia" (
    "id" TEXT NOT NULL,
    "cotaId" TEXT NOT NULL,
    "vendedorAnteriorId" TEXT,
    "vendedorNovoId" TEXT NOT NULL,
    "motivo" TEXT NOT NULL,
    "origem" TEXT NOT NULL,
    "criadoPorId" TEXT,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "cota_transferencia_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "divergencia_vendedor" (
    "id" TEXT NOT NULL,
    "cotaId" TEXT NOT NULL,
    "importacaoId" TEXT,
    "nomeAnterior" TEXT,
    "docAnterior" TEXT,
    "nomeNovo" TEXT,
    "docNovo" TEXT,
    "status" "StatusDivergencia" NOT NULL DEFAULT 'ABERTA',
    "resolvidoPorId" TEXT,
    "resolvidoEm" TIMESTAMP(3),
    "observacao" TEXT,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "divergencia_vendedor_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tabela_comissao" (
    "id" TEXT NOT NULL,
    "destino" "DestinoComissao" NOT NULL,
    "segmentoId" TEXT NOT NULL,
    "categoriaId" TEXT,
    "titularVendedorId" TEXT,
    "titularPessoaId" TEXT,
    "vigenteDe" DATE NOT NULL,
    "vigenteAte" DATE,
    "observacao" TEXT,
    "criadoPorId" TEXT,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "tabela_comissao_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "faixa_comissao" (
    "id" TEXT NOT NULL,
    "tabelaId" TEXT NOT NULL,
    "parcela" INTEGER NOT NULL,
    "percentual" DECIMAL(9,4) NOT NULL,

    CONSTRAINT "faixa_comissao_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "modalidade_flex" (
    "id" TEXT NOT NULL,
    "codigo" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "percentual" DECIMAL(9,4) NOT NULL,
    "aliases" TEXT[],
    "vigenteDe" DATE NOT NULL,
    "vigenteAte" DATE,
    "criadoPorId" TEXT,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "modalidade_flex_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "configuracao_estorno" (
    "id" TEXT NOT NULL,
    "participantes" TEXT[],
    "criterioCancelamento" "CriterioCancelamento" NOT NULL,
    "limiteParcelas" INTEGER NOT NULL,
    "escopoBase" "EscopoBaseEstorno",
    "vigenteDe" DATE NOT NULL,
    "vigenteAte" DATE,
    "criadoPorId" TEXT,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "configuracao_estorno_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "regra_estorno" (
    "id" TEXT NOT NULL,
    "tipo" "TipoEstorno" NOT NULL,
    "titularVendedorId" TEXT,
    "percentual" DECIMAL(9,4) NOT NULL,
    "vigenteDe" DATE NOT NULL,
    "vigenteAte" DATE,
    "criadoPorId" TEXT,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "regra_estorno_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "meta_promocao" (
    "id" TEXT NOT NULL,
    "categoriaOrigemId" TEXT NOT NULL,
    "categoriaAlvoId" TEXT NOT NULL,
    "volumeMinimo" DECIMAL(18,2) NOT NULL,
    "alertaAoFaltar" DECIMAL(18,2) NOT NULL,
    "documentoExigido" "TipoDocumento",
    "vigenteDe" DATE NOT NULL,
    "vigenteAte" DATE,
    "criadoPorId" TEXT,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "meta_promocao_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "lancamento_administradora" (
    "id" TEXT NOT NULL,
    "importacaoId" TEXT NOT NULL,
    "cotaId" TEXT,
    "grupo" TEXT NOT NULL,
    "cota" TEXT NOT NULL,
    "contrato" TEXT,
    "consorciado" TEXT,
    "tipoOrigemTexto" TEXT NOT NULL,
    "tipo" "TipoLancamento" NOT NULL,
    "parcela" INTEGER,
    "valor" DECIMAL(18,2) NOT NULL,
    "dataReferencia" DATE,
    "hash" TEXT NOT NULL,
    "linhaOriginal" TEXT NOT NULL,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "lancamento_administradora_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "comissao_vendedor_adm" (
    "id" TEXT NOT NULL,
    "importacaoId" TEXT NOT NULL,
    "cotaId" TEXT,
    "vendedorId" TEXT,
    "vendedorTexto" TEXT,
    "grupo" TEXT NOT NULL,
    "cota" TEXT NOT NULL,
    "contrato" TEXT,
    "parcela" INTEGER,
    "valor" DECIMAL(18,2) NOT NULL,
    "dataReferencia" DATE,
    "hash" TEXT NOT NULL,
    "linhaOriginal" TEXT NOT NULL,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "comissao_vendedor_adm_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bonus_incentivo" (
    "id" TEXT NOT NULL,
    "importacaoId" TEXT NOT NULL,
    "cotaId" TEXT,
    "consorciado" TEXT,
    "grupo" TEXT NOT NULL,
    "cota" TEXT NOT NULL,
    "contrato" TEXT,
    "parcela" INTEGER,
    "valorEvento" DECIMAL(18,2) NOT NULL,
    "percentualIncentivo" DECIMAL(9,4) NOT NULL,
    "valorBonus" DECIMAL(18,2) NOT NULL,
    "vendedorNaImportacaoId" TEXT,
    "vendedorNaImportacaoNome" TEXT,
    "equipeId" TEXT,
    "gerenciaId" TEXT,
    "reconciliadoEm" TIMESTAMP(3),
    "reconciliadoPorId" TEXT,
    "dataReferencia" DATE,
    "hash" TEXT NOT NULL,
    "linhaOriginal" TEXT NOT NULL,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "bonus_incentivo_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "comissao_apurada" (
    "id" TEXT NOT NULL,
    "cotaId" TEXT NOT NULL,
    "parcela" INTEGER NOT NULL,
    "destino" "DestinoComissao" NOT NULL,
    "titularVendedorId" TEXT,
    "titularPessoaId" TEXT NOT NULL,
    "tabelaId" TEXT NOT NULL,
    "base" DECIMAL(18,2) NOT NULL,
    "percentual" DECIMAL(9,4) NOT NULL,
    "valor" DECIMAL(18,2) NOT NULL,
    "pagaPelaWr" BOOLEAN NOT NULL,
    "status" "StatusComissao" NOT NULL DEFAULT 'PREVISTA',
    "parcelasPagasNaLiberacao" INTEGER,
    "liberadaEm" TIMESTAMP(3),
    "folhaId" TEXT,
    "memoria" JSONB NOT NULL,
    "canceladaEm" TIMESTAMP(3),
    "motivoCancelamento" TEXT,
    "ajusteDeId" TEXT,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "comissao_apurada_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "estorno" (
    "id" TEXT NOT NULL,
    "cotaId" TEXT NOT NULL,
    "destino" "DestinoComissao" NOT NULL,
    "tipo" "TipoEstorno" NOT NULL,
    "titularVendedorId" TEXT,
    "titularPessoaId" TEXT,
    "configuracaoId" TEXT NOT NULL,
    "regraId" TEXT,
    "parcelasPagas" INTEGER NOT NULL,
    "comissaoBase" DECIMAL(18,2) NOT NULL,
    "percentual" DECIMAL(9,4) NOT NULL,
    "valor" DECIMAL(18,2) NOT NULL,
    "dataEvento" DATE NOT NULL,
    "dataDebitoAdm" DATE,
    "status" "StatusEstorno" NOT NULL DEFAULT 'A_COBRAR',
    "memoria" JSONB NOT NULL,
    "invalidadoEm" TIMESTAMP(3),
    "motivoInvalidacao" TEXT,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "estorno_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "estorno_movimento" (
    "id" TEXT NOT NULL,
    "estornoId" TEXT NOT NULL,
    "de" "StatusEstorno" NOT NULL,
    "para" "StatusEstorno" NOT NULL,
    "valor" DECIMAL(18,2),
    "forma" TEXT,
    "referencia" TEXT,
    "motivo" TEXT NOT NULL,
    "usuarioId" TEXT,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "estorno_movimento_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "folha_comissao" (
    "id" TEXT NOT NULL,
    "competencia" TEXT NOT NULL,
    "liberadasAte" TIMESTAMP(3) NOT NULL,
    "status" "StatusFolha" NOT NULL DEFAULT 'FECHADA',
    "total" DECIMAL(18,2) NOT NULL,
    "quantidade" INTEGER NOT NULL,
    "fechadaEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "fechadaPorId" TEXT,
    "pagaEm" TIMESTAMP(3),
    "pagaPorId" TEXT,
    "valorPagoInformado" DECIMAL(18,2),
    "referenciaPagamento" TEXT,
    "observacao" TEXT,

    CONSTRAINT "folha_comissao_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pendencia" (
    "id" TEXT NOT NULL,
    "cotaId" TEXT,
    "tipo" "TipoPendencia" NOT NULL,
    "destino" "DestinoComissao",
    "chave" TEXT NOT NULL,
    "descricao" TEXT NOT NULL,
    "detalhe" JSONB,
    "resolvidaEm" TIMESTAMP(3),
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "pendencia_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "importacao" (
    "id" TEXT NOT NULL,
    "tipo" "TipoImportacao" NOT NULL,
    "administradoraId" TEXT NOT NULL,
    "nomeArquivo" TEXT NOT NULL,
    "hashArquivo" TEXT NOT NULL,
    "tamanhoBytes" INTEGER NOT NULL,
    "status" "StatusImportacao" NOT NULL DEFAULT 'RECEBIDA',
    "totalLinhas" INTEGER NOT NULL DEFAULT 0,
    "novos" INTEGER NOT NULL DEFAULT 0,
    "atualizados" INTEGER NOT NULL DEFAULT 0,
    "repetidos" INTEGER NOT NULL DEFAULT 0,
    "erros" INTEGER NOT NULL DEFAULT 0,
    "divergencias" INTEGER NOT NULL DEFAULT 0,
    "totalArquivo" DECIMAL(18,2),
    "totalReconhecido" DECIMAL(18,2),
    "diferencaConferencia" DECIMAL(18,2),
    "cursor" INTEGER NOT NULL DEFAULT 0,
    "mensagem" TEXT,
    "enviadoPorId" TEXT,
    "enviadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "concluidoEm" TIMESTAMP(3),

    CONSTRAINT "importacao_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "linha_importacao" (
    "id" TEXT NOT NULL,
    "importacaoId" TEXT NOT NULL,
    "numero" INTEGER NOT NULL,
    "dados" JSONB NOT NULL,
    "original" TEXT NOT NULL,
    "status" "StatusLinha" NOT NULL DEFAULT 'PENDENTE',
    "mensagem" TEXT,

    CONSTRAINT "linha_importacao_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "importacao_erro" (
    "id" TEXT NOT NULL,
    "importacaoId" TEXT NOT NULL,
    "linha" INTEGER NOT NULL,
    "conteudo" TEXT NOT NULL,
    "motivo" TEXT NOT NULL,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "importacao_erro_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_log" (
    "id" BIGSERIAL NOT NULL,
    "usuarioId" TEXT,
    "email" TEXT,
    "acao" "AcaoAuditoria" NOT NULL,
    "entidade" TEXT NOT NULL,
    "entidadeId" TEXT,
    "antes" JSONB,
    "depois" JSONB,
    "contexto" JSONB,
    "ip" TEXT,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_log_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notificacao" (
    "id" TEXT NOT NULL,
    "usuarioId" TEXT NOT NULL,
    "tipo" "TipoNotificacao" NOT NULL,
    "severidade" "Severidade" NOT NULL,
    "titulo" TEXT NOT NULL,
    "mensagem" TEXT NOT NULL,
    "link" TEXT,
    "chave" TEXT NOT NULL,
    "lidaEm" TIMESTAMP(3),
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notificacao_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "configuracao_sistema" (
    "chave" TEXT NOT NULL,
    "valor" JSONB NOT NULL,
    "descricao" TEXT,
    "atualizadoPorId" TEXT,
    "atualizadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "configuracao_sistema_pkey" PRIMARY KEY ("chave")
);

-- CreateTable
CREATE TABLE "evento_dominio" (
    "id" TEXT NOT NULL,
    "tipo" TEXT NOT NULL,
    "cotaId" TEXT,
    "payload" JSONB,
    "status" "StatusEvento" NOT NULL DEFAULT 'PENDENTE',
    "tentativas" INTEGER NOT NULL DEFAULT 0,
    "proximaTentativaEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ultimoErro" TEXT,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processadoEm" TIMESTAMP(3),

    CONSTRAINT "evento_dominio_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "evento_entrega" (
    "id" TEXT NOT NULL,
    "eventoId" TEXT NOT NULL,
    "tentativa" INTEGER NOT NULL,
    "iniciadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "concluidoEm" TIMESTAMP(3),
    "sucesso" BOOLEAN NOT NULL DEFAULT false,
    "erro" TEXT,

    CONSTRAINT "evento_entrega_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "acesso_dado_pessoal" (
    "id" BIGSERIAL NOT NULL,
    "usuarioId" TEXT NOT NULL,
    "entidade" TEXT NOT NULL,
    "entidadeId" TEXT NOT NULL,
    "finalidade" TEXT NOT NULL,
    "ip" TEXT,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "acesso_dado_pessoal_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "solicitacao_titular" (
    "id" TEXT NOT NULL,
    "documento" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "tipo" "TipoSolicitacaoTitular" NOT NULL,
    "descricao" TEXT NOT NULL,
    "status" "StatusSolicitacaoTitular" NOT NULL DEFAULT 'ABERTA',
    "resposta" TEXT,
    "criadoPorId" TEXT,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "concluidoPorId" TEXT,
    "concluidoEm" TIMESTAMP(3),

    CONSTRAINT "solicitacao_titular_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "anexo" (
    "id" TEXT NOT NULL,
    "entidade" TEXT NOT NULL,
    "entidadeId" TEXT NOT NULL,
    "nomeArquivo" TEXT NOT NULL,
    "tipoMime" TEXT NOT NULL,
    "tamanhoBytes" INTEGER NOT NULL,
    "sha256" TEXT NOT NULL,
    "storageKey" TEXT NOT NULL,
    "criadoPorId" TEXT,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "anexo_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "usuario_email_key" ON "usuario"("email");

-- CreateIndex
CREATE INDEX "login_tentativa_email_criadoEm_idx" ON "login_tentativa"("email", "criadoEm");

-- CreateIndex
CREATE INDEX "login_tentativa_ip_criadoEm_idx" ON "login_tentativa"("ip", "criadoEm");

-- CreateIndex
CREATE UNIQUE INDEX "administradora_codigo_key" ON "administradora"("codigo");

-- CreateIndex
CREATE UNIQUE INDEX "administradora_cnpj_key" ON "administradora"("cnpj");

-- CreateIndex
CREATE UNIQUE INDEX "gerencia_nome_key" ON "gerencia"("nome");

-- CreateIndex
CREATE UNIQUE INDEX "equipe_gerenciaId_nome_key" ON "equipe"("gerenciaId", "nome");

-- CreateIndex
CREATE INDEX "responsavel_unidade_pessoaId_idx" ON "responsavel_unidade"("pessoaId");

-- CreateIndex
CREATE INDEX "pessoa_nomeNormalizado_idx" ON "pessoa"("nomeNormalizado");

-- CreateIndex
CREATE UNIQUE INDEX "vendedor_documento_key" ON "vendedor"("documento");

-- CreateIndex
CREATE INDEX "vendedor_pessoaId_idx" ON "vendedor"("pessoaId");

-- CreateIndex
CREATE INDEX "vendedor_nomeNormalizado_idx" ON "vendedor"("nomeNormalizado");

-- CreateIndex
CREATE UNIQUE INDEX "vendedor_alias_nomeNormalizado_key" ON "vendedor_alias"("nomeNormalizado");

-- CreateIndex
CREATE INDEX "pessoa_vinculo_vendedorId_idx" ON "pessoa_vinculo"("vendedorId");

-- CreateIndex
CREATE UNIQUE INDEX "categoria_vendedor_codigo_key" ON "categoria_vendedor"("codigo");

-- CreateIndex
CREATE INDEX "vendedor_categoria_vendedorId_vigenteDe_idx" ON "vendedor_categoria"("vendedorId", "vigenteDe");

-- CreateIndex
CREATE INDEX "vendedor_alocacao_vendedorId_vigenteDe_idx" ON "vendedor_alocacao"("vendedorId", "vigenteDe");

-- CreateIndex
CREATE INDEX "vendedor_alocacao_equipeId_idx" ON "vendedor_alocacao"("equipeId");

-- CreateIndex
CREATE INDEX "periodo_recuperacao_vendedorId_idx" ON "periodo_recuperacao"("vendedorId");

-- CreateIndex
CREATE UNIQUE INDEX "segmento_codigo_key" ON "segmento"("codigo");

-- CreateIndex
CREATE INDEX "cota_dataVenda_idx" ON "cota"("dataVenda");

-- CreateIndex
CREATE INDEX "cota_snapGerenciaId_idx" ON "cota"("snapGerenciaId");

-- CreateIndex
CREATE INDEX "cota_snapEquipeId_idx" ON "cota"("snapEquipeId");

-- CreateIndex
CREATE INDEX "cota_snapVendedorId_idx" ON "cota"("snapVendedorId");

-- CreateIndex
CREATE INDEX "cota_vendedorId_idx" ON "cota"("vendedorId");

-- CreateIndex
CREATE INDEX "cota_cpfCliente_idx" ON "cota"("cpfCliente");

-- CreateIndex
CREATE INDEX "cota_grupo_cota_idx" ON "cota"("grupo", "cota");

-- CreateIndex
CREATE INDEX "cota_contrato_idx" ON "cota"("contrato");

-- CreateIndex
CREATE INDEX "cota_dataCancelamento_idx" ON "cota"("dataCancelamento");

-- CreateIndex
CREATE UNIQUE INDEX "cota_administradoraId_contrato_grupo_cota_cpfCliente_key" ON "cota"("administradoraId", "contrato", "grupo", "cota", "cpfCliente");

-- CreateIndex
CREATE INDEX "cota_versao_cotaId_criadoEm_idx" ON "cota_versao"("cotaId", "criadoEm");

-- CreateIndex
CREATE INDEX "cota_transferencia_cotaId_idx" ON "cota_transferencia"("cotaId");

-- CreateIndex
CREATE INDEX "divergencia_vendedor_status_idx" ON "divergencia_vendedor"("status");

-- CreateIndex
CREATE INDEX "tabela_comissao_destino_segmentoId_vigenteDe_idx" ON "tabela_comissao"("destino", "segmentoId", "vigenteDe");

-- CreateIndex
CREATE UNIQUE INDEX "faixa_comissao_tabelaId_parcela_key" ON "faixa_comissao"("tabelaId", "parcela");

-- CreateIndex
CREATE INDEX "modalidade_flex_codigo_vigenteDe_idx" ON "modalidade_flex"("codigo", "vigenteDe");

-- CreateIndex
CREATE INDEX "regra_estorno_tipo_vigenteDe_idx" ON "regra_estorno"("tipo", "vigenteDe");

-- CreateIndex
CREATE UNIQUE INDEX "lancamento_administradora_hash_key" ON "lancamento_administradora"("hash");

-- CreateIndex
CREATE INDEX "lancamento_administradora_cotaId_idx" ON "lancamento_administradora"("cotaId");

-- CreateIndex
CREATE INDEX "lancamento_administradora_grupo_cota_idx" ON "lancamento_administradora"("grupo", "cota");

-- CreateIndex
CREATE UNIQUE INDEX "comissao_vendedor_adm_hash_key" ON "comissao_vendedor_adm"("hash");

-- CreateIndex
CREATE INDEX "comissao_vendedor_adm_cotaId_idx" ON "comissao_vendedor_adm"("cotaId");

-- CreateIndex
CREATE UNIQUE INDEX "bonus_incentivo_hash_key" ON "bonus_incentivo"("hash");

-- CreateIndex
CREATE INDEX "bonus_incentivo_cotaId_idx" ON "bonus_incentivo"("cotaId");

-- CreateIndex
CREATE INDEX "bonus_incentivo_gerenciaId_idx" ON "bonus_incentivo"("gerenciaId");

-- CreateIndex
CREATE INDEX "comissao_apurada_cotaId_idx" ON "comissao_apurada"("cotaId");

-- CreateIndex
CREATE INDEX "comissao_apurada_titularPessoaId_status_idx" ON "comissao_apurada"("titularPessoaId", "status");

-- CreateIndex
CREATE INDEX "comissao_apurada_status_liberadaEm_idx" ON "comissao_apurada"("status", "liberadaEm");

-- CreateIndex
CREATE INDEX "comissao_apurada_folhaId_idx" ON "comissao_apurada"("folhaId");

-- CreateIndex
CREATE INDEX "estorno_cotaId_idx" ON "estorno"("cotaId");

-- CreateIndex
CREATE INDEX "estorno_titularPessoaId_status_idx" ON "estorno"("titularPessoaId", "status");

-- CreateIndex
CREATE INDEX "estorno_dataEvento_idx" ON "estorno"("dataEvento");

-- CreateIndex
CREATE INDEX "estorno_movimento_estornoId_idx" ON "estorno_movimento"("estornoId");

-- CreateIndex
CREATE INDEX "folha_comissao_competencia_idx" ON "folha_comissao"("competencia");

-- CreateIndex
CREATE INDEX "pendencia_tipo_resolvidaEm_idx" ON "pendencia"("tipo", "resolvidaEm");

-- CreateIndex
CREATE INDEX "pendencia_cotaId_idx" ON "pendencia"("cotaId");

-- CreateIndex
CREATE INDEX "importacao_hashArquivo_idx" ON "importacao"("hashArquivo");

-- CreateIndex
CREATE INDEX "importacao_enviadoEm_idx" ON "importacao"("enviadoEm");

-- CreateIndex
CREATE INDEX "linha_importacao_importacaoId_status_idx" ON "linha_importacao"("importacaoId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "linha_importacao_importacaoId_numero_key" ON "linha_importacao"("importacaoId", "numero");

-- CreateIndex
CREATE INDEX "importacao_erro_importacaoId_idx" ON "importacao_erro"("importacaoId");

-- CreateIndex
CREATE INDEX "audit_log_criadoEm_idx" ON "audit_log"("criadoEm");

-- CreateIndex
CREATE INDEX "audit_log_entidade_entidadeId_idx" ON "audit_log"("entidade", "entidadeId");

-- CreateIndex
CREATE INDEX "audit_log_usuarioId_criadoEm_idx" ON "audit_log"("usuarioId", "criadoEm");

-- CreateIndex
CREATE INDEX "audit_log_acao_criadoEm_idx" ON "audit_log"("acao", "criadoEm");

-- CreateIndex
CREATE INDEX "notificacao_usuarioId_lidaEm_idx" ON "notificacao"("usuarioId", "lidaEm");

-- CreateIndex
CREATE UNIQUE INDEX "notificacao_usuarioId_chave_key" ON "notificacao"("usuarioId", "chave");

-- CreateIndex
CREATE INDEX "evento_dominio_status_proximaTentativaEm_idx" ON "evento_dominio"("status", "proximaTentativaEm");

-- CreateIndex
CREATE INDEX "evento_dominio_cotaId_idx" ON "evento_dominio"("cotaId");

-- CreateIndex
CREATE INDEX "evento_entrega_eventoId_idx" ON "evento_entrega"("eventoId");

-- CreateIndex
CREATE INDEX "acesso_dado_pessoal_entidade_entidadeId_idx" ON "acesso_dado_pessoal"("entidade", "entidadeId");

-- CreateIndex
CREATE INDEX "acesso_dado_pessoal_usuarioId_criadoEm_idx" ON "acesso_dado_pessoal"("usuarioId", "criadoEm");

-- CreateIndex
CREATE INDEX "solicitacao_titular_documento_idx" ON "solicitacao_titular"("documento");

-- CreateIndex
CREATE UNIQUE INDEX "anexo_storageKey_key" ON "anexo"("storageKey");

-- CreateIndex
CREATE INDEX "anexo_entidade_entidadeId_idx" ON "anexo"("entidade", "entidadeId");

-- AddForeignKey
ALTER TABLE "usuario" ADD CONSTRAINT "usuario_gerenciaId_fkey" FOREIGN KEY ("gerenciaId") REFERENCES "gerencia"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "usuario" ADD CONSTRAINT "usuario_equipeId_fkey" FOREIGN KEY ("equipeId") REFERENCES "equipe"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "equipe" ADD CONSTRAINT "equipe_gerenciaId_fkey" FOREIGN KEY ("gerenciaId") REFERENCES "gerencia"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "responsavel_unidade" ADD CONSTRAINT "responsavel_unidade_gerenciaId_fkey" FOREIGN KEY ("gerenciaId") REFERENCES "gerencia"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "responsavel_unidade" ADD CONSTRAINT "responsavel_unidade_equipeId_fkey" FOREIGN KEY ("equipeId") REFERENCES "equipe"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "responsavel_unidade" ADD CONSTRAINT "responsavel_unidade_pessoaId_fkey" FOREIGN KEY ("pessoaId") REFERENCES "pessoa"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vendedor" ADD CONSTRAINT "vendedor_pessoaId_fkey" FOREIGN KEY ("pessoaId") REFERENCES "pessoa"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vendedor_alias" ADD CONSTRAINT "vendedor_alias_vendedorId_fkey" FOREIGN KEY ("vendedorId") REFERENCES "vendedor"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pessoa_vinculo" ADD CONSTRAINT "pessoa_vinculo_pessoaId_fkey" FOREIGN KEY ("pessoaId") REFERENCES "pessoa"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pessoa_vinculo" ADD CONSTRAINT "pessoa_vinculo_vendedorId_fkey" FOREIGN KEY ("vendedorId") REFERENCES "vendedor"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vendedor_categoria" ADD CONSTRAINT "vendedor_categoria_vendedorId_fkey" FOREIGN KEY ("vendedorId") REFERENCES "vendedor"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vendedor_categoria" ADD CONSTRAINT "vendedor_categoria_categoriaId_fkey" FOREIGN KEY ("categoriaId") REFERENCES "categoria_vendedor"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vendedor_alocacao" ADD CONSTRAINT "vendedor_alocacao_vendedorId_fkey" FOREIGN KEY ("vendedorId") REFERENCES "vendedor"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vendedor_alocacao" ADD CONSTRAINT "vendedor_alocacao_equipeId_fkey" FOREIGN KEY ("equipeId") REFERENCES "equipe"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "periodo_recuperacao" ADD CONSTRAINT "periodo_recuperacao_vendedorId_fkey" FOREIGN KEY ("vendedorId") REFERENCES "vendedor"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cota" ADD CONSTRAINT "cota_administradoraId_fkey" FOREIGN KEY ("administradoraId") REFERENCES "administradora"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cota" ADD CONSTRAINT "cota_vendedorId_fkey" FOREIGN KEY ("vendedorId") REFERENCES "vendedor"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cota" ADD CONSTRAINT "cota_snapVendedorId_fkey" FOREIGN KEY ("snapVendedorId") REFERENCES "vendedor"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cota" ADD CONSTRAINT "cota_snapCategoriaId_fkey" FOREIGN KEY ("snapCategoriaId") REFERENCES "categoria_vendedor"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cota" ADD CONSTRAINT "cota_snapSegmentoId_fkey" FOREIGN KEY ("snapSegmentoId") REFERENCES "segmento"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cota" ADD CONSTRAINT "cota_snapModalidadeFlexId_fkey" FOREIGN KEY ("snapModalidadeFlexId") REFERENCES "modalidade_flex"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cota" ADD CONSTRAINT "cota_snapEquipeId_fkey" FOREIGN KEY ("snapEquipeId") REFERENCES "equipe"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cota" ADD CONSTRAINT "cota_snapGerenciaId_fkey" FOREIGN KEY ("snapGerenciaId") REFERENCES "gerencia"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cota_versao" ADD CONSTRAINT "cota_versao_cotaId_fkey" FOREIGN KEY ("cotaId") REFERENCES "cota"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cota_versao" ADD CONSTRAINT "cota_versao_importacaoId_fkey" FOREIGN KEY ("importacaoId") REFERENCES "importacao"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cota_transferencia" ADD CONSTRAINT "cota_transferencia_cotaId_fkey" FOREIGN KEY ("cotaId") REFERENCES "cota"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "divergencia_vendedor" ADD CONSTRAINT "divergencia_vendedor_cotaId_fkey" FOREIGN KEY ("cotaId") REFERENCES "cota"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tabela_comissao" ADD CONSTRAINT "tabela_comissao_segmentoId_fkey" FOREIGN KEY ("segmentoId") REFERENCES "segmento"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tabela_comissao" ADD CONSTRAINT "tabela_comissao_categoriaId_fkey" FOREIGN KEY ("categoriaId") REFERENCES "categoria_vendedor"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tabela_comissao" ADD CONSTRAINT "tabela_comissao_titularVendedorId_fkey" FOREIGN KEY ("titularVendedorId") REFERENCES "vendedor"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "faixa_comissao" ADD CONSTRAINT "faixa_comissao_tabelaId_fkey" FOREIGN KEY ("tabelaId") REFERENCES "tabela_comissao"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "regra_estorno" ADD CONSTRAINT "regra_estorno_titularVendedorId_fkey" FOREIGN KEY ("titularVendedorId") REFERENCES "vendedor"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "meta_promocao" ADD CONSTRAINT "meta_promocao_categoriaOrigemId_fkey" FOREIGN KEY ("categoriaOrigemId") REFERENCES "categoria_vendedor"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "meta_promocao" ADD CONSTRAINT "meta_promocao_categoriaAlvoId_fkey" FOREIGN KEY ("categoriaAlvoId") REFERENCES "categoria_vendedor"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lancamento_administradora" ADD CONSTRAINT "lancamento_administradora_importacaoId_fkey" FOREIGN KEY ("importacaoId") REFERENCES "importacao"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lancamento_administradora" ADD CONSTRAINT "lancamento_administradora_cotaId_fkey" FOREIGN KEY ("cotaId") REFERENCES "cota"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "comissao_vendedor_adm" ADD CONSTRAINT "comissao_vendedor_adm_importacaoId_fkey" FOREIGN KEY ("importacaoId") REFERENCES "importacao"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "comissao_vendedor_adm" ADD CONSTRAINT "comissao_vendedor_adm_cotaId_fkey" FOREIGN KEY ("cotaId") REFERENCES "cota"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bonus_incentivo" ADD CONSTRAINT "bonus_incentivo_importacaoId_fkey" FOREIGN KEY ("importacaoId") REFERENCES "importacao"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bonus_incentivo" ADD CONSTRAINT "bonus_incentivo_cotaId_fkey" FOREIGN KEY ("cotaId") REFERENCES "cota"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bonus_incentivo" ADD CONSTRAINT "bonus_incentivo_equipeId_fkey" FOREIGN KEY ("equipeId") REFERENCES "equipe"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bonus_incentivo" ADD CONSTRAINT "bonus_incentivo_gerenciaId_fkey" FOREIGN KEY ("gerenciaId") REFERENCES "gerencia"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "comissao_apurada" ADD CONSTRAINT "comissao_apurada_cotaId_fkey" FOREIGN KEY ("cotaId") REFERENCES "cota"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "comissao_apurada" ADD CONSTRAINT "comissao_apurada_ajusteDeId_fkey" FOREIGN KEY ("ajusteDeId") REFERENCES "comissao_apurada"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "comissao_apurada" ADD CONSTRAINT "comissao_apurada_titularVendedorId_fkey" FOREIGN KEY ("titularVendedorId") REFERENCES "vendedor"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "comissao_apurada" ADD CONSTRAINT "comissao_apurada_titularPessoaId_fkey" FOREIGN KEY ("titularPessoaId") REFERENCES "pessoa"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "comissao_apurada" ADD CONSTRAINT "comissao_apurada_tabelaId_fkey" FOREIGN KEY ("tabelaId") REFERENCES "tabela_comissao"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "comissao_apurada" ADD CONSTRAINT "comissao_apurada_folhaId_fkey" FOREIGN KEY ("folhaId") REFERENCES "folha_comissao"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "estorno" ADD CONSTRAINT "estorno_cotaId_fkey" FOREIGN KEY ("cotaId") REFERENCES "cota"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "estorno" ADD CONSTRAINT "estorno_titularVendedorId_fkey" FOREIGN KEY ("titularVendedorId") REFERENCES "vendedor"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "estorno" ADD CONSTRAINT "estorno_titularPessoaId_fkey" FOREIGN KEY ("titularPessoaId") REFERENCES "pessoa"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "estorno" ADD CONSTRAINT "estorno_configuracaoId_fkey" FOREIGN KEY ("configuracaoId") REFERENCES "configuracao_estorno"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "estorno" ADD CONSTRAINT "estorno_regraId_fkey" FOREIGN KEY ("regraId") REFERENCES "regra_estorno"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "estorno_movimento" ADD CONSTRAINT "estorno_movimento_estornoId_fkey" FOREIGN KEY ("estornoId") REFERENCES "estorno"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pendencia" ADD CONSTRAINT "pendencia_cotaId_fkey" FOREIGN KEY ("cotaId") REFERENCES "cota"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "importacao" ADD CONSTRAINT "importacao_administradoraId_fkey" FOREIGN KEY ("administradoraId") REFERENCES "administradora"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "linha_importacao" ADD CONSTRAINT "linha_importacao_importacaoId_fkey" FOREIGN KEY ("importacaoId") REFERENCES "importacao"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "importacao_erro" ADD CONSTRAINT "importacao_erro_importacaoId_fkey" FOREIGN KEY ("importacaoId") REFERENCES "importacao"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_log" ADD CONSTRAINT "audit_log_usuarioId_fkey" FOREIGN KEY ("usuarioId") REFERENCES "usuario"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notificacao" ADD CONSTRAINT "notificacao_usuarioId_fkey" FOREIGN KEY ("usuarioId") REFERENCES "usuario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "evento_dominio" ADD CONSTRAINT "evento_dominio_cotaId_fkey" FOREIGN KEY ("cotaId") REFERENCES "cota"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "evento_entrega" ADD CONSTRAINT "evento_entrega_eventoId_fkey" FOREIGN KEY ("eventoId") REFERENCES "evento_dominio"("id") ON DELETE CASCADE ON UPDATE CASCADE;
