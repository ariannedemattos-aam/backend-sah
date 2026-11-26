# Modelo de dados e requisitos

## Modelo conceitual

| Relação | Cardinalidade e regra |
| --- | --- |
| Papel, permissão e usuário | Papel 1:N usuários. Papéis e permissões N:M via vínculo. Usuários e setores N:M para restrição de escopo. |
| Setor e serviço | Setor 1:N serviços. Serviço sem vínculo fica fora do fluxo público. Serviço N:M etapas pela configuração ordenada. |
| Pergunta e versão | Pergunta 1:N versões, versão 1:N opções, versão 0:1 condicionante. Aprovações documentam o ciclo de revisão. |
| Pesquisa e atendimento | Pesquisa 1:N atendimentos após o início. Atendimento referencia setor, serviço e turno. Data e etapas informadas são opcionais. |
| Atendimento e pergunta materializada | Atendimento 1:N snapshots. Cada snapshot tem 0:1 resposta e 0:1 contexto. Contexto pode referenciar uma pergunta anterior do mesmo atendimento. |
| Pesquisa, retornos e manifestações | Pesquisa tem 0:1 feedback, 0:1 pedido e 0:1 caso. Caso tem 0:N providências. Nota 0–6, reclamação ou retorno geram triagem. |
| Calendário e equipe | Uma escala por setor, data e turno, referindo uma equipe. Escala N:M profissionais do mesmo setor. O cruzamento é contextual e agregado. |
| Convite e pesquisa | O resgate é de uso único e transacional. O modelo preserva anonimato sem formar vínculo persistido com a pesquisa. |

## Modelo lógico e físico

A extração abaixo usa apenas metadados do schema remoto. Chaves compostas e índices aparecem na ordem de suas colunas. Nulabilidade e valores padrão correspondem ao Aiven. Compare com o SQL base e as migrations para reproduzir a estrutura.

MySQL `8.4.8` · 39 tabelas · 109 índices · 60 chaves estrangeiras.

### `answers`

Respostas únicas por pergunta materializada. Restrita. Respostas individuais e texto livre.

| Coluna | MySQL | Nulo | Padrão | Extras | Chaves |
| --- | --- | --- | --- | --- | --- |
| `id` | `char(36)` | NO | `NULL` | — | PK |
| `survey_question_id` | `char(36)` | NO | `NULL` | — | FK |
| `rating_value` | `decimal(5,2)` | YES | `NULL` | — | — |
| `text_value` | `text` | YES | `NULL` | — | — |
| `created_at` | `timestamp` | YES | `CURRENT_TIMESTAMP` | DEFAULT_GENERATED | — |
| `updated_at` | `timestamp` | YES | `CURRENT_TIMESTAMP` | DEFAULT_GENERATED on update CURRENT_TIMESTAMP | — |

Índices: `PRIMARY` (único) em `id`; `survey_question_id` (único) em `survey_question_id`.
- FK `answers_ibfk_1` em `survey_question_id` referenciando `survey_questions(id)`. UPDATE NO ACTION; DELETE NO ACTION.

### `attendance_counts`

Estrutura de volumes por dia, setor e serviço. Dados de catálogo ou operação interna.

| Coluna | MySQL | Nulo | Padrão | Extras | Chaves |
| --- | --- | --- | --- | --- | --- |
| `id` | `char(36)` | NO | `NULL` | — | PK |
| `sector_id` | `char(36)` | YES | `NULL` | — | — |
| `service_id` | `char(36)` | YES | `NULL` | — | — |
| `count_date` | `date` | NO | `NULL` | — | — |
| `total` | `int` | NO | `NULL` | — | — |

Índices: `PRIMARY` (único) em `id`; `sector_id` (único) em `sector_id, service_id, count_date`.

### `attendance_journey_stages`

Etapas realizadas no atendimento. Dados de catálogo ou operação interna.

| Coluna | MySQL | Nulo | Padrão | Extras | Chaves |
| --- | --- | --- | --- | --- | --- |
| `attendance_id` | `char(36)` | NO | `NULL` | — | PK, FK |
| `stage_id` | `char(36)` | NO | `NULL` | — | PK, FK |

Índices: `PRIMARY` (único) em `attendance_id, stage_id`; `stage_id` (não único) em `stage_id`.
- FK `attendance_journey_stages_ibfk_1` em `attendance_id` referenciando `attendance_journeys(attendance_id)`. UPDATE NO ACTION; DELETE CASCADE.
- FK `attendance_journey_stages_ibfk_2` em `stage_id` referenciando `stages(id)`. UPDATE NO ACTION; DELETE NO ACTION.

### `attendance_journeys`

Marca de seleção explícita de etapas no atendimento. Dados de catálogo ou operação interna.

| Coluna | MySQL | Nulo | Padrão | Extras | Chaves |
| --- | --- | --- | --- | --- | --- |
| `attendance_id` | `char(36)` | NO | `NULL` | — | PK, FK |

Índices: `PRIMARY` (único) em `attendance_id`.
- FK `attendance_journeys_ibfk_1` em `attendance_id` referenciando `survey_attendances(id)`. UPDATE NO ACTION; DELETE CASCADE.

### `audit_logs`

Histórico de ações protegidas e metadados. Restrita. Operador e metadados de auditoria.

