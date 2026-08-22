# Próximas Implementações e Roadmap: Kallia

Este documento registra as implementações recentes concluídas e as melhorias futuras planejadas para a evolução da plataforma **Kallia**.

---

## 🎯 Concluído Recentemente (Milestone PocketBase & Redis SaaS Monolith)

- [x] **Backend Integrado OpenSource (PocketBase)**: Migração do banco de dados e autenticação para o PocketBase com coleções parametrizadas (`users`, `projects`, `sessions`, `agents`, `contacts`, `call_history`, `call_transcripts`, `ai_providers`, `call_ratings`, `sent_polls`).
- [x] **Autenticação Google OAuth2 & E-mail**: Suporte nativo a login com Google OAuth2 e fluxo seguro de onboarding com criação automática de projeto trial e atribuição do papel `creator`.
- [x] **Whatsmeow SQLite Isolado por Sessão**: Armazenamento de credenciais e chaves criptográficas em arquivos SQLite locais (`./storage/whatsapp/{id}.db`), eliminando 100% da dependência de PostgreSQL.
- [x] **Gerenciamento de Fila & Concorrência com Redis 7**: Módulo de fila (`queue.go`) para controle de taxa de discagem outbound anti-bloqueio WhatsApp, semáforo de concorrência por plano e entrega assíncrona de webhooks com retries exponenciais e DLQ.
- [x] **Deploy Monolítico no Coolify**: `docker-compose.yml` otimizado contendo serviços `app`, `pocketbase` e `redis` com volumes compartilhados e persistentes em `./storage`.
- [x] **Auditoria de Segurança & Sizing SaaS**: Conformidade OWASP e dimensionamento para VPS Hostinger 16GB RAM (suportando 250+ sessões WhatsApp e 80-120 chamadas VoIP simultâneas).
- [x] **Autenticação JWT & Perfis (RBAC)**: Suporte aos papéis `appadmin` (superadministrador), `creator` (proprietário do tenant/projeto) e `normal` (operador de atendimento).
- [x] **API Keys por Conexão (`kc_*`)**: Geração automática de chaves únicas por sessão para consumo seguro por APIs externas.
- [x] **Agentes Especialistas & Hot-Swap (`TransferTo`)**: Suporte a personas distintas para chamadas *inbound* e *outbound*, e transferência de chamadas em tempo real entre agentes sem derrubar o canal VoIP.
- [x] **Mensagens Interativas com Botões (Multi-Device)**: Injeção automática de nós binários `biz` e `bot` via `whatsmeow` no Go para possibilitar exibição de botões interativos nativos enviados por contas pessoais MD.
- [x] **PocketBase como Banco Primário de Negócio & Sync Híbrido (20/08/2026)**: Centralização de Agentes, Contatos CRM, Projetos e Metadados no PocketBase com sincronia total Dev ↔ Prod e SQLite local isolado para VoIP whatsmeow.
- [x] **Sincronização em Tempo Real Go ↔ PocketBase (SSE /api/realtime) & Hidratação Dev/VPS (20/08/2026)**: Implementação de hidratação automática no boot e listener persistente de SSE em tempo real para sincronização bidirecional de Workspaces, Agentes, Configurações de IA, Provedores e Contatos entre VPS e ambiente de desenvolvimento local, com suporte a sessões em standby no Dev.
- [x] **Kallia 2.0: Workspaces & Conexões WhatsApp Desacopladas (20/08/2026)**: Redesenho do modelo de dados para adoção de Workspaces como Tenant raiz único no PocketBase (Direct SSOT). Desacoplamento total de instâncias WhatsApp (`whatsapp_connections`), preservando Agentes, Chaves de IA, CRM e Histórico caso linhas sejam desconectadas ou excluídas. Adição de controle de cotas por Plano (conexões, chamadas simultâneas, agentes) e Seletor de Workspace com troca ágil na UI.
- [x] **Consolidação e Limpeza do Esquema PocketBase (20/08/2026)**: Eliminação da tabela redundante `projects` em favor de `workspaces`. Migração de todas as chaves estrangeiras (`agents`, `ai_providers`, `contacts`, `call_history`, `sessions`) para pertencerem a `workspace_id`. Deduplicação de sessões no PocketBase com busca e patch atômico.
- [x] **Otimização e Limpeza Ponytail (20/08/2026)**: Poda de dependências não utilizadas (`github.com/jackc/pgx/v5` e submódulos), remoção de tabelas SQLite legadas de projetos, simplificação do bootstrap de admin e unificação de serialização JSON com `jsonFieldToString`. Redução de mais de 200 linhas de código e complexidade.
- [x] **Padronização e Alinhamento do SQLite Local com Workspaces (20/08/2026)**: Todas as tabelas operacionais locais no SQLite (`sessions`, `agents`, `ai_providers`, `contacts`, `call_history`, `call_ratings`, `call_transcripts`) migradas e alinhadas para a coluna `workspace_id`, com migração transparente de dados legados e compatibilidade retroativa com o PocketBase.
- [x] **Poda de Código Morto e Simplificação Ponytail (20/08/2026)**: Remoção de push de projetos legados no PocketBase sync, eliminação de métodos não utilizados e wrappers redundantes, e inlining de helpers desnecessários.
- [x] **Correção do Middleware de Arquivos Estáticos & SPA Fallback (20/08/2026)**: Isenção explícita de autenticação para todas as rotas estáticas frontend (`/`, `/favicon.ico`, `/assets/*`), endpoints de healthcheck (`/healthz`, `/ready`) e adição de handler SPA robusto para carregar o `index.html` em recarregamentos diretos de rotas.
- [x] **Consolidação do Modelo Direto PocketBase SSOT & Limpeza de Sincronizações Legadas (20/08/2026)**: Eliminação de loops redundantes de hidratação (`hydrateFromPocketBase`) e push (`pushAllLocalToPocketBase`), remoção de chamadas duplicadas de sincronização em SQLite, e transição definitiva para leitura/escrita direta no PocketBase com inicialização instantânea e reatividade SSE pura.
- [x] **Correção de Criação de Workspaces no PocketBase (20/08/2026)**: Ajuste das credenciais de fallback de admin no cliente PocketBase, formatação das datas no padrão RFC3339, fallback resiliente de criação com payload essencial e abertura das regras de API de coleções no `pb_schema.json` e migrações para comunicação direta do backend.
- [x] **Gestão de Sessões WhatsApp por Workspace & Hub de Configurações (20/08/2026)**: Centralização completa da gestão de conexões de WhatsApp dentro do Workspace ativo. Cabeçalho moderno com indicador de cotas de conexões do plano atual (ex: 0/1 Whats com barra de progresso visual), botão em destaque de Upgrade de Plano redirecionando para Assinaturas & Planos, bloqueio inteligente de limites com modal explicativo, e Modal completo de Configurações do Workspace (alterar nome em tempo real, seleção da linha WhatsApp padrão para discagem, convites e gestão de equipe/membros com papéis e exclusão segura).
- [x] **Consolidação e Limpeza dos Métodos de Autenticação (21/08/2026)**: Padronização definitiva da arquitetura em 3 métodos canônicos (JWT Bearer para Frontend/Painel, Chave de Conexão `kc_...` única por WhatsApp para automações externas como N8N/Typebot/Chatwoot, e Ticket de Uso Único / Query Param para SSE/WebSockets). Eliminação da chave mestra global desnecessária (`KALLIA_API_KEY`), remoção da tabela redundante `password_resets` do SQLite local e delegação 100% nativa de recuperação e gestão de usuários ao PocketBase (SSOT).
- [x] **Autorização Multi-Workspace & Resolução 403 de Sessões (21/08/2026)**: Implementação do verificador `userCanAccessSession` no backend Go, validando permissões de acesso através de todos os workspaces aos quais o usuário pertence, além de projetos padrão e SQLite/PocketBase, eliminando bloqueios indevidos de 403 Forbidden em rotas de IA, histórico, pareamento e NPS.
- [x] **Redesign Moderno & Mobile-First da Gestão de Conexões (21/08/2026)**: Reformulação da interface de Conexões do Workspace com eliminação de tags redundantes, introdução de badge pulsante de status, toolbar unificada de ações, pré-visualização de agentes vinculados e atalho direto para o Webphone.
- [x] **Preservação de Múltiplos Workspaces & Limite de 1 Workspace por Conta Normal (21/08/2026)**: Correção na associação de membros no PocketBase garantindo que workspaces existentes nunca desapareçam ao criar novos. Implementação da regra de negócio que restringe contas padrão a 1 único Workspace, liberando múltiplos workspaces exclusivamente para administradores (`appadmin`) ou contas com upgrade.
- [x] **Resolução Dinâmica de Chaves de IA & Correção de Status dos Agentes (21/08/2026)**: Integração da coleção `ai_providers` do PocketBase com fallback resiliente para SQLite e variáveis de ambiente no resolvedor de chaves de IA (`resolveAIProviderKey`), suporte transparente a chaves em texto claro e criptografadas, e atualização reativa do status do Agente Principal e Integração de Voz (`🟢 IA Ativa`).
- [x] **Unificação Definitiva do PocketBase como Banco de Dados Único (SSOT) (21/08/2026)**:
  - **Agentes Especialistas (`agents`)**: Correção do payload e filtros alinhados a `workspace_id`, persistência e listagem nativa no PocketBase com sincronia de cache local.
  - **Histórico de Chamadas (`call_history`)**: Persistência e listagem centralizada no PocketBase com gravação de timestamps, transcrições (`transcript`), resumo gerado por IA (`summary`), gravação (`recording_url`) e vínculo com agente (`agent_id`).
  - **Transcrições de Chamadas**: Transcrições completas pós-chamada sincronizadas diretamente no PocketBase.
  - **Configurações de IA da Sessão (`sessions.ai_config`)**: Modificação do `handleSetAIConfig` e `handleDeleteAIConfig` para persistir diretamente na coluna `ai_config` do registro de sessão no PocketBase.
  - **Avaliações & Pesquisa NPS (`call_ratings`)**: Persistência de notas, feedbacks e cálculo de métricas de NPS (Promotores, Detratores, Neutros e NPS Score) lidos diretamente do PocketBase.
