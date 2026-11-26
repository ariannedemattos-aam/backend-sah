# Integração da API

Base: `http://localhost:3000/api/v1`. Todas as respostas JSON usam `success`, `message` e `data`. Configure `CORS_ORIGINS` com a origem do front-end.

## Pesquisa pública

Crie a pesquisa com `POST /public/surveys`; guarde `id` e `surveyToken` apenas durante o preenchimento. Em todas as requisições seguintes envie `X-Survey-Token: <surveyToken>`.

```js
const created = await fetch(`${API}/public/surveys`, { method: 'POST' }).then(r => r.json());
const headers = { 'Content-Type': 'application/json', 'X-Survey-Token': created.data.surveyToken };
await fetch(`${API}/public/surveys/${created.data.id}/attendances`, { method: 'POST', headers, body: JSON.stringify({ sectorId, serviceId, shiftId }) });
await fetch(`${API}/public/surveys/${created.data.id}/start`, { method: 'POST', headers });
const question = await fetch(`${API}/public/surveys/${created.data.id}/next-question`, { headers }).then(r => r.json());
await fetch(`${API}/public/surveys/${created.data.id}/answers/${question.data.id}`, { method: 'PUT', headers, body: JSON.stringify({ value: 5 }) });
await fetch(`${API}/public/surveys/${created.data.id}/complete`, { method: 'POST', headers });
```

Use `GET /public/sectors`, `/public/sectors/:id/services`, `/public/services/:id/stages` e `/public/shifts` para preencher as opções. A API preserva o texto da pergunta no início da pesquisa.

## Administração

`POST /auth/login` recebe `{ email, password }`. Use `Authorization: Bearer <accessToken>`; quando expirar, envie o `refreshToken` a `/auth/refresh`. As permissões são verificadas pelo servidor. Dashboards emitem `dashboard:update` via Socket.IO na finalização de uma pesquisa. Arquivos e dados sensíveis devem ser tratados somente por conexões HTTPS em produção.
