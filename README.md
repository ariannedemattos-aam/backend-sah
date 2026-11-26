# FHDOD Ouvidoria API

Backend REST em Node.js/Express para pesquisas anônimas de satisfação hospitalar, com RBAC, perguntas versionadas, múltiplos atendimentos e indicadores.

## Execução

```powershell
Copy-Item .env.example .env
npm install
npm run migrate
$env:ADMIN_EMAIL="admin@fhdod.local"; $env:ADMIN_PASSWORD="uma-senha-segura"; npm run seed
npm run dev
```

No Windows, altere o arquivo `.env` diretamente para configurar MySQL e segredos JWT. O MySQL pode ser iniciado com `docker compose up -d`; a API continua podendo usar uma instalação local.

Swagger: `http://localhost:3000/api-docs`. Documentação de integração: [docs/integration.md](docs/integration.md). JSDoc: `npm run docs`. Testes: `npm test`.

Em produção use HTTPS, segredos aleatórios, banco com acesso restrito, backups e políticas de retenção. A implementação técnica auxilia a privacidade, mas a conformidade LGPD exige também processos organizacionais e jurídicos.