- [x] **Sanitização de Segurança e Isolamento de Chaves de API (21/08/2026)**:
  - Isolamento estrito de todas as chaves de API exclusivamente dentro da coleção criptografada `ai_providers` (AES-256-GCM).
  - Sanitização automática (`parseAndSanitizeAIConfig`) removendo qualquer campo de chave (`geminiApiKey`, `apiKey`, `token`) antes de persistir em `agents.ai_config` ou `sessions.ai_config`.
  - Atualização do modelo Gemini Live padrão para `models/gemini-3.1-flash-live-preview` e descriptografia resiliente multi-chave com verificação de integridade.
- [x] **Sincronização Contínua de Metadados de Sessões (`sessions`) (21/08/2026)**:
  - Criação do método `UpsertSessionFullPB` e gatilho `s.syncToPocketBase` em todos os eventos de ciclo de vida (conexão/pareamento WhatsApp, alteração de JID, status de linha, webhook, chatwoot e configurações de IA).
  - Preenchimento e sincronização automática de `jid`, `phone_number`, `status` (`connected`/`disconnected`/`pairing`), `workspace_id`, `chatwoot` e `ai_config` no PocketBase.
- [x] **Sincronização de Contatos do CRM (`contacts`) no PocketBase (21/08/2026)**:
  - Implementação de persistência reativa no `upsertContact` e `updateContactManual` disparando `UpsertContactPB` diretamente para a coleção `contacts` do PocketBase.
  - Correção de mapeamento de chaves (`workspace_id` e `session_id`), busca resiliente e migração direta dos contatos locais existentes.
  - Resolução automática e enriquecimento de LIDs do WhatsApp (`@lid`) para o número de telefone real do contato (`phone`), vinculando simultaneamente `phone`, `lid` e `jid` no PocketBase.
  - Suporte e interceptação do identificador de **`@username`** da Meta/WhatsApp no modelo de dados do CRM (`contacts.username`), extraindo handles de nós binários, pushnames e status.
