# Plano e relatório de testes

## Estratégia

Testes unitários verificam validação, condição, renderização e contrato; testes de integração usam fixtures fictícias e exercitam MySQL, rotas e permissões. Playwright/Chrome verifica navegador publicado e axe complementa a análise. Use o [mapa de requisitos](requisitos.md) para rastrear cobertura de comportamento.

## Cobertura medida

| Unidade | Linhas | Declarações | Ramos | Funções |
| --- | ---: | ---: | ---: | ---: |
| API | 37,05% | 33,79% | 17,28% | 13,8% |
| Web | 11,75% | 11,75% | 53,73% | 14,78% |

Medições pertencem às suítes instrumentadas Jest e Vitest/V8. A suíte externa de integração, Chrome, Docker e a prova em produção não compõem esses percentuais. Em particular, a cobertura de linhas da interface deixa parte relevante do código sem instrumentação unitária. Os relatórios HTML e JSON completos acompanham o pacote acadêmico.

## Casos e evidências

| ID | Requisito | Objetivo | Cenário | Esperado | Obtido | Situação | Evidência | Correção | Reteste |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| TF-01 | RF-01 | QR setorial | Decodificar PNG e comparar à URL do setor | URL igual e acesso preselecionado | Comparação feita com jsQR | Executado | navegador-producao.json | — | Ver resultado obtido |
| TF-02 | RF-02 | Uso único | Criar convite fictício, usar uma vez e tentar novamente | Primeiro resgate válido e segundo 409 | Resgate e bloqueio conferidos | Executado | navegador-producao.json | — | Ver resultado obtido |
| TF-03 | RF-03 | Conclusão e confirmação | Omitir nota na API e depois concluir no navegador | 422 sem nota; confirmação após nota válida | Confirmação conferida no reteste final publicado | Executado | navegador-producao.json | Observou-se persistência sem confirmação visível em duas tentativas; ajuste de transição após limpar o contexto. | Confirmação conferida no reteste final publicado |
| TF-04 | RF-04, RF-10 | Condição e versão | Propor/aprovar, responder pré-requisito, editar após início | Versão inicial mantida; pergunta ocultada quando condição deixa de valer | Integração local e pública passou | Executado | integracao-publicada.json | — | Ver resultado obtido |
| TF-05 | RF-05, RF-06 | Feedback e retorno | Preencher textos fictícios, passar por retorno voluntário e verificar caso | Feedback compatível e autorização de contato | Caso e retorno registrados e conferidos | Executado | navegador-producao.json | — | Ver resultado obtido |
| TF-06 | RF-08 | Filtros do dashboard | Aplicar setor, turno, equipe e período; verificar total | Opções autorizadas; agregados restritos ao atendimento | Total 3 no filtro de equipe e zero no período de conclusão incompatível | Executado | integracao-publicada.json | Filtros unificados e DTO protegido de opções. | Ver resultado obtido |
| TF-07 | RF-09 | Escala e anonimato | Associar profissional, incluir três avaliações e verificar grupo | Média apenas a partir de três; agregado sem profissionais | Média 6/10 na integração; área de gestão conferida | Executado | integracao-publicada.json | — | Ver resultado obtido |
| TF-08 | RF-06, RF-11 | Fila e histórico | Criar caso, registrar providência, abrir contato autorizado e testar status | Gestão recebe 403 no contato e não se encerra caso com retorno pendente | Integração e captura de histórico passaram | Executado | integracao-publicada.json | — | Ver resultado obtido |
| TF-09 | RF-12, RF-14 | Sinal de atualização e TV | Examinar estrutura pública da TV e central interna | Painel sem dados individuais; sinal privado sem identificador | TV validada no navegador. Sinal sem ID registrado no bloco anterior, caminho preservado | Executado | navegador-producao.json | — | Ver resultado obtido |
| TF-10 | RF-13 | Exportação | Baixar e abrir Excel e PDF com filtros | Arquivo analisável e critério de nota no PDF | Ambos abertos no reteste e arquivo filtrado conferido | Executado | exportacao-demonstracao.xlsx, exportacao-demonstracao.pdf | — | Ambos abertos no reteste e arquivo filtrado conferido |
| TF-11 | RNF-01 | Permissões e revogação | Cinco perfis, oito grupos de rotas, troca de perfil | 40 decisões corretas, 403 fora de escopo e token antigo recusado | Integração final em produção passou | Executado | integracao-publicada.json | — | Ver resultado obtido |
| AC-01 | RNF-02 | Acessibilidade | Axe, foco, setas, saída e três classes de viewport mais TV | Zero violações detectadas nas telas e interação possível por teclado | 17 estados automatizados, 0 violações detectadas. Leitor de tela manual fica em AC-02. | Executado | navegador-producao.json | Atalho para conteúdo e erros de campos vinculados. | Ver resultado obtido |
| SEG-01 | RNF-01, RNF-03 | Sessão e segredos | Cookie, logout, CORS, npm audit e objetos Git | Cookie seguro; logout 204 e acesso anterior 401; sem achados de segredos no escopo | Cookie HttpOnly/Secure/SameSite Strict; logout 204 e acesso revogado 401. Produção npm sem alertas e scan Git sem matches no escopo. | Executado | rechecagem-seguranca-e-deploy.json | — | Ver resultado obtido |
| DB-01 | RNF-03 | Instalação limpa e integridade | MySQL 8.4 descartável, executar migration e seed duas vezes | 39 tabelas, cinco perfis e duas contas fictícias | Confirmado em MySQL 8.4.13 local e TLS checado no remoto | Executado | mysql-limpo.json | — | Ver resultado obtido |
| API-01 | RNF-04 | OpenAPI | Validar contrato e comparar com rotas montadas | Operações sem diferenças e Swagger 200 | 100 operações e Swagger 1.8.0 | Executado | openapi-publicado.json | — | Ver resultado obtido |
| DEP-01 | RNF-05 | Deploy e saúde | Conferir frontend, backend, Swagger e release anterior | HTTP 200 em cada endereço e recuperação registrada | Todos os endereços públicos conferidos. Backup físico permanece fora do ensaio. | Executado | rechecagem-seguranca-e-deploy.json | — | Ver resultado obtido |
| DOC-01 | RNF-06 | Isolamento futuro | Revisar arquitetura de uma instituição | Requisitos futuros indicados, sem habilitar multitenancy | Documentado em arquitetura-backend.md | Executado | Arquitetura | — | Ver resultado obtido |
| AC-02 | RNF-02 | Leitor de tela manual | Ouvir sequência, rótulos e avisos em leitor real | Sem bloqueios nos fluxos público e interno | Planejado; não executado nesta estação | Planejado | Pendência de validação | — | Ver resultado obtido |

## Reprodução e limites

Backend: `npm run test:coverage -- --coverageReporters=text-summary --coverageReporters=json-summary --coverageReporters=html`. Frontend: `npm test -- --coverage --coverage.reporter=text-summary --coverage.reporter=json-summary --coverage.reporter=html` e `npm run build`. Para a integração, o arquivo `tests/integration/operations.mjs` verifica banco de demonstração e TLS antes de usar fixtures. O teste de instalação limpa executou `npm run migrate` e `npm run seed:demo` duas vezes em Docker local isolado. Consulte o plano do banco.

Axe cobre regras implementadas pelo analisador. O teste manual de leitor de tela e a restauração de backup remoto permanecem pendentes. Falhas iniciais de espera, seletores e tempo de exportação estão registradas separadamente da execução final.
