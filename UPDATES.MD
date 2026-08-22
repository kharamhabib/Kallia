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
- [x] **Persistência Centralizada no PocketBase (SSOT) de Transcrições e Resolução de Nomes de Contato (21/08/2026)**:
  - **Upsert Seguro de Transcrição no PocketBase**: Atualizados `SaveCallHistoryPB`, `UpdateCallTranscriptPB` e `UpdateCallSummaryPB` em [`pocketbase_client.go`](file:///c:/Users/khara/Desktop/APPS%20GRAVITY/Kallia/Kallia%20Call/cmd/server/pocketbase_client.go) com proteção contra sobrescrita de dados existentes (`[]` vazios) e criação garantida do registro com a transcrição completa no PocketBase.
  - **Leitura Resiliente de Transcrições**: `GetCallTranscriptPB` e o endpoint `/transcript` agora decodificam de forma flexível strings JSON ou arrays nativos armazenados na coleção `call_history` do PocketBase com sincronização reversa para o SQLite.
  - **Resolução e Auto-Sync de Contatos**: Implementado `GetContactByPhonePB` no cliente PocketBase e integrado em `resolveContactName` ([`httpapi.go`](file:///c:/Users/khara/Desktop/APPS%20GRAVITY/Kallia/Kallia%20Call/cmd/server/httpapi.go)), garantindo que nomes resolvidos (como *"Kallia CRM"*) sejam sincronizados no PocketBase e SQLite em vez de ficarem como *"Contato WhatsApp"*.
- [x] **Persistência Completa de Metadados de Chamadas no PocketBase (`workspace_id`, `agent_id`, `recording_url`, `transcript`) (21/08/2026)**:
  - **Resolução de `workspace_id`**: Adicionado `getWorkspaceID()` em [`session.go`](file:///c:/Users/khara/Desktop/APPS%20GRAVITY/Kallia/Kallia%20Call/cmd/server/session.go) e [`httpapi.go`](file:///c:/Users/khara/Desktop/APPS%20GRAVITY/Kallia/Kallia%20Call/cmd/server/httpapi.go), garantindo que o identificador real do workspace seja propagado para o `CallRecord` e nunca caia como `"default"`.
  - **Identificação e Hot-Sync de `agent_id`**: Adicionados métodos `resolveDefaultAgentID`, `SetAgentID` e `UpdateCallAgentPB`, associando o ID do agente atendente (principal ou especialista) tanto na inicialização quanto nas transferências de chamada.
  - **Sincronização Atômica de `recording_url`**: Eliminada condição de corrida onde `AddStateListener` encerrava o registro antes do fechamento do arquivo de áudio. Implementados `b.saveRecording` no broker e `HistoryPersister.SaveRecording` no `pgHistoryPersister`, garantindo que a URL `/api/sessions/{sid}/recordings/{callId}` seja propagada atômica e confiavelmente ao PocketBase e SQLite logo após a finalização do arquivo WAV.
  - **Proteção Contra Sobrescrita no `SaveCallHistoryPB`**: Adicionado guardião no PocketBase client preservando valores existentes de transcrições, resumos, gravações e agentes contra patches parciais.
- [x] **Correção do Cabeçalho de Áudio WAV, Persistência Garantida do Transcript e Eliminação de Fala Repetida (21/08/2026)**:
  - **Correção do Cabeçalho e Reprodução de Áudio WAV**: Corrigido bug crítico em [`recorder.go`](file:///c:/Users/khara/Desktop/APPS%20GRAVITY/Kallia/Kallia%20Call/cmd/server/recorder.go) onde a gravação inicial escrevia o cabeçalho WAV de 44 bytes via `WriteAt` sem reposicionar o cursor de escrita do arquivo (`f.Seek(44, io.SeekStart)`), fazendo com que os primeiros bytes de áudio PCM sobrescrevessem o cabeçalho WAV corrompendo a reprodução nos players HTML5.
  - **Transcript no Ciclo de Vida do CallRecord**: Adicionado o campo `Transcript []TranscriptLine` ao `CallRecord` em [`broker.go`](file:///c:/Users/khara/Desktop/APPS%20GRAVITY/Kallia/Kallia%20Call/cmd/server/broker.go) e implementado `Broker.saveTranscript` integrado a `HistoryPersister.SaveTranscript` e `SaveCall`, garantindo que o diálogo completo seja propagado ao PocketBase e SQLite sem risco de sobrescrita concorrente por chamadas assíncronas de encerramento.
  - **Eliminação de Despedida Repetida**: Refinado o prompt de instrução de encerramento em [`ai_agent.go`](file:///c:/Users/khara/Desktop/APPS%20GRAVITY/Kallia/Kallia%20Call/cmd/server/ai_agent.go), [`aiconfig.go`](file:///c:/Users/khara/Desktop/APPS%20GRAVITY/Kallia/Kallia%20Call/cmd/server/aiconfig.go), [`gemini_live.go`](file:///c:/Users/khara/Desktop/APPS%20GRAVITY/Kallia/Kallia%20Call/cmd/server/gemini_live.go) e [`grok_live.go`](file:///c:/Users/khara/Desktop/APPS%20GRAVITY/Kallia/Kallia%20Call/cmd/server/grok_live.go) instruindo o modelo a emitir uma única despedida natural e acionar a tool `hangup` simultaneamente no mesmo turno, impedindo a fala dupla consecutiva observada nos logs.
- [x] **Download Automático de Mídias Recebidas, Endpoint HTTP e Retenção com Limpeza de Disco (22/08/2026)**:
  - **Download e Descriptografia Automática no Whatsmeow**: Em [`session.go`](file:///c:/Users/khara/Desktop/APPS%20GRAVITY/Kallia/Kallia%20Call/cmd/server/session.go) (`pgPushIncoming`), todas as mídias recebidas (fotos, áudios, vídeos e documentos) são automaticamente descriptografadas da rede do WhatsApp via `s.getClient().Download` e salvas no disco local em `storage/media/{wid}/{msgID}.{ext}`.
  - **Gerenciador de Mídia & Endpoint HTTP Otimizado**: Criado [`media_storage.go`](file:///c:/Users/khara/Desktop/APPS%20GRAVITY/Kallia/Kallia%20Call/cmd/server/media_storage.go) e rota `GET /api/media/{wid}/{fileName}` em [`httpapi.go`](file:///c:/Users/khara/Desktop/APPS%20GRAVITY/Kallia/Kallia%20Call/cmd/server/httpapi.go) com proteção contra path-traversal e cabeçalhos de cache `Cache-Control: public, max-age=86400`, permitindo que os áudios e imagens recebidos carreguem e toquem instantaneamente.
  - **Motor de Retenção e Limpeza Automática de Disco (`StartMediaCleaner`)**: Inicializado em [`main.go`](file:///c:/Users/khara/Desktop/APPS%20GRAVITY/Kallia/Kallia%20Call/cmd/server/main.go) com rotina diária que varre `storage/media/` e remove arquivos mais antigos que o período configurado (padrão de 30 dias via `KALLIA_MEDIA_RETENTION_DAYS`), evitando o esgotamento do disco do VPS e preservando o histórico de texto no PostgreSQL.
  - **Renderização Visual Completa no Chat (`ChatTimeline.tsx`)**: Exibição imediata de miniaturas de fotos com Lightbox, player de áudio sincronizado com duração real, visualizador de vídeos com controles e download de PDFs/documentos.
- [x] **Ajuste de Altura Exata da Tela, Responsividade Mobile & Correção de Áudio WhatsApp (22/08/2026)**:
  - **Encaixe Exato na Altura da Tela (Sem Scroll Externo)**: Em [`AppShell.tsx`](file:///c:/Users/khara/Desktop/APPS%20GRAVITY/Kallia/Kallia%20Call/client/src/components/layout/AppShell.tsx), o container principal `<main>` agora detecta `activeSection === "conversations"` e remove padding (`p-0`) e scroll externo (`overflow-hidden h-full`), fazendo com que o Chat ocupe 100% da área útil da janela sem transbordar para baixo.
  - **Responsividade Mobile & Botão Voltar**: Em [`ConversationsPage.tsx`](file:///c:/Users/khara/Desktop/APPS%20GRAVITY/Kallia/Kallia%20Call/client/src/pages/ConversationsPage.tsx) e [`ChatHeader.tsx`](file:///c:/Users/khara/Desktop/APPS%20GRAVITY/Kallia/Kallia%20Call/client/src/components/domain/chat/ChatHeader.tsx), telas móveis alternam perfeitamente entre a lista de conversas e o chat individual com botão `← Voltar`.
  - **Largura Equilibrada da Barra Lateral (`w-72 lg:w-80`)**: Reduzida a largura da lista de conversas para dar mais espaço à linha do tempo e ao painel lateral de contato.
  - **Compactação e Flexibilidade dos Botões do Header**: No [`ChatHeader.tsx`](file:///c:/Users/khara/Desktop/APPS%20GRAVITY/Kallia/Kallia%20Call/client/src/components/domain/chat/ChatHeader.tsx), os botões de ação (*IA*, *Tags*, *Ligar*, *Resolver* e *Gaveta*) agora possuem encolhimento responsivo (`shrink-0`, textos ocultos em telas compactas), impedindo que o nome ou telefone do contato sejam esmagados ao abrir o painel lateral.
  - **Botão Fechar no Painel de Contato**: Adicionado botão `X` no topo de [`ContactDetailsDrawer.tsx`](file:///c:/Users/khara/Desktop/APPS%20GRAVITY/Kallia/Kallia%20Call/client/src/components/domain/chat/ContactDetailsDrawer.tsx) para fechamento rápido do painel lateral.
  - **Correção da Codificação de Áudio/PTT no WhatsApp**: No [`ChatInputBar.tsx`](file:///c:/Users/khara/Desktop/APPS%20GRAVITY/Kallia/Kallia%20Call/client/src/components/domain/chat/ChatInputBar.tsx), adicionada detecção dinâmica de mimetypes suportados pelo navegador (`audio/ogg`, `audio/mp4`, `audio/webm`) e, em [`conversations.go`](file:///c:/Users/khara/Desktop/APPS%20GRAVITY/Kallia/Kallia%20Call/cmd/server/conversations.go), a flag PTT agora respeita o container correto, corrigindo a falha de reprodução de áudios no aplicativo WhatsApp.
- [x] **Resolução de LID do WhatsApp & Integração Unificada da Aba de Contatos (22/08/2026)**:
  - **Conversão Automática de LID (@lid) para Número Real de Telefone**: Em [`session.go`](file:///c:/Users/khara/Desktop/APPS%20GRAVITY/Kallia/Kallia%20Call/cmd/server/session.go), a ingestão de mensagens agora utiliza `s.realPhone(targetJID)` e o store de contatos do Whatsmeow para resolver identificadores temporários do WhatsApp Multi-Device (ex: `88240136671451`) para o número real com DDI/DDD (ex: `5527995307346`) e nome verificado do cliente.
  - **Exibição dos Contatos na Aba 'Contatos' (PostgreSQL)**: Corrigido em [`contacts.ts`](file:///c:/Users/khara/Desktop/APPS%20GRAVITY/Kallia/Kallia%20Call/client/src/services/contacts.ts) o parsing da resposta paginada do endpoint unificado do PostgreSQL (`{ items: [...], total: N }`), garantindo que todos os contatos criados no chat apareçam instantaneamente na aba de Contatos do CRM.
  - **Busca Unificada (`q` e `search`)**: Em [`contacts_pg.go`](file:///c:/Users/khara/Desktop/APPS%20GRAVITY/Kallia/Kallia%20Call/cmd/server/contacts_pg.go), o handler agora aceita de forma transparente tanto o parâmetro `q` quanto `search`.
- [x] **Otimização de Latência e Tempo Real do Chat Omnichannel (22/08/2026)**:
  - **Broadcast Local Imediato (< 1ms)**: Em [`realtime_ws.go`](file:///c:/Users/khara/Desktop/APPS%20GRAVITY/Kallia/Kallia%20Call/cmd/server/realtime_ws.go), o método `Broadcast` agora despacha as mensagens diretamente para todos os operadores locais conectados antes de repassar ao Redis Pub/Sub, eliminando qualquer atraso de fila ou loop de rede.
  - **Resolução Dinâmica de Sessão Ativa de Envio**: Em [`conversations.go`](file:///c:/Users/khara/Desktop/APPS%20GRAVITY/Kallia/Kallia%20Call/cmd/server/conversations.go), `handleSendMessage` agora resolve a sessão ativa de WhatsApp do workspace em tempo de execução caso a inbox não possua um ID estático, permitindo envio imediato pelo Whatsmeow sem travar a requisição.
  - **Suporte a WebSocket no Proxy Vite (`ws: true`)**: Habilitado o proxy de WebSockets no [`vite.config.ts`](file:///c:/Users/khara/Desktop/APPS%20GRAVITY/Kallia/Kallia%20Call/client/vite.config.ts) e corrigido o construtor de URL do WebSocket em [`conversations.ts`](file:///c:/Users/khara/Desktop/APPS%20GRAVITY/Kallia/Kallia%20Call/client/src/stores/conversations.ts) utilizando `getApiBase()`.
  - **Fallback Polling de 3s no Frontend**: Adicionada sincronização contínua leve em [`ConversationsPage.tsx`](file:///c:/Users/khara/Desktop/APPS%20GRAVITY/Kallia/Kallia%20Call/client/src/pages/ConversationsPage.tsx) para garantir que mesmo sob oscilações de rede nenhuma mensagem fique pendente.
- [x] **Implementação do Frontend Omnichannel & Chat Completo Estilo WhatsApp (22/08/2026)**:
  - **Interface em 3 Colunas Inspirada no WhatsApp / Chatwoot**: Criado [`ConversationsPage.tsx`](file:///c:/Users/khara/Desktop/APPS%20GRAVITY/Kallia/Kallia%20Call/client/src/pages/ConversationsPage.tsx) integrado ao layout e design system existente do Kallia Call.
  - **Store e Conexão em Tempo Real (`conversations.ts`)**: Gerenciador de estado com sincronização bidirecional via WebSocket e reconexão automática, refletindo novas mensagens, contadores de não lidas e indicadores de digitação instantaneamente.
  - **Timeline e Balões Estilo WhatsApp (`ChatTimeline.tsx`)**: Renderização rica de balões de mensagens, notas internas amarelas privadas, player de áudio interativo com barra de progresso, lightbox de imagens com zoom, download de documentos e status de entrega (enviado, entregue, lido em azul).
  - **Barra de Entrada com Gravador de Microfone & Emojis (`ChatInputBar.tsx`)**: Alternador entre mensagem WhatsApp e Nota Interna, seletor de emojis integrado, menu de anexos (fotos, vídeos, documentos) com modal de confirmação e **gravador de voz PTT em tempo real pelo microfone**.
  - **Header & Gaveta Lateral de Contato (`ChatHeader.tsx` & `ContactDetailsDrawer.tsx`)**: Gestão de status (Resolver/Reabrir), ativação do agente de IA na conversa, ligação direta pelo Webphone, vinculação rápida de tags e visualização de atributos do contato.
- [x] **Implementação do Módulo Omnichannel Core & PostgreSQL Realtime (22/08/2026)**:
  - **PostgreSQL 16 com pgvector & Auto-migrations**: Criado [`pg.go`](file:///c:/Users/khara/Desktop/APPS%20GRAVITY/Kallia/Kallia%20Call/cmd/server/pg.go) com pool resiliente e migrações idempotentes para `inboxes`, `contacts`, `tags`, `contact_tags`, `chat_agents`, `conversations`, `conversation_tags`, `messages` (com particionamento mensal), `embeddings` (vetorial para RAG), `pipelines`, `pipeline_stages`, `deals` e `automations`.
  - **Tags Customizadas de Workspace**: Criado [`tags.go`](file:///c:/Users/khara/Desktop/APPS%20GRAVITY/Kallia/Kallia%20Call/cmd/server/tags.go) com suporte a tags reutilizáveis com cores e escopos (`contact`, `conversation`, `both`) com endpoints de gestão e atribuição N:N.
  - **Contatos Unificados & Auto-migração**: Criado [`contacts_pg.go`](file:///c:/Users/khara/Desktop/APPS%20GRAVITY/Kallia/Kallia%20Call/cmd/server/contacts_pg.go) migrando automaticamente os contatos legados do PocketBase/SQLite para o PostgreSQL na inicialização com suporte a busca, paginação, tags e atributos personalizados.
  - **Hub WebSocket de Tempo Real (`realtime_ws.go`)**: Implementado endpoint `/api/workspaces/{wid}/ws` com clusterização via Redis Pub/Sub, indicadores de digitação (*typing*), status de entrega/leitura e isolamento por workspace.
  - **Motor de Conversas & Ingestão WhatsApp (`conversations.go`)**: Implementado gerenciamento de inboxes, conversas e mensagens com reabertura automática de tickets resolvidos e ingestão direta de eventos do WhatsApp (`whatsmeow`) transmitindo em tempo real via WebSocket.
- [x] **Diagnóstico e Correção de Ativação do Widget Chatwoot & CORS Preflight (`widget.js` & `withCORS`) (22/08/2026)**:
  - **Correção de Preflight CORS para Domínio do Chatwoot (`chat.rockburger.com.br`)**: A função `withCORS` em [`httpapi.go`](file:///c:/Users/khara/Desktop/APPS%20GRAVITY/Kallia/Kallia%20Call/cmd/server/httpapi.go) foi atualizada para suportar reflexão dinâmica de origem, suporte a subdomínios wildcard e permissão explícita para todos os headers (`X-API-Key`, `X-Connection-API-Key`, `Content-Type`, etc.), eliminando o erro de bloqueio de preflight.
  - **Injeção Próxima ao Botão "Resolver" do Chatwoot**: Atualizado o `findActionsContainer` em [`widget.js`](file:///c:/Users/khara/Desktop/APPS%20GRAVITY/Kallia/Kallia%20Call/client/public/widget.js) para detectar o botão "Resolver" nativo do Chatwoot e inserir o botão de chamada diretamente ao lado dele na barra superior de ações.
  - **Unificação de IDs e Elementos DOM**: Corrigidas inconsistências onde `setStatus`, `addTranscript`, `audio` e `panel` buscavam IDs legados `wacalls-`.
- [x] **Concordância Gramatical Completa de Gênero (`do(a)`, `ao(à)`, `dele(a)`) (22/08/2026)**:
  - **Padronização de Artigos e Contrações**: Ajustadas todas as frases e presets para utilizar flexibilização completa: `do(a) [session_name]`, `ao(à) [session_name]`, `dele(a)`, `sobre o(a) [session_name]`, `central de atendimento do(a) [session_name]`.
  - **Regra de Concordância Aprimorada**: Instrução master explicitando adaptações para nomes masculinos, femininos ou de empresas (*"do João / ao João / dele"*, *"da Maria / à Maria / dela"*, *"da Kallia / à Kallia / dela"*).
- [x] **Nome do Agente, Modelo e Sentido da Chamada no Card Lateral (`AgentsPage.tsx`) (22/08/2026)**:
  - **Exibição do Nome Personalizado no Card do Agente Principal**: O card lateral agora exibe o nome configurado do agente (ex: *Kallia*, *Sofia*) no título e no avatar dinâmico com a inicial, além do subtítulo de atendimento.
  - **Badges Dinâmicos de Modelo & Sentido no Card**: Badges visuais indicando o Modelo Base ativo (`[Bot: Secretária Pessoal]`, `[Building2: Atendente Comercial]`, etc.) e o Sentido da Chamada (`[PhoneCall: In & Outbound]`, `[PhoneIncoming: Só Inbound]`, `[PhoneOutgoing: Só Outbound]`).
- [x] **Transparência na Aba Identidade, Nome Opcional com Switch & Frases de Abertura Sincronizadas (22/08/2026)**:
  - **Transparência de IA na Aba Identidade**: O bloco de divulgação de IA foi movido para a primeira aba (*Identidade & Fluxo*), ficando ao lado do Nome do Agente e do Modelo Base.
  - **Nome Próprio Opcional (`useAgentName`)**: Adicionado switch/checkbox para habilitar ou desabilitar o nome fictício. Se desmarcado, a IA atua de forma institucional em nome da empresa sem nome de pessoa.
  - **Modelos de Fala e Saudações Sincronizadas**:
    - *Modo Natural / Discreta*: Se apresenta naturalmente como *"Aqui é a Sofia, assistente do [session_name]"* ou *"Falo em nome do [session_name]"* (sem citar termos como IA/virtual na abertura, mas confirmando cordialmente caso seja perguntada).
    - *Modo Avisar no Início*: Informa proativamente *"Aqui é a Sofia, assistente virtual de inteligência artificial do [session_name]"*.
    - Os presets rápidos (*Pessoal*, *Empresa*, *Suporte*) adaptam suas frases de abertura e encerramento em tempo real com base no nome e modo de transparência selecionados.
  - **Toolbar Superior Dinâmico (`PromptQuickBar.tsx`)**: Exibe o avatar/iniciais do nome quando ativo ou ícone genérico de bot com o título *Assistente de Atendimento*, além do badge em tempo real do modo de transparência ativo (`Natural / Discreta` vs `Avisar IA`).

## 🚀 Próximas Implementações e Roadmap

### 🤖 Fase 4: Agente Autônomo de Resposta de Chat (RAG + Ferramentas)
- [ ] **Configuração de Agentes de Chat por Linha/Workspace**:
  - Interface para criar personas exclusivas para atendimento em texto no WhatsApp.
  - Definição de Prompt de Sistema, temperatura, delay de resposta (para simular digitação natural humana) e horário de funcionamento.
- [ ] **RAG Vetorial com pgvector & Gemini Embeddings**:
  - Geração de embeddings vetoriais com modelo `text-embedding-004` (768 dimensões) para os documentos da Base de Conhecimento do Workspace salvos em `embeddings`.
  - Busca por similaridade cosseno (`<=>` HNSW) para responder perguntas dos clientes com precisão documental.
- [ ] **Transcrição & Resposta Inteligente de Áudios**:
  - Transcrição automática de mensagens de voz recebidas no WhatsApp via Gemini / Whisper.
  - Capacidade do Agente de responder em texto ou sintetizar áudio TTS nativo dependendo da preferência configurada.
- [ ] **Tools & Ações Automáticas do Agente**:
  - Criar/Atualizar dados do contato no CRM durante a conversa.
  - Mover o lead de estágio no Kanban.
  - Aplicar tags automáticas na conversa.
  - Transbordo para atendente humano (`status = 'pending'`, pausa na IA e notificação).

---

### 📊 Fase 5: CRM com Kanban (Pipelines, Estágios e Deals)
- [ ] **Quadro Kanban Visual de Oportunidades**:
  - Visualização de colunas customizáveis (ex: *Novo Lead*, *Em Qualificação*, *Proposta Enviada*, *Fechado/Ganho*, *Perdido*).
  - Drag-and-drop de cards entre estágios com atualização em tempo real.
- [ ] **Gestão de Negociações (Deals)**:
  - Criação de deals com valor monetário estimado, responsável, data de fechamento prevista e motivo de perda.
  - Vinculação direta entre Negociação, Contato e Conversa do WhatsApp.
- [ ] **Ações Rápidas no Card**:
  - Botão de discagem imediata pelo Webphone a partir do card.
  - Abertura da janela de chat com histórico completo ao clicar no card.

---

### ⚡ Fase 6: Automações Personalizadas & Triggers de Fluxo
- [ ] **Motor de Automações por Eventos (`automations`)**:
  - Gatilhos suportados: *Nova mensagem recebida*, *Palavra-chave detectada*, *Conversa criada*, *Conversa resolvida*, *Chamada encerrada*, *Avaliação de NPS recebida*.
  - Ações suportadas: *Aplicar Tag*, *Atribuir a Operador*, *Enviar Mensagem Modelo*, *Criar Negociação no Kanban*, *Chamar Webhook Externo (N8N/Make)*.
- [ ] **Editor Visual de Regras no Frontend**:
  - Interface intuitiva de criação de automações "SE [Gatilho] ENTÃO [Ação]" sem necessidade de código.

---

### 🌐 Fase 7: Canais Adicionais Omnichannel
- [ ] **Instagram Direct & Facebook Messenger**: Ingestão de mensagens diretas e comentários via Meta Graph API conectadas ao mesmo inbox do PostgreSQL.
- [ ] **Telegram Bot**: Conexão de bots do Telegram para suporte e atendimento unificado.
- [ ] **E-mail & SMS**: Recepção e disparo de e-mails de tickets e SMS transacionais.

---

### 📈 Fase 8: Relatórios Avançados & Métricas de Atendimento
- [ ] **Métricas Omnichannel de Atendimento**:
  - TMA (Tempo Médio de Atendimento) e TME (Tempo Médio de Primeira Resposta).
  - Volume de mensagens por canal, dia e horário de pico.
  - Taxa de resolução autônoma por IA vs atendente humano.
- [ ] **Exportação de Gravações de Voz para Nuvem (S3 / Cloudflare R2)**:
  - Backup automático de gravações de chamadas de voz WAV para bucket S3/R2 para economia de disco local.