| Coluna | MySQL | Nulo | Padrão | Extras | Chaves |
| --- | --- | --- | --- | --- | --- |
| `id` | `char(36)` | NO | `NULL` | — | PK |
| `user_id` | `char(36)` | YES | `NULL` | — | FK |
| `action` | `varchar(100)` | NO | `NULL` | — | — |
| `entity` | `varchar(100)` | YES | `NULL` | — | — |
| `entity_id` | `char(36)` | YES | `NULL` | — | — |
| `metadata` | `json` | YES | `NULL` | — | — |
| `created_at` | `timestamp` | YES | `CURRENT_TIMESTAMP` | DEFAULT_GENERATED | — |

Índices: `PRIMARY` (único) em `id`; `user_id` (não único) em `user_id`.
- FK `audit_logs_ibfk_1` em `user_id` referenciando `users(id)`. UPDATE NO ACTION; DELETE NO ACTION.

### `auth_sessions`

Refresh vigente e anterior, prazo, rotação e revogação. Restrita. Hashes de sessão.

| Coluna | MySQL | Nulo | Padrão | Extras | Chaves |
| --- | --- | --- | --- | --- | --- |
| `id` | `char(36)` | NO | `NULL` | — | PK |
| `user_id` | `char(36)` | NO | `NULL` | — | FK |
| `refresh_hash` | `char(64)` | NO | `NULL` | — | — |
| `previous_refresh_hash` | `char(64)` | YES | `NULL` | — | — |
| `rotated_at` | `datetime(3)` | YES | `NULL` | — | — |
| `expires_at` | `datetime` | NO | `NULL` | — | — |
| `revoked_at` | `datetime(3)` | YES | `NULL` | — | — |
| `created_at` | `timestamp` | NO | `CURRENT_TIMESTAMP` | DEFAULT_GENERATED | — |

Índices: `auth_sessions_by_user` (não único) em `user_id, expires_at`; `PRIMARY` (único) em `id`; `refresh_hash` (único) em `refresh_hash`.
- FK `auth_sessions_ibfk_1` em `user_id` referenciando `users(id)`. UPDATE NO ACTION; DELETE NO ACTION.

### `feedback`

Elogio, pontos positivos, reclamação e sugestão. Restrita. Texto pode conter informações identificáveis.

| Coluna | MySQL | Nulo | Padrão | Extras | Chaves |
| --- | --- | --- | --- | --- | --- |
| `id` | `char(36)` | NO | `NULL` | — | PK |
| `survey_id` | `char(36)` | NO | `NULL` | — | FK |
| `positive_text` | `text` | YES | `NULL` | — | — |
| `negative_text` | `text` | YES | `NULL` | — | — |
| `praise_text` | `text` | YES | `NULL` | — | — |
| `suggestion_text` | `text` | YES | `NULL` | — | — |
| `created_at` | `timestamp` | YES | `CURRENT_TIMESTAMP` | DEFAULT_GENERATED | — |

Índices: `PRIMARY` (único) em `id`; `survey_id` (único) em `survey_id`.
- FK `feedback_ibfk_1` em `survey_id` referenciando `surveys(id)`. UPDATE NO ACTION; DELETE NO ACTION.

### `invitations`

Convites com hash, validade e estado de uso. Restrita. Hash e campo histórico de contato.

| Coluna | MySQL | Nulo | Padrão | Extras | Chaves |
| --- | --- | --- | --- | --- | --- |
| `id` | `char(36)` | NO | `NULL` | — | PK |
| `token_hash` | `char(64)` | NO | `NULL` | — | — |
| `channel` | `enum('email','whatsapp','manual')` | NO | `NULL` | — | — |
| `contact` | `varchar(255)` | YES | `NULL` | — | — |
| `expires_at` | `datetime` | NO | `NULL` | — | — |
| `used_at` | `datetime` | YES | `NULL` | — | — |
| `created_at` | `timestamp` | YES | `CURRENT_TIMESTAMP` | DEFAULT_GENERATED | — |

Índices: `invitations_by_usage_validity` (não único) em `used_at, expires_at`; `PRIMARY` (único) em `id`; `token_hash` (único) em `token_hash`.

### `notification_logs`

Tentativas de comunicação por convite. Operacional restrita.

| Coluna | MySQL | Nulo | Padrão | Extras | Chaves |
| --- | --- | --- | --- | --- | --- |
| `id` | `char(36)` | NO | `NULL` | — | PK |
| `invitation_id` | `char(36)` | YES | `NULL` | — | FK |
| `channel` | `varchar(30)` | YES | `NULL` | — | — |
| `status` | `varchar(30)` | YES | `NULL` | — | — |
| `created_at` | `timestamp` | YES | `CURRENT_TIMESTAMP` | DEFAULT_GENERATED | — |

Índices: `logs_by_invite_date` (não único) em `invitation_id, created_at, id`; `PRIMARY` (único) em `id`.
- FK `notification_logs_ibfk_1` em `invitation_id` referenciando `invitations(id)`. UPDATE NO ACTION; DELETE NO ACTION.

### `ombudsman_actions`

Histórico de providências, autor e estado. Restrita à equipe autorizada.

| Coluna | MySQL | Nulo | Padrão | Extras | Chaves |
| --- | --- | --- | --- | --- | --- |
| `id` | `char(36)` | NO | `NULL` | — | PK |
| `case_id` | `char(36)` | NO | `NULL` | — | FK |
| `actor_id` | `char(36)` | NO | `NULL` | — | FK |
| `previous_status` | `enum('open','in_progress','closed')` | NO | `NULL` | — | — |
| `status` | `enum('open','in_progress','closed')` | NO | `NULL` | — | — |
| `priority` | `enum('normal','high')` | NO | `NULL` | — | — |
| `note` | `varchar(1500)` | NO | `NULL` | — | — |
| `created_at` | `timestamp(3)` | NO | `CURRENT_TIMESTAMP(3)` | DEFAULT_GENERATED | — |

