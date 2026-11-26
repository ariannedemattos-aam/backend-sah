# Padrões Git e autoria

| Área | Original | Fork de demonstração | Branch publicada |
| --- | --- | --- | --- |
| API | [EclySolar/backend-sah](https://github.com/EclySolar/backend-sah) | [ariannedemattos-aam/backend-sah](https://github.com/ariannedemattos-aam/backend-sah) | `main` |
| Web | [EclySolar/Frontend-fhod](https://github.com/EclySolar/Frontend-fhod) | [ariannedemattos-aam/Frontend-fhod](https://github.com/ariannedemattos-aam/Frontend-fhod) | `deploy/demo` |

As cópias locais usam `main` com `origin` voltado ao upstream. A publicação envia explicitamente ao fork. Preserve commits e prefira alterações incrementais. O histórico recente tem mensagens descritivas no imperativo, enquanto o histórico original também registra importações e ajustes. O [PR #1 do frontend original](https://github.com/EclySolar/Frontend-fhod/pull/1) é o PR anteriormente verificado. A exportação final registra a consulta de PRs e branches.

## Créditos

- **Igor Gabriel Morgenstern** figura como `EclySolar` na autoria Git do histórico original. Foram preservados hashes, datas e autoria.
- **Arianne Arruda de Mattos** é a identidade de autoria dos commits recentes. Por declaração da equipe, a identidade técnica anteriormente usada na integração e hospedagem corresponde a Arianne. O `.mailmap` associa `FHOOD Deployment <deployment@fhdod.example>` a `ariannearruda <ariannearruda07@gmail.com>`. O arquivo normaliza a apresentação em ferramentas Git compatíveis; os campos originais e os hashes são preservados.
- Evidências são vinculadas a arquivos e mudanças identificáveis. Contagem de commits mede registros Git e é insuficiente para inferir participação individual em atividades externas.

## Conferência e publicação

```sh
git status --short
git log --format='%H %aI %aN <%aE> %s' --name-status
git shortlog -sne HEAD
git diff --cached --check
```

Prepare somente arquivos compartilháveis. Separe credenciais, arquivos de ambiente reais e certificados locais. No Render e na Vercel confira o commit ou ID de deployment publicado; guarde o último release validado. Na Vercel, percorra o fluxo em uma versão preparada antes de promover o domínio, quando aplicável. Para revisão acadêmica, veja o [quadro retrospectivo](kanban-retrospectivo.md).
