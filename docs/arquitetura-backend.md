# Arquitetura do backend

O FHOOD recebe avaliações anônimas da Fundação Hospitalar Dr. Oswaldo Diesel e oferece operações internas sob permissões verificadas no servidor. A demonstração usa um único hospital e dados fictícios.

## Execução e responsabilidades

| Camada efetiva | Arquivo | Responsabilidade |
| --- | --- | --- |
| Processo HTTP e sockets | `server.js` | Sobe Express e Socket.IO na porta do ambiente. Autoriza e encerra conexões privadas a partir da sessão. |
| Composição HTTP | `app.js`, `routes/index.js` | Helmet, CORS, limites HTTP, JSON, roteamento em `/api/v1`, saúde e Swagger. |
| Rotas e validação | `routes/*Route.js`, `middlewares/`, Zod | Aplica a permissão e delega ao controlador. O contexto da pesquisa pública usa credencial própria. |
| Fluxos de negócio | `controllers/` | Catálogos, snapshots, finalização e fila da Ouvidoria, escala, sessões, avaliações e relatórios. |
| Serviços | `services/` | JWT e refresh, escopo das consultas, regras da jornada, notificações, comunicação e arquivos Excel/PDF. |
| Persistência | `config/database.js`, `utils/withTransaction.js` | Pool mysql2 com SQL parametrizado, TLS no Aiven e transações quando há mudanças correlatas. |
| Contrato HTTP | `swagger/swagger.js`, `swagger/schemas.js` | OpenAPI 3 e schemas reutilizados. `/api-docs.json` é o contrato publicado. |
| Evolução do banco | `database/`, `scripts/migrate.js`, `scripts/seed.js` | SQL base, migrations aditivas, validação de integridade e população fictícia separada. |

A composição montada é a fonte de verdade. Há módulos históricos em `models/`, `middleware/` e subpastas antigas de rotas e controladores. A arquitetura atual usa consultas SQL nos controladores e serviços montados no Express.

## Fluxo de uma avaliação

1. O navegador seleciona setor, serviço, turno e etapas realizadas. A data do atendimento é opcional.
2. A criação devolve UUID e token aleatório. O servidor armazena o hash. Um convite de uso único é resgatado transacionalmente e sua associação com a pesquisa não é persistida.
3. O início registra enunciados, opções versionadas e contexto das regras. A API avalia a visibilidade após cada resposta e exclui respostas ocultas da análise.
4. A nota geral inteira de 0–10 é a única resposta obrigatória. Conclusão e triagem são transacionais e idempotentes. Se houver nota 0–6, reclamação ou retorno, a fila registra uma manifestação.
5. O Socket.IO transmite o tipo de atualização. O dashboard refaz consultas agregadas. Notificações usam namespace privado, e a TV faz consultas REST agregadas.

## Fluxo autenticado

O login web usa proxy de mesma origem na Vercel. O refresh fica em cookie HttpOnly, Secure em produção e SameSite Strict. A API verifica JWT, sessão persistida e permissões atuais. O access token fica na memória do navegador. A Ouvidoria consulta contato apenas em uma operação protegida com registro em `audit_logs`.

## Implantação e escala futura

A Vercel serve React/Vite, o Render executa a API e o Aiven guarda o MySQL. A API é a única camada que acessa o banco. A dimensão de escala cruza setor, turno e data do atendimento com `roster_shifts`; o resumo usa data UTC de conclusão e respostas 1–5. Uma implantação independente para outro hospital exige banco, domínios, chaves, cookies, canais, armazenamento operacional e controles de acesso segregados. Uma base compartilhada exigiria um identificador de instituição em chaves, vínculos, todas as consultas e testes de isolamento.

- [Diagramas](diagramas/)
- [Contrato e uso seguro do Swagger](integration.md)
- [Modelo e dicionário](modelo-de-dados-e-requisitos.md)
- [Segurança e nuvem](seguranca-e-nuvem.md)
