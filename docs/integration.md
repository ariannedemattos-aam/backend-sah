# Integração da API Ouvidoria FHDOD

- Swagger da demonstração no Render: [API FHDOD](https://fhdod-ouvidoria-demo.onrender.com/api-docs/) e [OpenAPI em JSON](https://fhdod-ouvidoria-demo.onrender.com/api-docs.json).
- Ambiente local: inicie o back-end com `npm start` e abra [Swagger local](http://localhost:3000/api-docs/). Se a porta for diferente, abra o Swagger nessa porta e selecione **Servidor que hospeda este Swagger**.
- Use o Swagger do próprio ambiente para executar chamadas no mesmo domínio. A API publicada permite o CORS do front-end da demonstração. Os arquivos do Swagger são servidos quando `SWAGGER_ENABLED` está habilitado.
- O inventário cobre 44 operações de negócio e saúde. Os arquivos e ativos do Swagger, o preflight automático CORS e o transporte Socket.IO são infraestrutura.

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

Os caminhos da tabela são relativos a `/api/v1`. Todas as 15 operações declaradas nos serviços do front-end têm rota no back-end e no OpenAPI. A interface chama 14 delas. O método `authService.me()` está disponível no cliente e não tem chamador na interface atual.

| Fluxo | Operações HTTP |
| --- | --- |
| Sessão | `POST /auth/login`, `POST /auth/logout`, `GET /auth/me` (método disponível) |
| Catálogo público | `GET /public/sectors`, `GET /public/sectors/{id}/services`, `GET /public/shifts` |
| Pesquisa | `POST /public/surveys`, `POST /public/surveys/{id}/attendances`, `POST /public/surveys/{id}/start` |
| Questionário e envio | `GET /public/surveys/{id}/questions`, `PUT /public/surveys/{id}/answers/{surveyQuestionId}`, `PUT /public/surveys/{id}/feedback`, `PUT /public/surveys/{id}/return-request`, `POST /public/surveys/{id}/complete` |
| Dashboard | `GET /admin/dashboard/overview` |

## Eventos Socket.IO

- Servidores: `https://fhdod-ouvidoria-demo.onrender.com` e `http://localhost:3000`. Caminho padrão do Socket.IO: `/socket.io/`. O front-end configura o endereço em `VITE_SOCKET_URL`.
- Autenticação atual: o handshake não verifica JWT nem token de pesquisa. O servidor coloca toda conexão aceita na sala `dashboards`. O CORS do Socket.IO usa a mesma lista de origens da API e não substitui autenticação. O GET autenticado do dashboard continua exigindo `dashboard.read`.
- Evento de aplicação `dashboard:update`, do servidor para o cliente. É emitido ao concluir a pesquisa pela primeira vez enquanto ela permanecer concluída. O front-end invalida a consulta do dashboard e busca os indicadores via REST.
- Formato: `surveyId` é o UUID da pesquisa; `type` é a string literal `survey_completed`. Não há eventos de aplicação enviados pelo cliente. Eventos como `connect` pertencem à biblioteca.

```json
{
  "surveyId": "671ec25c-4015-4bce-a706-000000000006",
  "type": "survey_completed"
}
```

## Inconsistências e funcionalidades sem rota

- Os cinco indicadores do dashboard por dimensão retornam 404 para sessões com permissão. O caminho fixo não injeta `req.params.dimension`.
- As oito listagens administrativas retornam 404 e os oito POSTs de criação retornam 400 para sessões com permissão. Os caminhos fixos não injetam `req.params.resource`. Uma correção futura deve usar projeções explícitas na listagem de usuários, pois o código atual contém `SELECT *` e a tabela inclui hashes de senha. O ID do INSERT de catálogo também é gerado pelo MySQL com UUID, enquanto o retorno usa `insertId`.
- Cadastro e aprovação de perguntas, exportações, convites e disparo de notificações não têm endpoints montados. As páginas administrativas correspondentes, a lista de propostas do setor e o Painel de TV do front-end não consomem endpoints para essas telas. O back-end oferece dois GETs independentes para o Painel de TV.
- Perguntas de pesquisa têm opções e um tipo, mas a API recebe uma nota numérica ou texto, sem validação por tipo. O cliente trata strings como texto e pode enviar um array em `value` para múltipla escolha, que o esquema de persistência não suporta.
- O resumo do dashboard é global, sem filtros de período. Usa as notas individuais e não a nota geral de encerramento.
- O front-end não usa `POST /auth/refresh`. O botão de logout revoga o refresh token; o JWT de acesso continua válido até a expiração.
- O Socket.IO ainda não autentica os assinantes da sala do dashboard. O evento expõe o identificador da pesquisa às conexões aceitas. Use somente dados fictícios neste ambiente.
