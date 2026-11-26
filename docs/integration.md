# Integração da API Ouvidoria FHDOD

- Swagger da demonstração no Render: [API FHDOD](https://fhdod-ouvidoria-demo.onrender.com/api-docs/) e [OpenAPI em JSON](https://fhdod-ouvidoria-demo.onrender.com/api-docs.json).
- Ambiente local: inicie o back-end com `npm start` e abra [Swagger local](http://localhost:3000/api-docs/). Se a porta for diferente, abra o Swagger nessa porta e selecione **Servidor que hospeda este Swagger**.
- Use o Swagger do próprio ambiente para executar chamadas no mesmo domínio. A API publicada permite o CORS do front-end da demonstração. Os arquivos do Swagger são servidos quando `SWAGGER_ENABLED` está habilitado.
- O inventário cobre 67 operações de negócio e saúde. Os arquivos e ativos do Swagger, o preflight automático CORS e o transporte Socket.IO são infraestrutura.

## Testes no Swagger

### Administrador e setor

1. Em **Autenticação e autorização**, execute `POST /api/v1/auth/login` com os dados fictícios da sua conta de demonstração. Obtenha as credenciais com o responsável.
2. Clique em **Authorize** e cole somente `data.accessToken` em `bearerAuth`. Execute `GET /api/v1/auth/me` para conferir papel e permissões.
3. A conta administrativa do seed tem `dashboard.read` e pode executar `GET /api/v1/admin/dashboard/overview`. A conta de setor do seed recebe `questions.read` e `questions.propose`. Para ela, o resumo administrativo retorna 403.
4. Para renovar, envie `data.refreshToken` no corpo de `POST /api/v1/auth/refresh` e substitua o access token no **Authorize**. Para encerrar, envie o refresh token atual a `POST /api/v1/auth/logout` e limpe o **Authorize**.

### Pesquisa pública

1. Liste setores, serviços e turnos no catálogo público. Use IDs da resposta da API. Os UUIDs da documentação são fictícios.
2. Execute `POST /api/v1/public/surveys` e guarde `data.id`. Em **Authorize**, cole `data.surveyToken` no esquema `surveyToken`.
3. Adicione um atendimento em `POST /api/v1/public/surveys/{id}/attendances` com os três IDs. Execute `POST /api/v1/public/surveys/{id}/start`.
4. Consulte `GET /api/v1/public/surveys/{id}/questions` e envie uma resposta para cada pergunta obrigatória em `PUT /api/v1/public/surveys/{id}/answers/{surveyQuestionId}`. Para a nota de demonstração, use `{"value":5}`.
5. Se necessário, teste feedback e pedido de retorno com dados fictícios, como `retorno@example.invalid`. A API apenas registra o pedido de retorno.
6. Finalize em `POST /api/v1/public/surveys/{id}/complete`, por exemplo com `{"overallRating":9}`. Consulte o estado da pesquisa para confirmar `completed`.

## Mapeamento do front-end

Os caminhos abaixo são relativos a `/api/v1`. O OpenAPI cobre as chamadas utilizadas na interface, incluindo estas integrações acrescentadas na revisão final.

| Fluxo | Operações HTTP |
| --- | --- |
| Sessão | `POST /auth/login`, `POST /auth/logout`, `GET /auth/me` (disponível no cliente) |
| Catálogo público | `GET /public/sectors`, `GET /public/sectors/{id}/services`, `GET /public/shifts` |
| Pesquisa | `POST /public/surveys`, `POST /public/surveys/{id}/attendances`, `POST /public/surveys/{id}/start` |
| Questionário e envio | `GET /public/surveys/{id}/questions`, `PUT /public/surveys/{id}/answers/{surveyQuestionId}`, `PUT /public/surveys/{id}/feedback`, `PUT /public/surveys/{id}/return-request`, `POST /public/surveys/{id}/complete` |
| Dashboard | `GET /admin/dashboard/overview` e os cinco GETs de dimensão em `/admin/dashboard/` |
| Cadastros | Listagens das oito coleções em `/admin`; criação, edição e alteração de status para setores, serviços, etapas, equipes e turnos |
| Propostas e revisão | `GET /questions`, `GET /questions/services`, `POST /questions`, `GET /questions/{id}`, `PUT /questions/{id}`, `PATCH /questions/{id}/status`, `POST /questions/{id}/approve`, `POST /questions/{id}/reject` |
| Painel público | `GET /tvwall/overview`, `GET /tvwall/sectors` |

## Eventos Socket.IO

- Servidores: `https://fhdod-ouvidoria-demo.onrender.com` e `http://localhost:3000`. Caminho padrão do Socket.IO: `/socket.io/`. O front-end configura o endereço em `VITE_SOCKET_URL`.
- Autenticação: envie o JWT de acesso no campo `auth.token` do handshake Socket.IO. O servidor verifica validade, origem permitida e permissão `dashboard.read`. A sessão é desconectada ao expirar. A TV consulta apenas as rotas REST públicas de agregados.
- Evento de aplicação `dashboard:update`, do servidor para o cliente. É emitido ao concluir a pesquisa pela primeira vez enquanto ela permanecer concluída. O front-end invalida a consulta do dashboard e busca os indicadores via REST.
- Formato: `surveyId` é o UUID da pesquisa; `type` é a string literal `survey_completed`. Não há eventos de aplicação enviados pelo cliente. Eventos como `connect` pertencem à biblioteca.

```json
{
  "surveyId": "671ec25c-4015-4bce-a706-000000000006",
  "type": "survey_completed"
}
```

## Regras e funcionalidades pendentes

- A administração lista oito catálogos com busca por nome e paginação. Usuários, papéis e permissões ficam disponíveis para consulta. Os cinco catálogos editáveis devolvem o UUID real e aceitam arquivamento e reativação. O status inativo preserva os vínculos do histórico. O setor de um serviço vinculado a atendimentos, equipes ou perguntas não pode ser trocado.
- Perguntas de setor são limitadas aos serviços dos setores atribuídos. O setor edita suas próprias propostas pendentes ou rejeitadas. A edição de uma rejeitada a devolve à revisão. A administração pode editar uma pergunta ativa e publicar sua nova versão. A versão anterior continua nos questionários iniciados. Para recuperar uma pergunta arquivada, reabra a revisão e aprove novamente.
- Aprovação e rejeição exigem permissões distintas e gravam a justificativa. Somente perguntas ativas entram em novos questionários, conforme os serviços e setores associados.
- Perguntas aceitam nota de 1 a 5, texto livre ou valores das opções cadastradas. Múltipla escolha usa `optionValues`. Após conclusão, as edições ficam bloqueadas e a conclusão é idempotente.
- O resumo do dashboard é global e usa notas individuais de 1 a 5. A nota geral de encerramento usa outra escala. O painel público usa somente pesquisas concluídas e aplica o mínimo de respostas configurado.
- Exportações, convites, envio de notificações e telas administrativas de avaliações, feedback e retornos seguem sem integração. O registro público de pedidos de retorno funciona via API. O front-end não usa `POST /auth/refresh`; o logout revoga o refresh token e o JWT de acesso vence no prazo original.