- [x] **Otimizações e Simplificação de Código (Ponytail Audit) (21/08/2026)**:
  - Substituição de loops manuais por funções nativas da standard library Go: `bytes.Equal` e `slices.Contains`.
  - Eliminação de goroutines ociosas em `ScheduleNPS` migrando para `time.AfterFunc`.
  - Unificação de helpers de normalização de telefone (`normalizePhone`) e remoção de wrappers redundantes.
- [x] **Correção de Persistência de Configurações de IA e Desduplicação de Especialistas (21/08/2026)**:
  - Correção na desserialização de eventos SSE Realtime do PocketBase (`jsonFieldToString`), impedindo que campos JSON (`ai_config` e `chatwoot`) fossem sobrescritos como string vazia.
  - Correção do filtro de busca por `sid` em `UpdateSessionAIConfigPB`.
  - Separação clara entre **Agente Principal** (Inbound Master mantido em `sessions.ai_config`) e **Agentes Especialistas** (Secundários/Outbound em `agents`), eliminando a duplicidade do Agente Principal na listagem de especialistas.
- [x] **Página de Perfil do Usuário & Badge de Superadmin na Sidebar (21/08/2026)**:
  - Criação da página completa [`ProfilePage.tsx`](file:///c:/Users/khara/Desktop/APPS%20GRAVITY/Kallia/Kallia%20Call/client/src/pages/ProfilePage.tsx) com 4 abas estruturadas: **Visão Geral & Dados** (edição de nome, avatar presets ou URL), **Meus Workspaces** (listagem e troca rápida de workspace ativo), **Segurança & Senha** (alteração de senha integrada ao PocketBase) e **Plano & Limites** (capacidade e consumo do workspace).
  - Atualização do card de rodapé em [`Sidebar.tsx`](file:///c:/Users/khara/Desktop/APPS%20GRAVITY/Kallia/Kallia%20Call/client/src/components/layout/Sidebar.tsx) com navegação ao perfil ao clicar, isolamento de eventos em Logout/Tema e Badge compacto de **Superadmin** com ícone de Coroa âmbar (`Crown`) 100% responsivo e contido no card.
- [x] **Painel Admin Global & Isolamento Estrito de "Meus Workspaces" (21/08/2026)**:
  - **Isolamento de Workspaces**: A aba "Meus Workspaces" agora lista estritamente apenas os workspaces aos quais o usuário pertence diretamente (seja como Criador ou Convidado), inclusive para Superadmins.
  - **Tags Diferenciadas no Card**: Exibição visual de tags `👑 Criador` vs `👥 Convidado` em cada workspace na aba "Meus Workspaces".
  - **Painel Admin Global**: Aba exclusiva para Superadmins renomeada para **"Painel Admin Global"**, incluindo a nova coluna **"Criador / Proprietário"** com avatar, nome e e-mail do criador de cada workspace na tabela global.
  - Endpoints de backend em [`httpapi.go`](file:///c:/Users/khara/Desktop/APPS%20GRAVITY/Kallia/Kallia%20Call/cmd/server/httpapi.go) protegidos por RBAC (`/api/admin/overview`, `/api/admin/users`, `/api/admin/users/{uid}/role`, `/api/admin/workspaces`, `/api/admin/workspaces/{wid}`).
- [x] **Acesso e Administração de Workspaces Globais por Superadmins (21/08/2026)**:
  - No **Painel Admin Global** ([`ProfilePage.tsx`](file:///c:/Users/khara/Desktop/APPS%20GRAVITY/Kallia/Kallia%20Call/client/src/pages/ProfilePage.tsx)), o Superadmin agora pode clicar diretamente em qualquer linha de workspace ou no botão **"Acessar"** para visualizar e gerenciar o workspace de terceiros exatamente como o proprietário.
  - Atualização do store [`workspace.ts`](file:///c:/Users/khara/Desktop/APPS%20GRAVITY/Kallia/Kallia%20Call/client/src/stores/workspace.ts) para preservar a seleção do workspace administrado pelo Superadmin sem ser sobreposto por requisições locais.
  - Redirecionamento automático para a tela de conexões e notificação toast de confirmação do modo de administração ativa.
- [x] **Correção de Despedida Obrigatória por Voz (`hangup`) e Envio de Resumo/Transcrição Pós-Chamada (21/08/2026)**:
  - **Despedida Obrigatória**: Atualizada a declaração da tool `hangup` e o system prompt em [`ai_agent.go`](file:///c:/Users/khara/Desktop/APPS%20GRAVITY/Kallia/Kallia%20Call/cmd/server/ai_agent.go), [`gemini_live.go`](file:///c:/Users/khara/Desktop/APPS%20GRAVITY/Kallia/Kallia%20Call/cmd/server/gemini_live.go), [`grok_live.go`](file:///c:/Users/khara/Desktop/APPS%20GRAVITY/Kallia/Kallia%20Call/cmd/server/grok_live.go) e [`aiconfig.go`](file:///c:/Users/khara/Desktop/APPS%20GRAVITY/Kallia/Kallia%20Call/cmd/server/aiconfig.go) tornando mandatório que a IA fale em voz alta uma despedida completa antes de invocar `hangup`.
  - **Buffer de Drenagem de Áudio**: Adicionado delay de segurança no encerramento da chamada para garantir que o áudio de despedida seja totalmente transmitido ao WhatsApp antes da finalização da sessão.
  - **Persistência de Transcrição e Resumo**: Corrigida condição de corrida onde `closeCurrentProvider()` zerava o provedor antes da captura das linhas de transcrição em `Detach()`. Agora o `ServerAIAgent` acumula `transcriptLines` em tempo real e entrega para geração do resumo e salvamento no banco/envio via WhatsApp.

---

## 🚀 Próximas Implementações (Roadmap)

1. **Relatórios Avançados de Performance de Agentes**:
   - Métricas de NPS acumulado por agente especialista.
   - Análise de sentimentos e tempo médio de atendimento (TMA) das ligações operadas por IA.

3. **Integração de Provedores de Voz Adicionais**:
   - Opção de fallback para ElevenLabs / OpenAI Realtime API além do Google Gemini Live e xAI Grok.

4. **Gravação Dual-Channel na Nuvem (S3 / R2)**:
   - Exportação automática dos arquivos WAV de gravação de áudio para buckets S3 ou Cloudflare R2 para economizar espaço de disco no VPS.
