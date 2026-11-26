# Integração da API FHOOD

[Swagger interativo publicado](https://fhdod-ouvidoria-demo.onrender.com/api-docs/) · [OpenAPI JSON](https://fhdod-ouvidoria-demo.onrender.com/api-docs.json) · [Swagger local](http://localhost:3000/api-docs/)

O OpenAPI documenta **100 operações de negócio e saúde**. A suíte compara métodos e caminhos normalizados com a árvore Express montada. Swagger UI, preflight CORS e transporte Socket.IO são infraestrutura. As URLs de teste são selecionáveis na interface.

## Uso por professores

1. Para teste sem conta, execute `GET /health`, `GET /api/v1/public/sectors`, `GET /api/v1/public/shifts` ou as rotas do TV Wall.
2. Solicite à equipe acesso fictício com o papel adequado para a avaliação. Execute `POST /api/v1/auth/login` sem capturar a senha ou a resposta completa.
3. Cole somente `data.accessToken` em **Authorize → bearerAuth**. `GET /api/v1/auth/me` confere papel e permissões. Limpe a autorização ao encerrar. Para revogar a sessão, envie o refresh vigente à rota `POST /api/v1/auth/logout`.
4. O fluxo público usa `POST /api/v1/public/surveys` e um token próprio no cabeçalho `X-Survey-Token`. Cadastre atendimento com IDs do catálogo, selecione `stageIds` e inicie. Responda perguntas opcionais se desejar. Conclua com `{"overallRating":8}`. Use apenas dados fictícios.
5. Para examinar a Ouvidoria, use um perfil autorizado e dados fictícios. Contatos são consultados sob demanda e auditados. Os exemplos do contrato são ilustrativos.

## Integrações e eventos

- A aplicação web usa `/auth/web/login`, `refresh` e `logout` via proxy de mesma origem. O fluxo JSON acima serve a clientes de API.
- `/admin/dashboard/options` carrega catálogos sem informações pessoais. Indicadores filtram período, setor, turno, serviço e equipe da escala. O resumo considera conclusão UTC; a dimensão da escala, data informada de atendimento.
- Excel e PDF chegam por `/admin/reports/excel` e `/admin/reports/pdf`. A rota pública da TV recebe somente agregados.
- Socket.IO recebe JWT em `auth.token`. No namespace padrão, `dashboard:update` envia apenas `{ "type": "survey_completed" }` ou `{ "type": "roster_saved" }`. Em `/notifications`, `notifications:update` sinaliza exclusivamente ao destinatário que recarregue sua lista.
- O status HTTP 401 indica credencial ausente, inválida ou vencida. O 403 indica privilégio insuficiente. O 422 indica dados inválidos. O 409 informa conflitos de estado ou duplicidades documentadas. Um UUID fora do escopo pode retornar 404.