Índices: `actor_id` (não único) em `actor_id`; `case_history` (não único) em `case_id, created_at, id`; `PRIMARY` (único) em `id`.
- FK `ombudsman_actions_ibfk_1` em `case_id` referenciando `ombudsman_cases(id)`. UPDATE NO ACTION; DELETE NO ACTION.
- FK `ombudsman_actions_ibfk_2` em `actor_id` referenciando `users(id)`. UPDATE NO ACTION; DELETE NO ACTION.

### `ombudsman_cases`

Fila por pesquisa, prioridade e situação. Restrita à equipe autorizada.

| Coluna | MySQL | Nulo | Padrão | Extras | Chaves |
| --- | --- | --- | --- | --- | --- |
| `id` | `char(36)` | NO | `NULL` | — | PK |
| `survey_id` | `char(36)` | NO | `NULL` | — | FK |
| `status` | `enum('open','in_progress','closed')` | NO | `open` | — | — |
| `priority` | `enum('normal','high')` | NO | `NULL` | — | — |
| `created_at` | `datetime` | NO | `NULL` | — | — |

Índices: `cases_by_period` (não único) em `created_at, id`; `cases_by_status` (não único) em `status, priority, created_at`; `PRIMARY` (único) em `id`; `survey_id` (único) em `survey_id`.
- FK `ombudsman_cases_ibfk_1` em `survey_id` referenciando `surveys(id)`. UPDATE NO ACTION; DELETE NO ACTION.

### `permissions`

Permissões de operação. Dados de catálogo ou operação interna.

| Coluna | MySQL | Nulo | Padrão | Extras | Chaves |
| --- | --- | --- | --- | --- | --- |
| `id` | `char(36)` | NO | `NULL` | — | PK |
| `name` | `varchar(100)` | NO | `NULL` | — | — |
| `description` | `varchar(255)` | YES | `NULL` | — | — |
| `created_at` | `timestamp` | YES | `CURRENT_TIMESTAMP` | DEFAULT_GENERATED | — |

Índices: `name` (único) em `name`; `PRIMARY` (único) em `id`.

### `question_approvals`

Decisões e justificativas de revisão. Dados de catálogo ou operação interna.

| Coluna | MySQL | Nulo | Padrão | Extras | Chaves |
| --- | --- | --- | --- | --- | --- |
| `id` | `char(36)` | NO | `NULL` | — | PK |
| `question_id` | `char(36)` | NO | `NULL` | — | FK |
| `reviewer_id` | `char(36)` | NO | `NULL` | — | FK |
| `action` | `enum('approved','rejected')` | NO | `NULL` | — | — |
| `justification` | `text` | YES | `NULL` | — | — |
| `created_at` | `timestamp` | YES | `CURRENT_TIMESTAMP` | DEFAULT_GENERATED | — |

Índices: `PRIMARY` (único) em `id`; `question_id` (não único) em `question_id`; `reviewer_id` (não único) em `reviewer_id`.
- FK `question_approvals_ibfk_1` em `question_id` referenciando `questions(id)`. UPDATE NO ACTION; DELETE NO ACTION.
- FK `question_approvals_ibfk_2` em `reviewer_id` referenciando `users(id)`. UPDATE NO ACTION; DELETE NO ACTION.

### `question_assignments`

Vínculo entre pergunta, serviço, setor e etapa. Dados de catálogo ou operação interna.

| Coluna | MySQL | Nulo | Padrão | Extras | Chaves |
| --- | --- | --- | --- | --- | --- |
| `id` | `char(36)` | NO | `NULL` | — | PK |
| `question_id` | `char(36)` | NO | `NULL` | — | FK |
| `sector_id` | `char(36)` | YES | `NULL` | — | FK |
| `service_id` | `char(36)` | YES | `NULL` | — | FK |
| `stage_id` | `char(36)` | YES | `NULL` | — | FK |
| `display_order` | `int` | YES | `0` | — | — |
| `is_active` | `tinyint(1)` | YES | `1` | — | — |

Índices: `PRIMARY` (único) em `id`; `question_id` (não único) em `question_id`; `sector_id` (não único) em `sector_id`; `service_id` (não único) em `service_id`; `stage_id` (não único) em `stage_id`.
- FK `question_assignments_ibfk_1` em `question_id` referenciando `questions(id)`. UPDATE NO ACTION; DELETE NO ACTION.
- FK `question_assignments_ibfk_2` em `sector_id` referenciando `sectors(id)`. UPDATE NO ACTION; DELETE NO ACTION.
- FK `question_assignments_ibfk_3` em `service_id` referenciando `services(id)`. UPDATE NO ACTION; DELETE NO ACTION.
- FK `question_assignments_ibfk_4` em `stage_id` referenciando `stages(id)`. UPDATE NO ACTION; DELETE NO ACTION.

### `question_options`

Opções por versão e seus valores. Dados de catálogo ou operação interna.

| Coluna | MySQL | Nulo | Padrão | Extras | Chaves |
| --- | --- | --- | --- | --- | --- |
| `id` | `char(36)` | NO | `NULL` | — | PK |
| `question_version_id` | `char(36)` | NO | `NULL` | — | FK |
| `label` | `varchar(255)` | NO | `NULL` | — | — |
| `value` | `varchar(100)` | NO | `NULL` | — | — |
| `display_order` | `int` | YES | `0` | — | — |

