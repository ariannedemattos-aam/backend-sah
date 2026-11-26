# Mapeamento entre código e persistência

A implementação de produção usa módulos JavaScript, não um ORM. O mapeamento representa as operações montadas e suas tabelas.

| Módulo ativo | Leitura e escrita | Integração |
| --- | --- | --- |
| `services/AuthService.js` | `users`, `roles`, `role_permissions`, `user_permissions`, `auth_sessions` | login, refresh e revogação. |
| `controllers/UserAccessController.js` | `users`, `user_sectors`, `auth_sessions`, `audit_logs` | gestão de conta restrita a Super Admin. |
| `controllers/AdminController.js` | setores, serviços, equipes, etapas, turnos, `service_stages` | cadastros e configuração da ordem da jornada. |
| `controllers/QuestionController.js` | `questions`, `question_versions`, `question_options`, `question_assignments`, `question_approvals`, `question_version_rules` | versão, ordem, restrição de setor e aprovação. |
| `controllers/PublicSurveyController.js`, `services/QuestionJourney.js` | `surveys`, `survey_attendances`, `attendance_journeys`, `attendance_journey_stages`, `survey_questions`, `survey_question_context`, `answers`, `feedback` | criação, snapshot, respostas opcionais e conclusão. |
| `controllers/RosterController.js` | `roster_staff`, `roster_shifts`, `roster_shift_staff`, `audit_logs` | calendário e indicador agregado de nota 0–10. |
| `controllers/OmbudsmanController.js` | `ombudsman_cases`, `ombudsman_actions` e joins com pesquisa/retorno | triagem e providências. |
| `controllers/EvaluationController.js`, `services/EvaluationData.js` | pesquisas, respostas, feedback, solicitações, `audit_logs` | detalhes anônimos, máscaras e consulta de contato auditada. |
| `controllers/InvitationController.js` | `invitations`, `notification_logs`, `surveys` | token de uso único e tentativas de entrega. |
| `routes/NotificationRoute.js`, `services/Notifications.js` | `user_notifications` e permissões | entrega ao destinatário e registro de leitura. |
| `controllers/ReportController.js`, `services/ReportFiles.js`, `controllers/TvWallController.js` | agregados de pesquisas concluídas | arquivos em memória e TV agregada. |

## Consultas verificáveis

- `EvaluationData.selections` cria uma CTE `selected` com estado concluído e filtros parametrizados. Em seguida usa `survey_attendances` e `EXISTS` para selecionar o mesmo atendimento por setor, turno e equipe. Respostas ocultas são excluídas pela visibilidade do snapshot. No feedback de setor, `NOT EXISTS` impede acesso a pesquisas com atendimentos fora do próprio escopo.
- `RosterController.teamIndicators` usa `JOIN roster_shifts rs ON rs.sector_id=a.sector_id AND rs.shift_id=a.shift_id AND rs.work_date=a.attendance_date`. Deduplica pares de pesquisa e equipe antes de agrupar e publica a média somente a partir de três pesquisas.
- `PublicSurveyController.start` materializa perguntas aprovadas e ativas e utiliza `ROW_NUMBER()` sobre atendimento, ordem da etapa e posição. O pré-requisito é resolvido para a pergunta materializada do mesmo atendimento.
- `OmbudsmanController.enqueue` verifica a presença de retorno ou reclamação em SQL por UUID e grava manifestação na transação de conclusão. As transições de contato e atendimento consultam e travam a linha antes de gravar.

Há interpolação de fragmentos fixos de SQL para ordenar e selecionar dimensões. Valores de operadores e pacientes entram como parâmetros. Entidades do diretório histórico `models/` não representam o caminho atual de persistência.
