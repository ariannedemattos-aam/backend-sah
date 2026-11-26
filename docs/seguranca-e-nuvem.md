# Segurança, privacidade e nuvem

## Controles verificados

| Controle | Implementação e evidência |
| --- | --- |
| Sessão e credenciais | Bcrypt (custo 12). JWT HS256 com emissor, audiência, expiração e separação de access/refresh. Refresh rotativo com hash no banco, prazo absoluto e revogação no logout. O servidor consulta sessão e direitos atuais. |
| Web | Cookies HttpOnly, SameSite Strict e Secure em produção. Vercel encaminha as rotas web de autenticação. Helmet, CSP, CORS do domínio autorizado, limite JSON de 100 KB e limites por IP. |
| Dados | SQL parametrizado via mysql2. UUIDs, enumerações e entradas validadas com Zod. Respostas de erro omitem SQL e credenciais. Texto livre editorial exibido como texto e filtrado por padrões de contato onde aplicável. |
| Setores | A API combina perfil e permissões. Escala e propostas consultam `user_sectors`. Feedback de pesquisa multissetorial é restrito ao setor com autorização para todos os atendimentos relevantes. |
| Contatos | Separados em `return_requests`. Acesso sob demanda, com permissão específica e auditoria. Avisos e relatórios agregados não incluem contato. Texto livre escrito espontaneamente ainda pode identificar alguém. |
| Pesquisa e convite | Token de pesquisa aleatório próprio, guardado com hash. Convites têm hash, expiração e uso único transacional; links de setores não dão acesso às respostas. |
| Socket e TV | Handshake e revalidação de sessão. Dashboard autorizado recebe o tipo do evento. Notificações usam destinatário individual. TV pública acessa agregados com mínimo configurável. |
| Transporte e privilégios MySQL | Aiven com CA e verificação de identidade. Privilégios do usuário em execução limitados a SELECT, INSERT, UPDATE e DELETE no schema demonstrativo. |
| Dependências | Auditoria de produção pelo npm registrou zero alertas no momento da execução documentada. Isso cobre os avisos conhecidos no recorte executado. |

## Infraestrutura e recuperação

Vercel serve os ativos React, mantém o proxy web e aponta para a API. O Render executa o Node.js e termina HTTPS. O banco MySQL no Aiven persiste os dados independentemente dos deployments. Guarde os IDs dos releases estáveis e reverta o frontend por promoção e a API pelo histórico do serviço. Verifique a compatibilidade das migrations aditivas antes da reversão. A periodicidade e a recuperação física de backups da conta não foram testadas.

A demonstração usa os serviços existentes. Para uso institucional com dados reais, valide elegibilidade, contrato, retenção, backup, monitoração, rotação de segredos, avaliação de privacidade e resposta a incidentes antes de disponibilizar a interface. A instalação de outro hospital exige segregação de banco, domínio, segredos e contas. Não há atestado LGPD, auditoria de intrusão ou garantia de conformidade WCAG.

## Configuração

Use `.env.example` como modelo e armazene segredos em arquivo privado local ou no painel do serviço. O ambiente Run usa porta dinâmica, URL autorizada, JWT e conexão TLS. Os navegadores enviam somente Bearer ou cookie próprio conforme a operação. A conta de avaliação deve ser fictícia e compartilhada por canal separado. Nenhuma mensagem externa é necessária para demonstrar convites.