Índices: `PRIMARY` (único) em `id`; `question_version_id` (não único) em `question_version_id`.
- FK `question_options_ibfk_1` em `question_version_id` referenciando `question_versions(id)`. UPDATE NO ACTION; DELETE NO ACTION.

### `question_version_rules`

Pré-requisito da versão configurada. Dados de catálogo ou operação interna.

| Coluna | MySQL | Nulo | Padrão | Extras | Chaves |
| --- | --- | --- | --- | --- | --- |
| `version_id` | `char(36)` | NO | `NULL` | — | PK, FK |
| `prerequisite_id` | `char(36)` | NO | `NULL` | — | FK |
| `expected_value` | `varchar(100)` | NO | `NULL` | — | — |

Índices: `prerequisite_id` (não único) em `prerequisite_id`; `PRIMARY` (único) em `version_id`.
- FK `question_version_rules_ibfk_1` em `version_id` referenciando `question_versions(id)`. UPDATE NO ACTION; DELETE NO ACTION.
- FK `question_version_rules_ibfk_2` em `prerequisite_id` referenciando `questions(id)`. UPDATE NO ACTION; DELETE NO ACTION.

### `question_versions`

Enunciados e razões de edição versionados. Dados de catálogo ou operação interna.

| Coluna | MySQL | Nulo | Padrão | Extras | Chaves |
| --- | --- | --- | --- | --- | --- |
| `id` | `char(36)` | NO | `NULL` | — | PK |
| `question_id` | `char(36)` | NO | `NULL` | — | FK |
| `version` | `int` | NO | `NULL` | — | — |
| `prompt` | `text` | NO | `NULL` | — | — |
| `change_reason` | `text` | YES | `NULL` | — | — |
| `created_by` | `char(36)` | YES | `NULL` | — | FK |
| `created_at` | `timestamp` | YES | `CURRENT_TIMESTAMP` | DEFAULT_GENERATED | — |

Índices: `created_by` (não único) em `created_by`; `PRIMARY` (único) em `id`; `question_id` (único) em `question_id, version`; `version_question_identity` (único) em `id, question_id`.
- FK `question_versions_ibfk_1` em `question_id` referenciando `questions(id)`. UPDATE NO ACTION; DELETE NO ACTION.
- FK `question_versions_ibfk_2` em `created_by` referenciando `users(id)`. UPDATE NO ACTION; DELETE NO ACTION.

### `questions`

Metadados do questionário, status e versão atual. Dados de catálogo ou operação interna.

| Coluna | MySQL | Nulo | Padrão | Extras | Chaves |
| --- | --- | --- | --- | --- | --- |
| `id` | `char(36)` | NO | `NULL` | — | PK |
| `created_by` | `char(36)` | YES | `NULL` | — | FK |
| `stage_id` | `char(36)` | YES | `NULL` | — | FK |
| `team_id` | `char(36)` | YES | `NULL` | — | FK |
| `type` | `enum('rating','text','single_choice','multiple_choice')` | NO | `rating` | — | — |
| `status` | `enum('pending','approved','active','inactive','rejected')` | NO | `pending` | — | — |
| `current_version` | `int` | NO | `1` | — | — |
| `is_required` | `tinyint(1)` | YES | `1` | — | — |
| `created_at` | `timestamp` | YES | `CURRENT_TIMESTAMP` | DEFAULT_GENERATED | — |
| `updated_at` | `timestamp` | YES | `CURRENT_TIMESTAMP` | DEFAULT_GENERATED on update CURRENT_TIMESTAMP | — |

Índices: `created_by` (não único) em `created_by`; `PRIMARY` (único) em `id`; `stage_id` (não único) em `stage_id`; `team_id` (não único) em `team_id`.
- FK `questions_ibfk_1` em `created_by` referenciando `users(id)`. UPDATE NO ACTION; DELETE NO ACTION.
- FK `questions_ibfk_2` em `stage_id` referenciando `stages(id)`. UPDATE NO ACTION; DELETE NO ACTION.
- FK `questions_ibfk_3` em `team_id` referenciando `teams(id)`. UPDATE NO ACTION; DELETE NO ACTION.

### `refresh_tokens`

Estrutura histórica de refresh; execução atual usa auth_sessions. Restrita. Hash legado.

| Coluna | MySQL | Nulo | Padrão | Extras | Chaves |
| --- | --- | --- | --- | --- | --- |
| `id` | `char(36)` | NO | `uuid()` | DEFAULT_GENERATED | PK |
| `user_id` | `char(36)` | NO | `NULL` | — | FK |
| `token_hash` | `char(64)` | NO | `NULL` | — | — |
| `expires_at` | `datetime` | NO | `NULL` | — | — |
| `revoked_at` | `datetime` | YES | `NULL` | — | — |
| `created_at` | `timestamp` | YES | `CURRENT_TIMESTAMP` | DEFAULT_GENERATED | — |

Índices: `PRIMARY` (único) em `id`; `token_hash` (único) em `token_hash`; `user_id` (não único) em `user_id`.
- FK `refresh_tokens_ibfk_1` em `user_id` referenciando `users(id)`. UPDATE NO ACTION; DELETE NO ACTION.

### `return_requests`

Solicitações voluntárias e contato separado. Restrita. Contato e mensagem voluntários.

