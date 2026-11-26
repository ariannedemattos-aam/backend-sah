# Requisitos e rastreabilidade

O escopo corresponde ao briefing e às instruções da entrega acadêmica. Os requisitos derivados de inspeção aparecem como tal. O projeto não apresenta aprovação hospitalar formal, teste com pacientes reais ou certificação. Os atributos pertinentes são organizados com referência ao [modelo ISO/IEC 25010:2023](https://www.iso.org/standard/78176.html).

Os endpoints da API abaixo são relativos a `/api/v1`, exceto infraestrutura como `/health` e `/api-docs.json`. Os IDs de testes são detalhados no [relatório](plano-e-relatorio-de-testes.md). Os nomes de arquivos identificam evidências no índice do pacote quando disponíveis. Consulte o índice e a coluna de situação antes de citar uma imagem.

## RF-01 — Pesquisa por QR setorial

- **Origem e prioridade** — Briefing. Alta.
- **Justificativa** — Reduzir atrito no primeiro acesso.
- **Aceitação** — Código reutilizável abre setor ativo e mantém pesquisa independente.
- **Rastreabilidade** — Acesso setorial / Cadastros · `GET /public/sectors/{id}/services` · `App.jsx, AdminCatalog.jsx` · sectors, services.
- **Verificação** — TF-01. Evidência prevista ou registrada em `paciente/02-acesso-setorial.png`.
- **Situação** — Implementado.

## RF-02 — Convite individual

- **Origem e prioridade** — Briefing. Alta.
- **Justificativa** — Controlar distribuição privada.
- **Aceitação** — Resgate inicial aceito, segundo resgate independente bloqueado e validade aplicada.
- **Rastreabilidade** — Convites · `POST /public/invitations/redeem` · `InvitationController.js` · invitations.
- **Verificação** — TF-02. Evidência prevista ou registrada em `gestao/16-convites.png`.
- **Situação** — Implementado.

## RF-03 — Nota geral e conclusão

- **Origem e prioridade** — Briefing. Alta.
- **Justificativa** — Captar a satisfação geral mesmo com perguntas omitidas.
- **Aceitação** — Ausência e faixa inválida rejeitadas, 0 a 10 aceitos, confirmação apresentada.
- **Rastreabilidade** — Avaliação geral / Obrigado · `POST /public/surveys/{id}/complete` · `App.jsx, PublicSurveyController.js` · surveys.
- **Verificação** — TF-03. Evidência prevista ou registrada em `paciente/09-confirmacao.png`.
- **Situação** — Implementado.

## RF-04 — Jornada e versões

- **Origem e prioridade** — Briefing. Alta.
- **Justificativa** — Evitar perguntas de etapas não realizadas.
- **Aceitação** — Etapas selecionadas e resposta anterior controlam visibilidade; versão iniciada permanece.
- **Rastreabilidade** — Atendimento / Perguntas · `POST /public/surveys/{id}/start; GET /public/surveys/{id}/questions` · `QuestionJourney.js, QuestionController.js` · survey_questions, question_version_rules.
- **Verificação** — TF-04. Evidência prevista ou registrada em `paciente/03-etapas.png`.
- **Situação** — Implementado.

## RF-05 — Elogio, reclamação, sugestão e anonimato

- **Origem e prioridade** — Briefing. Alta.
- **Justificativa** — Permitir expressão livre sem identificação obrigatória.
- **Aceitação** — Campos opcionais; nenhuma solicitação de retorno criada sem escolha.
- **Rastreabilidade** — Feedback público · `PUT /public/surveys/{id}/feedback` · `PublicSurveyController.js, App.jsx` · feedback.
- **Verificação** — TF-05. Evidência prevista ou registrada em `paciente/05-elogio.png`.
- **Situação** — Implementado.

## RF-06 — Retorno voluntário e protegido

- **Origem e prioridade** — Briefing. Alta.
- **Justificativa** — Permitir contato solicitado explicitamente.
- **Aceitação** — Contato requerido quando marcado; revelação sob permissão e auditoria.
- **Rastreabilidade** — Retorno / Ouvidoria · `PUT /public/surveys/{id}/return-request; GET /admin/return-requests/{id}/contact` · `EvaluationController.js` · return_requests, audit_logs.
- **Verificação** — TF-05/TF-08. Evidência prevista ou registrada em `paciente/08-retorno.png`.
- **Situação** — Implementado.

## RF-07 — Desistência

- **Origem e prioridade** — Briefing. Alta.
- **Justificativa** — Dar controle ao paciente.
- **Aceitação** — Saída por teclado e toque; permanecer ou sair após diálogo; limpeza local confirmada.
- **Rastreabilidade** — Pesquisa · `Navegação local` · `App.jsx, SurveyContext.jsx` · surveys (rascunho já criado).
- **Verificação** — AC-01. Evidência prevista ou registrada em `mobile/saida.png`.
- **Situação** — Implementado.

## RF-08 — Dashboard filtrável

- **Origem e prioridade** — Briefing. Alta.
- **Justificativa** — Consolidar indicadores sem revelar pessoas.
- **Aceitação** — Período, setor, turno, serviço e equipe alteram seleção; dimensões documentam base da data.
- **Rastreabilidade** — Indicadores · `GET /admin/dashboard/overview; GET /admin/dashboard/options` · `AdminPanels.jsx, EvaluationData.js` · surveys, survey_attendances, roster_shifts.
- **Verificação** — TF-06. Evidência prevista ou registrada em `gestao/03-dashboard-filtros.png`.
- **Situação** — Implementado.

## RF-09 — Escala e cruzamento

- **Origem e prioridade** — Briefing. Alta.
- **Justificativa** — Contextualizar avaliações sem inferência individual.
- **Aceitação** — Chave setor/data/turno, equipe no mesmo setor e média a partir de três pesquisas únicas.
- **Rastreabilidade** — Escala mensal / Dashboard · `GET /admin/roster; PUT /admin/roster/shifts; GET /admin/dashboard/roster-teams` · `RosterController.js` · roster_shifts, roster_shift_staff.
- **Verificação** — TF-07. Evidência prevista ou registrada em `gestao/07-escala.png`.
- **Situação** — Implementado.

## RF-10 — Cadastros e aprovação

- **Origem e prioridade** — Briefing. Alta.
- **Justificativa** — Governar catálogo e questionários do hospital.
- **Aceitação** — CRUD suportado com arquivamento e aprovação/rejeição com justificativa.
- **Rastreabilidade** — Cadastros / Perguntas · `/admin/{catálogo}; POST /questions/{id}/approve` · `AdminController.js, QuestionController.js` · sectors, services, question_approvals.
- **Verificação** — TF-04. Evidência prevista ou registrada em `gestao/14-perguntas.png`.
- **Situação** — Implementado.

## RF-11 — Fila e histórico da Ouvidoria

- **Origem e prioridade** — Briefing. Alta.
- **Justificativa** — Tratar manifestações elegíveis.
- **Aceitação** — Nota 0–6 ou reclamação ou retorno encaminha uma vez; registra providência e valida transição.
- **Rastreabilidade** — Fila da Ouvidoria · `GET /admin/ombudsman; POST /admin/ombudsman/{id}/actions` · `OmbudsmanController.js` · ombudsman_cases, ombudsman_actions.
- **Verificação** — TF-08. Evidência prevista ou registrada em `ouvidoria/02-historico.png`.
- **Situação** — Implementado.

## RF-12 — Notificações

- **Origem e prioridade** — Briefing. Média.
- **Justificativa** — Sinalizar novos eventos aos autorizados.
- **Aceitação** — Somente destinatário recebe aviso e pode marcar como lido.
- **Rastreabilidade** — Notificações · `GET /notifications; PATCH /notifications/{id}/read` · `NotificationRoute.js, Notifications.js` · user_notifications.
- **Verificação** — TF-09. Evidência prevista ou registrada em `gestao/17-notificacoes.png`.
- **Situação** — Implementado.

## RF-13 — Exportações Excel e PDF

- **Origem e prioridade** — Briefing. Média.
- **Justificativa** — Permitir análise e apresentação fora da interface.
- **Aceitação** — Arquivos abrem, mantêm filtros e omitem contato.
- **Rastreabilidade** — Relatórios · `GET /admin/reports/excel; GET /admin/reports/pdf` · `ReportFiles.js` · agregados de surveys, answers, feedback.
- **Verificação** — TF-10. Evidência prevista ou registrada em `gestao/18-relatorios.png`.
- **Situação** — Implementado.

## RF-14 — TV Wall agregada

- **Origem e prioridade** — Briefing. Média.
- **Justificativa** — Exibir indicadores públicos legíveis.
- **Aceitação** — A API pública suprime grupos abaixo do volume mínimo configurado.
- **Rastreabilidade** — TV Wall · `GET /tvwall/{overview,sectors}` · `TvWallController.js` · surveys, answers.
- **Verificação** — TF-09. Evidência prevista ou registrada em `tv-wall/01-painel.png`.
- **Situação** — Implementado.

## RNF-01 — Acesso seguro e isolamento

- **Origem e prioridade** — Briefing; segurança ISO/IEC 25010. Alta.
- **Justificativa** — Proteger a informação por perfil e setor.
- **Aceitação** — Cinco matrizes distintas, 401/403 e revogação de sessão.
- **Rastreabilidade** — Login / Usuários · `/auth; /admin/users/{id}/access` · `AuthService.js, Profiles.js` · users, auth_sessions, user_sectors.
- **Verificação** — SEG-01/TF-11. Evidência prevista ou registrada em `gestao/19-usuarios.png`.
- **Situação** — Implementado.

## RNF-02 — Acessibilidade e responsividade

- **Origem e prioridade** — Briefing; capacidade de interação ISO/IEC 25010. Alta.
- **Justificativa** — Permitir interação em celular, tablet, desktop e TV.
- **Aceitação** — Foco, teclado, rótulos e axe nos estados avaliados; leitura manual separada.
- **Rastreabilidade** — Interfaces web · `Camada web` · `styles.css, QuestionRenderer.jsx` · Não se aplica.
- **Verificação** — AC-01. Evidência prevista ou registrada em `mobile/nota-geral.png; tablet/nota-geral.png`.
- **Situação** — Parcial.

## RNF-03 — TLS e integridade

- **Origem e prioridade** — Briefing; segurança e confiabilidade ISO/IEC 25010. Alta.
- **Justificativa** — Evitar corrupção e exposição entre serviços.
- **Aceitação** — TLS com identidade, concessões DML restritas, FKs e migrations verificadas.
- **Rastreabilidade** — Infraestrutura · `Conexão MySQL` · `config/env.js, scripts/migrate.js` · schema e migrations.
- **Verificação** — DB-01. Evidência prevista ou registrada em `tecnico/estrutura-banco.svg`.
- **Situação** — Implementado.

## RNF-04 — Manutenibilidade e rastreabilidade

- **Origem e prioridade** — Especificação da entrega; manutenibilidade ISO/IEC 25010. Alta.
- **Justificativa** — Permitir revisão e reprodução.
- **Aceitação** — README, contrato OpenAPI, modelos, código e testes com evidências auditáveis.
- **Rastreabilidade** — Swagger / documentação · `GET /api-docs.json` · `swagger/, docs/` · Não se aplica.
- **Verificação** — API-01. Evidência prevista ou registrada em `tecnico/01-swagger.png`.
- **Situação** — Implementado.

## RNF-05 — Hospedagem e recuperação

- **Origem e prioridade** — Especificação da entrega; confiabilidade ISO/IEC 25010. Alta.
- **Justificativa** — Manter a demonstração reproduzível.
- **Aceitação** — Verificar endpoints e guardar versões estáveis; recuperação de backups físicos fora deste teste.
- **Rastreabilidade** — Vercel / Render / Aiven · `GET /health` · `vercel.json, server.js` · fhdod_ouvidoria.
- **Verificação** — DEP-01. Evidência prevista ou registrada em `tecnico/deployments.svg`.
- **Situação** — Parcial.

## RNF-06 — Expansão multi-hospital

- **Origem e prioridade** — Escopo explícito da entrega. Baixa.
- **Justificativa** — Avaliar isolamento antes de escalar.
- **Aceitação** — Documentar requisitos futuros; operação atual é de uma instituição.
- **Rastreabilidade** — Arquitetura · `Não se aplica` · `docs/arquitetura-backend.md` · Sem chave de instituição.
- **Verificação** — DOC-01. Evidência prevista ou registrada em `Arquitetura geral`.
- **Situação** — Não aplicável à implementação atual.
