# Kanban retrospectivo

Este quadro reconstrói atividades a partir de fontes e resultados verificáveis. Os estados correspondem à avaliação atual do pacote. Datas históricas de movimentação, atribuições individuais e revisões não foram inferidas.

A consulta aos repositórios e PRs funcionou. A credencial Git retornou os escopos `gist, repo, workflow`; a consulta de Projects v2 respondeu `INSUFFICIENT_SCOPES`. A consulta pública de perfis anterior não exibiu projetos. A existência de um quadro privado não foi confirmada. O GitHub CLI estava indisponível na estação.

## Habilitar o GitHub Projects

1. Instale o GitHub CLI se desejar usar terminal. Em Windows, o pacote oficial está disponível como `winget install --id GitHub.cli`.
2. Autentique-se com a conta que pode administrar o projeto usando `gh auth login --hostname github.com --web --scopes project`. Caso já esteja autenticado no CLI, use `gh auth refresh -h github.com -s project`.
3. Autorize no navegador. Use `gh project list --owner @me` e confirme se há quadro relacionado aos repositórios. Para consultas apenas, `read:project` basta. Se houver quadro original acessível, preserve-o.
4. Se não houver quadro, use **GitHub → perfil → Projects → New project → Board**. Configure o campo de status com Backlog, A fazer, Em desenvolvimento, Em validação e Concluído. Use os cartões CSV como roteiro de importação ou inclusão. Valide a visibilidade antes de compartilhar.
5. Preserve a indicação “reconstrução retrospectiva”, use somente links do pacote ou do GitHub e evite credenciais nos cartões.

Referência de autenticação e permissões. [GitHub Projects API](https://docs.github.com/en/issues/planning-and-tracking-with-projects/automating-your-project/using-the-api-to-manage-projects) · [GitHub CLI](https://cli.github.com/manual/gh_auth_refresh)

## Inventário de cartões

- KB-01 · Concluído · **Mapear jornada e papéis**. IDs RF/RNF, critérios e matriz de rastreabilidade
- KB-02 · Concluído · **Acesso público e estados de toque**. QR setorial, formulário em passos e despedida [Evidência](https://github.com/ariannedemattos-aam/Frontend-fhod/commit/37ea59f)
- KB-03 · Concluído · **Finalizar filtros e foco**. Filtros, link de atalho de teclado e mensagens de campo [Evidência](https://github.com/ariannedemattos-aam/Frontend-fhod/commit/643ae03)
- KB-04 · Concluído · **Concluir contrato do dashboard**. Métodos montados e OpenAPI validado [Evidência](https://github.com/ariannedemattos-aam/backend-sah/commit/5a4c763)
- KB-05 · Concluído · **Modelar escalas e Ouvidoria**. Migration aditiva, dicionário físico e vínculos [Evidência](https://github.com/ariannedemattos-aam/backend-sah/commit/ebd7b8d)
- KB-06 · Concluído · **Publicar nos ambientes existentes**. Domínios e IDs de recuperação documentados [Evidência](https://fhdod-ouvidoria-demo.vercel.app)
- KB-07 · Concluído · **Validar perfis e minimizar eventos**. Escopo, revogação, contato auditado e sinal Socket sem ID [Evidência](https://github.com/ariannedemattos-aam/backend-sah/commit/acf9c11)
- KB-08 · Concluído · **Medir cobertura e registrar limites**. Jest, Vitest, integração e evidências em navegador
- KB-09 · Concluído · **Publicar documentação técnica**. READMEs, diagramas, guias e manual
- KB-10 · Em validação · **Revisão acadêmica final**. Revisar material e acessibilidade na estação de apresentação
- KB-11 · A fazer · **Validar manualmente com leitor de tela**. Percorrer fluxo público e protegido com NVDA/Narrator
- KB-12 · Backlog · **Montar protótipo editável no Figma**. Usar tokens, componentes, frames e screenshots como insumos
- KB-13 · A fazer · **Publicar quadro em GitHub Projects**. Depende de escopo project e autorização do proprietário do quadro
- KB-14 · Backlog · **Diagramar e revisar a edição acadêmica**. Materiais editáveis preparados para decisão da equipe
- KB-15 · Concluído · **Registrar a contribuição original rastreável**. PR original existente, aberto conforme API. Nenhuma revisão adicional foi inferida. [Evidência](https://github.com/EclySolar/Frontend-fhod/pull/1)