| Coluna | MySQL | Nulo | Padrão | Extras | Chaves |
| --- | --- | --- | --- | --- | --- |
| `id` | `char(36)` | NO | `NULL` | — | PK |
| `survey_id` | `char(36)` | NO | `NULL` | — | FK |
| `name` | `varchar(150)` | YES | `NULL` | — | — |
| `contact` | `varchar(255)` | NO | `NULL` | — | — |
| `preferred_channel` | `varchar(30)` | YES | `NULL` | — | — |
| `message` | `text` | YES | `NULL` | — | — |
| `status` | `enum('open','in_progress','closed')` | YES | `open` | — | — |
| `created_at` | `timestamp` | YES | `CURRENT_TIMESTAMP` | DEFAULT_GENERATED | — |

Índices: `PRIMARY` (único) em `id`; `returns_by_status_date` (não único) em `status, created_at, id`; `survey_id` (único) em `survey_id`.
- FK `return_requests_ibfk_1` em `survey_id` referenciando `surveys(id)`. UPDATE NO ACTION; DELETE NO ACTION.

### `role_permissions`

Associação entre papéis e permissões. Dados de catálogo ou operação interna.

| Coluna | MySQL | Nulo | Padrão | Extras | Chaves |
| --- | --- | --- | --- | --- | --- |
| `role_id` | `char(36)` | NO | `NULL` | — | PK, FK |
| `permission_id` | `char(36)` | NO | `NULL` | — | PK, FK |

Índices: `permission_id` (não único) em `permission_id`; `PRIMARY` (único) em `role_id, permission_id`.
- FK `role_permissions_ibfk_1` em `role_id` referenciando `roles(id)`. UPDATE NO ACTION; DELETE NO ACTION.
- FK `role_permissions_ibfk_2` em `permission_id` referenciando `permissions(id)`. UPDATE NO ACTION; DELETE NO ACTION.

### `roles`

Papéis efetivos e legado. Dados de catálogo ou operação interna.

| Coluna | MySQL | Nulo | Padrão | Extras | Chaves |
| --- | --- | --- | --- | --- | --- |
| `id` | `char(36)` | NO | `NULL` | — | PK |
| `name` | `varchar(50)` | NO | `NULL` | — | — |
| `created_at` | `timestamp` | YES | `CURRENT_TIMESTAMP` | DEFAULT_GENERATED | — |

Índices: `name` (único) em `name`; `PRIMARY` (único) em `id`.

### `roster_shift_staff`

Alocação de profissionais do mesmo setor na escala. Restrita. Vinculação ao turno.

| Coluna | MySQL | Nulo | Padrão | Extras | Chaves |
| --- | --- | --- | --- | --- | --- |
| `sector_id` | `char(36)` | NO | `NULL` | — | PK, FK |
| `work_date` | `date` | NO | `NULL` | — | PK, FK |
| `shift_id` | `char(36)` | NO | `NULL` | — | PK, FK |
| `staff_id` | `char(36)` | NO | `NULL` | — | PK, FK |
| `is_assigned` | `tinyint(1)` | NO | `1` | — | — |

Índices: `PRIMARY` (único) em `sector_id, work_date, shift_id, staff_id`; `staff_id` (não único) em `staff_id, sector_id`.
- FK `roster_shift_staff_ibfk_1` em `sector_id, work_date, shift_id` referenciando `roster_shifts(sector_id, work_date, shift_id)`. UPDATE NO ACTION; DELETE NO ACTION.
- FK `roster_shift_staff_ibfk_2` em `staff_id, sector_id` referenciando `roster_staff(id, sector_id)`. UPDATE NO ACTION; DELETE NO ACTION.

### `roster_shifts`

Calendário de equipes por setor, dia e turno. Dados de catálogo ou operação interna.

| Coluna | MySQL | Nulo | Padrão | Extras | Chaves |
| --- | --- | --- | --- | --- | --- |
| `sector_id` | `char(36)` | NO | `NULL` | — | PK, FK |
| `work_date` | `date` | NO | `NULL` | — | PK |
| `shift_id` | `char(36)` | NO | `NULL` | — | PK, FK |
| `team_id` | `char(36)` | NO | `NULL` | — | FK |
| `updated_by` | `char(36)` | NO | `NULL` | — | FK |
| `updated_at` | `timestamp` | YES | `CURRENT_TIMESTAMP` | DEFAULT_GENERATED on update CURRENT_TIMESTAMP | — |

Índices: `PRIMARY` (único) em `sector_id, work_date, shift_id`; `roster_by_date` (não único) em `work_date, sector_id`; `shift_id` (não único) em `shift_id`; `team_id` (não único) em `team_id`; `updated_by` (não único) em `updated_by`.
- FK `roster_shifts_ibfk_1` em `sector_id` referenciando `sectors(id)`. UPDATE NO ACTION; DELETE NO ACTION.
- FK `roster_shifts_ibfk_2` em `shift_id` referenciando `shifts(id)`. UPDATE NO ACTION; DELETE NO ACTION.
- FK `roster_shifts_ibfk_3` em `team_id` referenciando `teams(id)`. UPDATE NO ACTION; DELETE NO ACTION.
- FK `roster_shifts_ibfk_4` em `updated_by` referenciando `users(id)`. UPDATE NO ACTION; DELETE NO ACTION.

### `roster_staff`

Profissionais da escala por setor. Restrita. Identificação interna.

| Coluna | MySQL | Nulo | Padrão | Extras | Chaves |
| --- | --- | --- | --- | --- | --- |
| `id` | `char(36)` | NO | `NULL` | — | PK |
| `sector_id` | `char(36)` | NO | `NULL` | — | FK |
| `name` | `varchar(120)` | NO | `NULL` | — | — |
| `is_active` | `tinyint(1)` | NO | `1` | — | — |

