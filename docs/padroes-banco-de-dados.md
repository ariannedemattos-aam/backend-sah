# Padrões de banco de dados

O MySQL relacional facilita vínculos verificáveis entre catálogos, atendimentos, questionários versionados, respostas, escalas e manifestações. A transação de conclusão mantém a avaliação e o encaminhamento coerentes. Um modelo documental facilitaria mudanças no formato de um questionário, mas exigiria controles adicionais para cardinalidade, vínculo histórico, deduplicação e agregação cruzada. JSON no MySQL é usado para metadados de auditoria e nunca substitui as chaves de domínio centrais.

## Organização e integridade

- Tabelas e campos usam nomes em inglês, minúsculos e `snake_case`. IDs usuais são UUID em `CHAR(36)`; tabelas de vínculo usam chaves compostas quando a combinação identifica a linha.
- Catálogos e papéis são entidades separadas. O atendimento referencia setor, serviço e turno. Versões e opções são normalizadas separadamente; o snapshot duplica intencionalmente o enunciado e a visibilidade pactuada para preservar o questionário em andamento.
- A avaliação é uma entidade da pesquisa. Respostas são únicas por pergunta materializada; feedback, retorno e manifestação são únicos por pesquisa. A escala usa chave setor, data e turno. Um profissional vinculado deve pertencer ao mesmo setor.
- A migration 002 reforça os vínculos compostos de contexto e cria índices para filtros e estados. A 003 acrescenta papéis, escala, Ouvidoria e regras de jornada, com triagem histórica. Chaves e índices físicos extraídos do Aiven estão no [dicionário](modelo-de-dados-e-requisitos.md).
- Estados de catálogo são alterados por arquivamento e reativação. Alterações em regra ou pergunta mantêm o histórico. A troca de setor de equipe com escala ou de serviço já vinculado é bloqueada pelos controladores.
- A rotina de migrations usa conta com DDL e executa no schema conferido. A aplicação cotidiana usa conta distinta limitada a DML no schema. A migration 003 é reaplicável; o seed demo usa transação e não redefine senhas de contas que já existem.

## Reprodução segura

Use um MySQL 8 descartável, configure `.env` privado com as credenciais desse ambiente, valide o destino e execute `npm run migrate` e `npm run seed:demo`. O seed cria dados de demonstração e requer `ADMIN_PASSWORD` e `SECTOR_PASSWORD` locais. Mantenha o estado real do Aiven separado. Preserve no controle de versão `database/schema.sql`, `database/migrations/` e `scripts/`. Na entrega, o MySQL 8.4.13 usou um contêiner Docker local com porta de loopback dinâmica e armazenamento temporário. Duas execuções de migration e seed deixaram 39 tabelas, cinco perfis e duas contas fictícias. Consulte o [relatório de testes](plano-e-relatorio-de-testes.md).
