# Bocchi Frota — Portal

Portal da Logística Bocchi Agrobios. O mesmo frontend apresenta a área do motorista e os módulos administrativos conforme o acesso retornado pela API.

## Onde mexer

| Arquivo | Responsabilidade |
| --- | --- |
| [index.html](index.html) | Página de entrada, estilos e carregamento do JavaScript |
| [app.js](app.js) | Configuração do portal, sessão, cliente da API, navegação e telas |
| [js/modulos/painel.js](js/modulos/painel.js) | Painel administrativo, Visão Geral, filtros e detalhamento de Cargas. |
| [js/modulos/checklist.js](js/modulos/checklist.js) | Checklist do motorista, detalhe e telas administrativas de aprovação, perguntas e relatório. |
| [js/modulos/agendamentos.js](js/modulos/agendamentos.js) | Agenda do motorista e da gestão, reservas, retirada, devolução e parâmetros. |
| [js/modulos/sinistros.js](js/modulos/sinistros.js) | Registro e consulta de sinistros no app, gestão e configurações administrativas. |
| [js/modulos/contestacoes.js](js/modulos/contestacoes.js) | Consulta e análise administrativa de contestações de carga e PBT. O motorista abre a contestação pela tela de Cargas. |
| [js/modulos/premiacao.js](js/modulos/premiacao.js) | Premiação do motorista, régua, metas, descontos e auditoria interna. |
| [js/modulos/fechamento-rh.js](js/modulos/fechamento-rh.js) | Fechamento do RH, fila de apuração e reabertura do quadrimestre. |
| [js/modulos/importacao.js](js/modulos/importacao.js) | Importação de cargas, filtros e resumo do processamento. |
| [js/modulos/cargas-motorista.js](js/modulos/cargas-motorista.js) | Consulta de cargas próprias por competência e envio de contestações pelo motorista. |
| [js/modulos/indicadores.js](js/modulos/indicadores.js) | Faturamento por placa/mês, motorista na data da carga, ano de fabricação e detalhe paginado. Despesas, Km e Resultado aguardam as respectivas bases. |
| [js/modulos/cadastros.js](js/modulos/cadastros.js) | Cadastro de usuários, frota, regras de capacidade e perfis de acesso. |
| [js/core/cache-leituras.js](js/core/cache-leituras.js) | Implementação do cache de sessão, carregada antes de `app.js` e usada nos testes da API. |

A API é mantida em [bocchi-frota-api](https://github.com/bocchi-logistica/bocchi-frota-api/tree/migracao/cloudflare-d1-r2). Veja o [mapa de rotas e acessos](https://github.com/bocchi-logistica/bocchi-frota-api/blob/migracao/cloudflare-d1-r2/docs/ROTAS_E_ACESSOS.md).

## Testar uma alteração

1. Para executar a versão entregue em homologação, abra `/portal` no Worker de homologação. O Worker serve o commit do frontend fixado na API.
2. Para testar arquivos alterados localmente, sirva a raiz deste repositório em um servidor HTTP local. Aponte `CONFIG.API_URL` para o Worker local e configure a origem do portal em `ALLOWED_ORIGINS` no ambiente local. Essas alterações são específicas do ambiente de desenvolvimento.
3. Use contas de teste com perfis distintos. Confira o login, a navegação e a resposta da API com e sem a permissão do módulo. Esconder um botão ou uma tela faz parte da interface; a autorização precisa ser verificada no servidor.

## Publicação em homologação

Registre a versão do frontend e o commit correspondente. A entrega só está confirmada quando o Worker da homologação aponta para esse commit e o portal exibe a versão esperada. Veja o [guia de entrega da API](https://github.com/bocchi-logistica/bocchi-frota-api/blob/migracao/cloudflare-d1-r2/README.md).