Índices: `PRIMARY` (único) em `id`; `staff_name_sector` (único) em `sector_id, name`; `staff_scope` (único) em `id, sector_id`.
- FK `roster_staff_ibfk_1` em `sector_id` referenciando `sectors(id)`. UPDATE NO ACTION; DELETE NO ACTION.

### `sectors`

Setores hospitalares e links públicos por UUID. Dados de catálogo ou operação interna.

| Coluna | MySQL | Nulo | Padrão | Extras | Chaves |
| --- | --- | --- | --- | --- | --- |
| `id` | `char(36)` | NO | `NULL` | — | PK |
| `name` | `varchar(120)` | NO | `NULL` | — | — |
| `slug` | `varchar(140)` | YES | `NULL` | — | — |
| `description` | `text` | YES | `NULL` | — | — |
| `is_active` | `tinyint(1)` | YES | `1` | — | — |
| `created_at` | `timestamp` | YES | `CURRENT_TIMESTAMP` | DEFAULT_GENERATED | — |
| `updated_at` | `timestamp` | YES | `CURRENT_TIMESTAMP` | DEFAULT_GENERATED on update CURRENT_TIMESTAMP | — |

Índices: `PRIMARY` (único) em `id`; `slug` (único) em `slug`.

### `service_stages`

Etapas ativas de um serviço, na ordem configurada. Dados de catálogo ou operação interna.

| Coluna | MySQL | Nulo | Padrão | Extras | Chaves |
| --- | --- | --- | --- | --- | --- |
| `id` | `char(36)` | NO | `NULL` | — | PK |
| `service_id` | `char(36)` | NO | `NULL` | — | FK |
| `stage_id` | `char(36)` | NO | `NULL` | — | FK |
| `team_id` | `char(36)` | YES | `NULL` | — | FK |
| `display_order` | `int` | NO | `NULL` | — | — |
| `is_required` | `tinyint(1)` | YES | `1` | — | — |
| `is_active` | `tinyint(1)` | YES | `1` | — | — |

Índices: `PRIMARY` (único) em `id`; `service_id` (único) em `service_id, stage_id`; `stage_id` (não único) em `stage_id`; `team_id` (não único) em `team_id`.
- FK `service_stages_ibfk_1` em `service_id` referenciando `services(id)`. UPDATE NO ACTION; DELETE NO ACTION.
- FK `service_stages_ibfk_2` em `stage_id` referenciando `stages(id)`. UPDATE NO ACTION; DELETE NO ACTION.
- FK `service_stages_ibfk_3` em `team_id` referenciando `teams(id)`. UPDATE NO ACTION; DELETE NO ACTION.

### `services`

Serviços por setor. Dados de catálogo ou operação interna.

| Coluna | MySQL | Nulo | Padrão | Extras | Chaves |
| --- | --- | --- | --- | --- | --- |
| `id` | `char(36)` | NO | `NULL` | — | PK |
| `sector_id` | `char(36)` | YES | `NULL` | — | FK |
| `name` | `varchar(120)` | NO | `NULL` | — | — |
| `slug` | `varchar(140)` | YES | `NULL` | — | — |
| `description` | `text` | YES | `NULL` | — | — |
| `is_active` | `tinyint(1)` | YES | `1` | — | — |
| `created_at` | `timestamp` | YES | `CURRENT_TIMESTAMP` | DEFAULT_GENERATED | — |
| `updated_at` | `timestamp` | YES | `CURRENT_TIMESTAMP` | DEFAULT_GENERATED on update CURRENT_TIMESTAMP | — |

Índices: `PRIMARY` (único) em `id`; `sector_id` (não único) em `sector_id`; `slug` (único) em `slug`.
- FK `services_ibfk_1` em `sector_id` referenciando `sectors(id)`. UPDATE NO ACTION; DELETE NO ACTION.

### `shifts`

Turnos e ordem de exibição. Dados de catálogo ou operação interna.

| Coluna | MySQL | Nulo | Padrão | Extras | Chaves |
| --- | --- | --- | --- | --- | --- |
| `id` | `char(36)` | NO | `NULL` | — | PK |
| `name` | `varchar(50)` | NO | `NULL` | — | — |
| `display_order` | `int` | YES | `0` | — | — |
| `description` | `text` | YES | `NULL` | — | — |
| `is_active` | `tinyint(1)` | YES | `1` | — | — |
| `created_at` | `timestamp` | YES | `CURRENT_TIMESTAMP` | DEFAULT_GENERATED | — |

Índices: `PRIMARY` (único) em `id`.

### `stages`

Catálogo de etapas da jornada. Dados de catálogo ou operação interna.

| Coluna | MySQL | Nulo | Padrão | Extras | Chaves |
| --- | --- | --- | --- | --- | --- |
| `id` | `char(36)` | NO | `NULL` | — | PK |
| `name` | `varchar(120)` | NO | `NULL` | — | — |
| `description` | `text` | YES | `NULL` | — | — |
| `is_active` | `tinyint(1)` | YES | `1` | — | — |
| `created_at` | `timestamp` | YES | `CURRENT_TIMESTAMP` | DEFAULT_GENERATED | — |

Índices: `PRIMARY` (único) em `id`.

### `survey_attendances`

Contexto de setor, serviço, turno e data opcional. Restrita. Contexto individual da pesquisa.

| Coluna | MySQL | Nulo | Padrão | Extras | Chaves |
| --- | --- | --- | --- | --- | --- |
| `id` | `char(36)` | NO | `NULL` | — | PK |
| `survey_id` | `char(36)` | NO | `NULL` | — | FK |
| `sector_id` | `char(36)` | NO | `NULL` | — | FK |
| `service_id` | `char(36)` | NO | `NULL` | — | FK |
| `shift_id` | `char(36)` | NO | `NULL` | — | FK |
| `attendance_date` | `date` | YES | `NULL` | — | — |
| `created_at` | `timestamp` | YES | `CURRENT_TIMESTAMP` | DEFAULT_GENERATED | — |

Índices: `attendance_survey_identity` (único) em `id, survey_id`; `PRIMARY` (único) em `id`; `sector_id` (não único) em `sector_id`; `service_id` (não único) em `service_id`; `shift_id` (não único) em `shift_id`; `survey_id` (não único) em `survey_id`.
- FK `survey_attendances_ibfk_1` em `survey_id` referenciando `surveys(id)`. UPDATE NO ACTION; DELETE NO ACTION.
- FK `survey_attendances_ibfk_2` em `sector_id` referenciando `sectors(id)`. UPDATE NO ACTION; DELETE NO ACTION.
- FK `survey_attendances_ibfk_3` em `service_id` referenciando `services(id)`. UPDATE NO ACTION; DELETE NO ACTION.
- FK `survey_attendances_ibfk_4` em `shift_id` referenciando `shifts(id)`. UPDATE NO ACTION; DELETE NO ACTION.

### `survey_question_context`

Condição materializada, etapa e visibilidade. Dados de catálogo ou operação interna.

| Coluna | MySQL | Nulo | Padrão | Extras | Chaves |
| --- | --- | --- | --- | --- | --- |
| `question_id` | `char(36)` | NO | `NULL` | — | PK, FK |
| `stage_id` | `char(36)` | YES | `NULL` | — | FK |
| `stage_name` | `varchar(120)` | YES | `NULL` | — | — |
| `prerequisite_id` | `char(36)` | YES | `NULL` | — | FK |
| `expected_value` | `varchar(100)` | YES | `NULL` | — | — |
| `visible` | `tinyint(1)` | NO | `1` | — | — |

Índices: `prerequisite_id` (não único) em `prerequisite_id`; `PRIMARY` (único) em `question_id`; `stage_id` (não único) em `stage_id`.
- FK `survey_question_context_ibfk_1` em `question_id` referenciando `survey_questions(id)`. UPDATE NO ACTION; DELETE NO ACTION.
- FK `survey_question_context_ibfk_2` em `prerequisite_id` referenciando `survey_questions(id)`. UPDATE NO ACTION; DELETE NO ACTION.
- FK `survey_question_context_ibfk_3` em `stage_id` referenciando `stages(id)`. UPDATE NO ACTION; DELETE NO ACTION.

### `survey_questions`

Perguntas materializadas com versão e enunciado. Dados de catálogo ou operação interna.

| Coluna | MySQL | Nulo | Padrão | Extras | Chaves |
| --- | --- | --- | --- | --- | --- |
| `id` | `char(36)` | NO | `NULL` | — | PK |
| `survey_id` | `char(36)` | NO | `NULL` | — | FK |
| `attendance_id` | `char(36)` | YES | `NULL` | — | FK |
| `question_id` | `char(36)` | YES | `NULL` | — | FK |
| `question_version_id` | `char(36)` | YES | `NULL` | — | FK |
| `prompt_snapshot` | `text` | NO | `NULL` | — | — |
| `type_snapshot` | `varchar(30)` | NO | `NULL` | — | — |
| `required_snapshot` | `tinyint(1)` | NO | `NULL` | — | — |
| `display_order` | `int` | YES | `0` | — | — |
| `created_at` | `timestamp` | YES | `CURRENT_TIMESTAMP` | DEFAULT_GENERATED | — |

Índices: `PRIMARY` (único) em `id`; `snapshot_attendance_survey_fk` (não único) em `attendance_id, survey_id`; `snapshot_question_fk` (não único) em `question_id`; `snapshot_version_question_fk` (não único) em `question_version_id, question_id`; `survey_questions_by_order` (não único) em `survey_id, display_order, id`.
- FK `snapshot_attendance_survey_fk` em `attendance_id, survey_id` referenciando `survey_attendances(id, survey_id)`. UPDATE NO ACTION; DELETE NO ACTION.
- FK `snapshot_question_fk` em `question_id` referenciando `questions(id)`. UPDATE NO ACTION; DELETE NO ACTION.
- FK `snapshot_version_question_fk` em `question_version_id, question_id` referenciando `question_versions(id, question_id)`. UPDATE NO ACTION; DELETE NO ACTION.
- FK `survey_questions_ibfk_1` em `survey_id` referenciando `surveys(id)`. UPDATE NO ACTION; DELETE NO ACTION.
- FK `survey_questions_ibfk_2` em `attendance_id` referenciando `survey_attendances(id)`. UPDATE NO ACTION; DELETE NO ACTION.

### `surveys`

Registro de pesquisa, estado, nota geral e hash de acesso. Restrita. Hash de acesso e avaliação.

| Coluna | MySQL | Nulo | Padrão | Extras | Chaves |
| --- | --- | --- | --- | --- | --- |
| `id` | `char(36)` | NO | `NULL` | — | PK |
| `access_token_hash` | `char(64)` | NO | `NULL` | — | — |
| `status` | `enum('draft','in_progress','completed','expired')` | YES | `draft` | — | — |
| `started_at` | `datetime` | YES | `NULL` | — | — |
| `completed_at` | `datetime` | YES | `NULL` | — | — |
| `created_at` | `timestamp` | YES | `CURRENT_TIMESTAMP` | DEFAULT_GENERATED | — |
| `overall_rating` | `tinyint unsigned` | YES | `NULL` | — | — |

Índices: `access_token_hash` (único) em `access_token_hash`; `PRIMARY` (único) em `id`; `surveys_by_status_completion` (não único) em `status, completed_at, id`.

### `teams`

Equipes por setor e serviço. Dados de catálogo ou operação interna.

| Coluna | MySQL | Nulo | Padrão | Extras | Chaves |
| --- | --- | --- | --- | --- | --- |
| `id` | `char(36)` | NO | `NULL` | — | PK |
| `sector_id` | `char(36)` | YES | `NULL` | — | FK |
| `service_id` | `char(36)` | YES | `NULL` | — | FK |
| `name` | `varchar(120)` | NO | `NULL` | — | — |
| `description` | `text` | YES | `NULL` | — | — |
| `is_active` | `tinyint(1)` | YES | `1` | — | — |
| `created_at` | `timestamp` | YES | `CURRENT_TIMESTAMP` | DEFAULT_GENERATED | — |

Índices: `PRIMARY` (único) em `id`; `sector_id` (não único) em `sector_id`; `service_id` (não único) em `service_id`.
- FK `teams_ibfk_1` em `sector_id` referenciando `sectors(id)`. UPDATE NO ACTION; DELETE NO ACTION.
- FK `teams_ibfk_2` em `service_id` referenciando `services(id)`. UPDATE NO ACTION; DELETE NO ACTION.

### `user_notifications`

Avisos privados e leitura. Restrita ao titular.

| Coluna | MySQL | Nulo | Padrão | Extras | Chaves |
| --- | --- | --- | --- | --- | --- |
| `id` | `char(36)` | NO | `NULL` | — | PK |
| `user_id` | `char(36)` | NO | `NULL` | — | FK |
| `event_type` | `varchar(50)` | NO | `NULL` | — | — |
| `title` | `varchar(120)` | NO | `NULL` | — | — |
| `message` | `varchar(300)` | NO | `NULL` | — | — |
| `href` | `varchar(120)` | NO | `NULL` | — | — |
| `created_at` | `timestamp` | NO | `CURRENT_TIMESTAMP` | DEFAULT_GENERATED | — |
| `read_at` | `datetime` | YES | `NULL` | — | — |

Índices: `by_user_read_created` (não único) em `user_id, read_at, created_at`; `notifications_by_user_date` (não único) em `user_id, created_at, id`; `PRIMARY` (único) em `id`.
- FK `user_notifications_ibfk_1` em `user_id` referenciando `users(id)`. UPDATE NO ACTION; DELETE NO ACTION.

### `user_permissions`

Permissões específicas históricas, limitadas pelo perfil operacional. Dados de catálogo ou operação interna.

| Coluna | MySQL | Nulo | Padrão | Extras | Chaves |
| --- | --- | --- | --- | --- | --- |
| `user_id` | `char(36)` | NO | `NULL` | — | PK, FK |
| `permission_id` | `char(36)` | NO | `NULL` | — | PK, FK |

Índices: `permission_id` (não único) em `permission_id`; `PRIMARY` (único) em `user_id, permission_id`.
- FK `user_permissions_ibfk_1` em `user_id` referenciando `users(id)`. UPDATE NO ACTION; DELETE NO ACTION.
- FK `user_permissions_ibfk_2` em `permission_id` referenciando `permissions(id)`. UPDATE NO ACTION; DELETE NO ACTION.

### `user_sectors`

Escopo setorial dos colaboradores. Dados de catálogo ou operação interna.

| Coluna | MySQL | Nulo | Padrão | Extras | Chaves |
| --- | --- | --- | --- | --- | --- |
| `user_id` | `char(36)` | NO | `NULL` | — | PK, FK |
| `sector_id` | `char(36)` | NO | `NULL` | — | PK, FK |

Índices: `PRIMARY` (único) em `user_id, sector_id`; `sector_id` (não único) em `sector_id`.
- FK `user_sectors_ibfk_1` em `user_id` referenciando `users(id)`. UPDATE NO ACTION; DELETE NO ACTION.
- FK `user_sectors_ibfk_2` em `sector_id` referenciando `sectors(id)`. UPDATE NO ACTION; DELETE NO ACTION.

### `users`

Contas de colaboradores e hashes de senha. Restrita. Identificação do colaborador e hash.

| Coluna | MySQL | Nulo | Padrão | Extras | Chaves |
| --- | --- | --- | --- | --- | --- |
| `id` | `char(36)` | NO | `NULL` | — | PK |
| `role_id` | `char(36)` | NO | `NULL` | — | FK |
| `name` | `varchar(150)` | NO | `NULL` | — | — |
| `email` | `varchar(255)` | NO | `NULL` | — | — |
| `password_hash` | `varchar(255)` | NO | `NULL` | — | — |
| `is_active` | `tinyint(1)` | NO | `1` | — | — |
| `deleted_at` | `datetime` | YES | `NULL` | — | — |
| `created_at` | `timestamp` | YES | `CURRENT_TIMESTAMP` | DEFAULT_GENERATED | — |
| `updated_at` | `timestamp` | YES | `CURRENT_TIMESTAMP` | DEFAULT_GENERATED on update CURRENT_TIMESTAMP | — |

Índices: `email` (único) em `email`; `PRIMARY` (único) em `id`; `role_id` (não único) em `role_id`.
- FK `users_ibfk_1` em `role_id` referenciando `roles(id)`. UPDATE NO ACTION; DELETE NO ACTION.
