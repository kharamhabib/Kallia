# Arquitetura do Sistema: Kallia 2.0 (VoIP & Omnichannel SaaS)

O **Kallia** é uma plataforma SaaS profissional de atendimento corporativo integrada ao WhatsApp e canais digitais, combinando:
1. **PABX VoIP Baseado em WhatsApp**: Realização e recepção de chamadas de voz diretamente no navegador via Webphone, gravação dual-channel estocástica, transcrição em tempo real e agentes de voz de baixa latência (**Google Gemini Live** e **xAI Grok Realtime**).
2. **Central Omnichannel de Conversas (Estilo WhatsApp / Chatwoot)**: Recepção e envio contínuo de mensagens (texto, áudio PTT com gravação no microfone, fotos, documentos e notas internas), visualização em 3 colunas, tags de workspace e filtros avançados.
3. **CRM de Contatos & Kanban de Vendas**: Unificação de clientes com histórico de interações (chamadas e mensagens), pipeline de negociações (Deals) e campos personalizados.
4. **Inteligência Artificial RAG & Automações**: Agentes autônomos para resposta automática de mensagens com busca semântica em Base de Conhecimento vetorial (**pgvector** no PostgreSQL 16) e gatilhos de fluxo.

---

## 1. Visão Geral da Arquitetura e Multi-Tenancy

O Kallia adota o modelo de **Workspaces Multi-Tenant Desacoplados** com autoridade distribuída especializada:

```
                              ┌────────────────────────────────────────┐
                              │            POCKETBASE (SSOT)           │
                              │  ┌──────────────────────────────────┐  │
                              │  │         workspaces               │  │
                              │  │ (Planos, Cotas, Membros, RBAC)   │  │
                              │  └─────────────────┬────────────────┘  │
                              └────────────────────┼───────────────────┘
                                                   │
                 ┌─────────────────────────────────┼─────────────────────────────────┐
                 │                                 │                                 │
                 ▼                                 ▼                                 ▼
       ┌────────────────────┐            ┌────────────────────┐            ┌────────────────────┐
       │   ai_providers     │            │       agents       │            │      sessions      │
       │(Chaves Criptograf.)│            │(Especialistas Voz) │            │(Conexões WhatsApp) │
       └────────────────────┘            └────────────────────┘            └──────────┬─────────┘
                                                   │                                  │
                                                   ▼                                  │
       ┌────────────────────────────────────────────────────────────────────────┐     │
       │                   POSTGRESQL 16 + PGVECTOR (OMNICHANNEL)               │     │
       │                                                                        │     │
       │  ┌──────────────┐     ┌──────────────┐     ┌────────────────────────┐  │     │
       │  │   inboxes    │◄────┤conversations ├────►│       messages         │  │     │
       │  └──────────────┘     └──────┬───────┘     │(Particionamento Mensal)│  │     │
       │                              │             └────────────────────────┘  │     │
       │                              ▼                                         │     │
       │  ┌──────────────┐     ┌──────────────┐     ┌────────────────────────┐  │     │
       │  │     tags     │◄────┤   contacts   │◄────┤       embeddings       │  │     │
       │  │ (Workspace)  │     │(CRM Unificado│     │ (pgvector 768d p/ RAG) │  │     │
       │  └──────────────┘     └──────┬───────┘     └────────────────────────┘  │     │
       │                              ▼                                         │     │
       │                       ┌──────────────┐                                 │     │
       │                       │  pipelines / │                                 │     │
       │                       │ stages/deals │                                 │     │
       │                       └──────────────┘                                 │     │
       └────────────────────────────────────────────────────────────────────────┘     │
                                                   ▲                                  │
                                                   │                                  │
                                                   └──────────────────────────────────┘
```

### Princípios Fundamentais do Modelo Desacoplado:
1. **Workspaces como Tenant Raiz (SSOT)**:
   - Todo recurso (Agentes, Provedores de IA, CRM de Contatos, Histórico de Chamadas, Inboxes, Conversas, Tags e Negociações) pertence estritamente a um **Workspace** (`workspace_id`).
   - Usuários possuem papéis granulares (`owner`, `admin`, `member`) via `workspace_members`.
2. **Desacoplamento Total de Conexões WhatsApp**:
   - As conexões WhatsApp (`sessions`) são apenas **canais de entrada e saída de áudio e mensagens**.
   - Se uma linha de WhatsApp for excluída, reconectada ou substituída, **todos os dados de inteligência (Agentes, Histórico de Conversas, Contatos, Chaves e Negociações) permanecem 100% preservados no Workspace**.
3. **Controle de Cotas por Plano de Workspace**:
   - Cada Workspace possui limites configuráveis de:
     - `max_connections`: Número de linhas WhatsApp ativas simultaneamente (ex: Trial: 1, Basic: 1, Advantage: 3, Expert: 5).
     - `max_concurrent_calls`: Número de chamadas de voz simultâneas.
     - `max_agents`: Número de personas/agentes especialistas disponíveis.
4. **Controle de Acesso por Roles (RBAC)**:
   - `appadmin`: Superadministrador com visão global de todos os Workspaces, sessões e usuários cadastrados no ecossistema.
   - `creator` / `owner`: Proprietário do Workspace. Gerencia conexões, membros, agentes especialistas e configurações de IA.
   - `normal` / `member`: Operador convidado. Acesso operacional (chat, chamadas, contatos e histórico), sem permissão para deletar conexões ou chaves mestras.

---

## 2. Divisão de Responsabilidade entre Bancos de Dados

O sistema opera com uma arquitetura de banco de dados híbrida e especializada:

```
┌────────────────────────────────────────────────────────────────────────────────────────┐
│                                POCKETBASE (SSOT DE NEGÓCIO)                            │
│                                                                                        │
│  - users & auth: Gestão de identidade, senhas, papéis (RBAC) e Google OAuth2.          │
│  - workspaces & workspace_members: Tenants, cotas de planos e controle de membros.     │
│  - agents: Personas e especialistas de voz para auto-atendimento telefônico.           │
│  - ai_providers: Chaves criptografadas (AES-256-GCM) de Gemini, Grok e OpenAI.         │
│  - call_history & call_ratings: Histórico de chamadas de voz, gravações WAV e NPS.     │
│  - sessions: Cadastro de conexões vinculadas ao workspace_id.                          │
└────────────────────────────────────────────────────────────────────────────────────────┘
                                            │
                                            ▼
┌────────────────────────────────────────────────────────────────────────────────────────┐
│                   POSTGRESQL 16 + PGVECTOR (OMNICHANNEL & CRM VETORIAL)                │
│                                                                                        │
│  - inboxes & conversations: Inboxes por canal e sessões de atendimento ativas/fechadas.│
│  - messages: Timeline completa (texto, áudio, fotos, docs, notas) c/ partição mensal. │
│  - contacts & tags: CRM unificado com tags multicoloridas de workspace.                │
│  - embeddings: Índice vetorial HNSW (768 dimensões) para RAG e Base de Conhecimento.   │
│  - pipelines, stages & deals: CRM visual Kanban de oportunidades de vendas.            │
│  - automations: Motor de regras e gatilhos de fluxo automático para o chat.           │
└────────────────────────────────────────────────────────────────────────────────────────┘
                                            │
                                            ▼
┌────────────────────────────────────────────────────────────────────────────────────────┐
│                              SQLITE LOCAL (BAIXA LATÊNCIA)                             │
│                                                                                        │
│  - ./storage/whatsapp/{id}.db (whatsmeow): Chaves criptográficas do Signal/WhatsApp.  │
│  - sessions.db: Buffer de transcrições de voz ao vivo e mapeamento binário de enquetes.│
└────────────────────────────────────────────────────────────────────────────────────────┘
```

---

## 3. Tecnologias Utilizadas

### Backend (Go 1.26+)
- **Autenticação & Dados Primários (SSOT)**: PocketBase (Google OAuth2, e-mail/senha, RBAC, REST API, SSE Realtime `/api/realtime`).
- **Módulo Omnichannel & CRM Vetorial**: PostgreSQL 16 com extensão **`pgvector`** (`pgvector/pgvector:pg16`), particionamento mensal da tabela `messages`, pool resiliente e migrações idempotentes no boot.
- **Persistência de Sessão WhatsApp**: SQLite nativo isolado por conexão (`./storage/whatsapp/{id}.db`) para o motor Signal/WhatsApp do `whatsmeow`.
- **Hub WebSocket de Tempo Real**: Endpoint `/api/workspaces/{wid}/ws` com clusterização Redis Pub/Sub, despacho local com latência zero (< 1ms), indicadores de digitação (*typing*) e recibos de entrega.
- **Fila & Concorrência**: Redis 7 com fallback automático em memória RAM (`queue.go`) para rate-limiting anti-bloqueio e entrega de webhooks.
- **Processamento de Mídia**: CGO com wrapping de codecs Opus/MLow nativos (`libopus_mlow.so` / `opus_mlow.dll`).
- **Gravação de Áudio Dual-Channel**: Gravação e mixagem estocástica em tempo real dos dois canais de áudio (Cliente + IA) salvas em `storage/recordings/YYYYMMDD_HHMMSS_Contato_CallID.wav` com player autenticado.
- **Protocolo**: Sinalização de VoIP via nós binários do WhatsApp e transporte de mídia UDP (SRTP) intermediado por WebRTC.
- **Comunicação IA Multi-Provedor**: WebSocket bidirecional nativo (`github.com/gorilla/websocket`) para comunicação com Gemini Live (`generativelanguage.googleapis.com`) e Grok Realtime (`wss://api.x.ai/v1/realtime`).
- **Criptografia de Chaves de API**: Chaves de API dos provedores de IA são criptografadas com AES-256-GCM no banco e descriptografadas em runtime via `KALLIA_AI_ENCRYPTION_KEY`.

### Frontend (React 19, TypeScript, Vite)
- **Core**: React 19, TypeScript, Vite.
- **Estilização**: Vanilla CSS / Tailwind CSS v4, Lucide Icons, Design System executivo escuro/claro com temas adaptativos.
- **Módulo de Chat Omnichannel (Estilo WhatsApp)**:
  - `ConversationsPage`: Layout mestre em 3 colunas (Lista, Timeline, Detalhes do Contato).
  - `ConversationsList`: Filtros por status (Abertas, Pendentes, Resolvidas), atribuição, tags e modal de "+ Nova Conversa".
  - `ChatTimeline`: Balões de mensagem WhatsApp, notas internas amarelas privadas, player de áudio com scrubbing, lightbox de imagem e status de leitura.
  - `ChatInputBar`: Gravador de voz PTT em tempo real pelo microfone do navegador, seletor de emojis integrado, menu de anexos e alternador de modo WhatsApp vs Nota Interna.
  - `ContactDetailsDrawer`: Painel lateral retrátil com dados do contato, tags e atalhos rápidos.
- **Componentes Globais Reutilizáveis**:
  - `WorkspaceSelector`: Seletor rápido de Workspace no cabeçalho com troca ágil de contexto.
  - `ConfirmModal`: Modal de confirmação seguro utilizado em exclusões do CRM e do Histórico.
  - `AudioRecordingPlayer`: Player de áudio com marcador de linha do tempo customizado (`.audio-slider`) e controle de volume/download.
  - `TranscriptModal` & `SummaryModal`: Visualizadores modais de transcrição e resumos gerados por IA.
- **Estado**: Zustand (`conversations.ts`, `workspace.ts`, `auth.ts`, `navigation.ts`).
- **Comunicação**: Sincronização nativa via WebSocket bidirecional (`/api/workspaces/{wid}/ws`) com fallback leve de polling contínuo.

---

## 4. Estrutura de Arquivos Principal

```
Kallia/
├── pb_schema.json                   # Esquema consolidado das coleções do PocketBase
├── docker-compose.yaml              # Orquestração de containers (app, pocketbase, redis, postgres c/ pgvector)
├── cmd/
│   └── server/                      # Servidor Go Principal
│       ├── main.go                  # Bootstrap, inicialização do PocketBase, PostgreSQL, Redis e listeners
│       ├── pg.go                    # Pool PostgreSQL 16, auto-migrations e schema Omnichannel
│       ├── realtime_ws.go           # Hub WebSocket bidirecional em tempo real + Redis PubSub
│       ├── conversations.go         # CRUD de conversas, inboxes, envio de mídias e ingestão WhatsApp
│       ├── contacts_pg.go           # CRM unificado no PostgreSQL com auto-migração de contatos
│       ├── media_storage.go         # Storage local de mídias do chat e job de retenção/limpeza
│       ├── tags.go                  # Tags multicoloridas de Workspace (contacts & conversations)
│       ├── auth.go                  # Autenticação JWT, login PocketBase, middleware RBAC e SuperAdmin
│       ├── db.go                    # dbProvider com suporte a SQLite local e namespaces
│       ├── agents_api.go            # Handlers REST para CRUD de Agentes Especialistas
│       ├── ai_agent.go              # Agente de voz server-side (WA <-> Gemini/Grok + tools + transfer + post-call)
│       ├── ai_providers.go          # CRUD e gerenciamento de provedores de IA (PocketBase + criptografia)
│       ├── ai_scheduler.go          # Scheduler background de ligações programadas do servidor
│       ├── aiconfig.go              # Handlers REST de configuração da IA (AIConfig struct multi-provedor)
│       ├── authticket.go            # Tickets de uso único (30s) p/ SSE/WebSocket sem exposição de chave na URL
│       ├── broker.go                # Broker SSE interno para broadcast de eventos aos clientes conectados
│       ├── crypto.go                # Criptografia AES-256-GCM para chaves de API dos provedores
│       ├── gemini_live.go           # Cliente WebSocket nativo para a API Gemini Live (Google)
│       ├── gemini_proxy.go          # Proxy WS/REST do Gemini (a chave nunca sai do servidor)
│       ├── grok_live.go             # Cliente WebSocket nativo para a API Grok Realtime (xAI)
│       ├── httpapi.go               # Rotas da API HTTP/WebRTC, workspaces, auto-criação, SSE, CORS
│       ├── pocketbase_client.go     # Cliente PocketBase de Superuser com CRUD para workspaces, sessões, CRM e IA
│       ├── pocketbase_sync.go       # Motor de hidratação inicial e listener SSE persistente (/api/realtime)
│       ├── queue.go                 # Gerenciador de filas Redis com fallback automático In-Memory
│       ├── safehttp.go              # Guarda anti-SSRF (validação de URL/DNS/IP + redirects)
│       ├── server.go                # Inicialização do servidor + hidratação do histórico do banco
│       ├── session.go               # Estado WhatsApp/VoIP, auto-atendimento, pgPushIncoming, realPhone
│       ├── sessionmanager.go        # Ciclo de vida de conexões, restauração segura no Dev e deduplicação
│       ├── sessionstore.go          # Operações no SQLite local (buffers de áudio, enquetes e sessões)
│       └── util.go                  # Helpers de fuso, retry HTTP e goroutines seguras (goSafe)
├── internal/
│   └── voip/
│       ├── call/                    # Máquina de estados das chamadas e CallManager (CGO + Mutexes)
│       │   ├── callmanager.go       # Gerenciador + listeners de estado thread-safe (AddStateListener)
│       │   ├── callmanager_media.go # Processamento de fluxos RTP e de-duplicação de pacotes
│       │   └── callstate.go         # Definição dos estados e transições de chamadas
│       ├── media/                   # Decodificação Opus/PCM e manipulação de fluxos RTP
│       └── signaling/               # Sinalização VoIP do WhatsApp (Accept, Offer, Reject, Transport)
├── client/                          # Código Frontend React/TypeScript
│   └── src/
│       ├── App.tsx                  # Ponto de entrada React com rotas autenticadas e seletor de Workspace
│       ├── stores/
│       │   ├── conversations.ts     # Store Zustand de conversas, mensagens e sincronização WebSocket
│       │   ├── workspace.ts         # Store de workspaces ativos e planos
│       │   ├── navigation.ts        # Gerenciador de seções e rotas
│       │   └── auth.ts              # Gerenciador de sessão e tokens
│       ├── components/
│       │   ├── auth/LoginScreen.tsx # Tela de login integrada com PocketBase e Google OAuth2
│       │   ├── layout/
│       │   │   ├── AppShell.tsx     # Layout principal com barra superior e seletor de workspaces
│       │   │   └── Sidebar.tsx      # Navegação lateral com atalho para Conversas (Chat)
│       │   ├── domain/
│       │   │   ├── chat/            # Módulo Completo de Chat Omnichannel Estilo WhatsApp
│       │   │   │   ├── ConversationsList.tsx    # Lista com filtros e botão "+ Nova Conversa"
│       │   │   │   ├── ChatHeader.tsx           # Cabeçalho da conversa com IA toggle e atalhos
│       │   │   │   ├── ChatTimeline.tsx         # Linha do tempo com balões, áudios e lightbox
│       │   │   │   ├── ChatInputBar.tsx         # Barra de envio com gravador de voz PTT e emojis
│       │   │   │   └── ContactDetailsDrawer.tsx # Painel lateral de dados e tags do contato
│       │   │   ├── call/Webphone.tsx            # Discador Webphone com auto-complete de contatos
│       │   │   ├── history/                     # Tabelas e modais de histórico de ligações
│       │   │   ├── settings/                    # Painéis de configurações e integrações
│       │   │   └── session/AIDialog.tsx         # Dialog de voz e seleção de agente especialista
│       │   └── shared/
│       │       ├── WorkspaceSelector.tsx        # Seletor de workspace em tempo real
│       │       └── ConfirmModal.tsx             # Modal reutilizável de confirmação
│       └── pages/
│           ├── ConversationsPage.tsx # Central de Atendimento & Chat Omnichannel
│           ├── DashboardPage.tsx     # Dashboard executivo com KPIs do Workspace ativo
│           ├── ContactsPage.tsx      # Módulo de CRM de contatos unificado por Workspace (PostgreSQL)
│           ├── AgentsPage.tsx        # Central Única de Agentes IA do Workspace
│           ├── ConnectionsPage.tsx   # Conexões de WhatsApp do Workspace
│           └── ProfilePage.tsx       # Perfil do usuário e Painel Admin Global
```

---

## 5. Modelo de Dados Consolidado no PocketBase (8 Coleções)

O banco PocketBase é estruturado nas seguintes coleções canônicas:

| Coleção | Tipo | Descrição | Campos Principais |
| :--- | :--- | :--- | :--- |
| **`workspaces`** | Base | Tenant raiz da organização e plano de billing | `id`, `name`, `plan`, `plan_status`, `max_connections`, `max_concurrent_calls`, `max_agents`, `plan_starts_at`, `plan_ends_at` |
| **`workspace_members`** | Base | Membros com acesso a cada Workspace | `id`, `workspace_id` (FK), `user_id` (FK), `role` (`owner`, `admin`, `member`) |
| **`users`** | Auth | Usuários e operadores da plataforma | `id`, `email`, `password`, `name`, `avatar`, `role` (`appadmin`, `creator`, `normal`), `default_workspace_id` |
| **`sessions`** | Base | Conexões de WhatsApp ativas | `id`, `sid`, `name`, `jid`, `webhook`, `chatwoot`, `ai_config`, `workspace_id` (FK), `api_key` |
| **`agents`** | Base | Personas e especialistas de IA | `id`, `workspace_id` (FK), `name`, `description`, `ai_config` (JSON), `inbound`, `outbound` |
| **`ai_providers`** | Base | Provedores de IA e chaves criptografadas | `id`, `workspace_id` (FK), `provider` (`gemini`, `grok`, `openai`), `encrypted_api_key`, `enabled`, `default_model`, `options_json` |
| **`contacts`** | Base | CRM unificado de contatos | `id`, `workspace_id` (FK), `phone`, `username`, `name`, `email`, `company`, `notes`, `tags` (JSON), `avatar_url`, `lid`, `jid` |
| **`call_history`** | Base | Histórico de chamadas VoIP e gravações | `id`, `workspace_id` (FK), `session_id`, `call_id`, `peer`, `direction`, `started_at`, `ended_at`, `summary`, `recording_url`, `transcript`, `agent_id` |
| **`call_ratings`** | Base | Pesquisas de satisfação pós-atendimento (NPS) | `id`, `workspace_id` (FK), `session_id`, `call_id`, `phone`, `score`, `comment`, `agent_id` |

---

## 6. Sincronização em Tempo Real (Dev ↔ VPS)

- **Hidratação Inicial no Boot (`hydrateFromPocketBase`)**:
  - Ao iniciar, o servidor Go autentica no PocketBase com credenciais de Admin/Superuser e carrega os metadados de Workspaces, Conexões, Agentes, Provedores e Contatos.
- **Escuta em Tempo Real (`/api/realtime` SSE)**:
  - O backend Go mantém uma conexão SSE persistente com o PocketBase. Qualquer criação, atualização ou exclusão feita no Dashboard ou via API é propagada instantaneamente em memória e aos clientes web conectados.
- **Deduplicação e Criação Atômica de Sessões**:
  - Ao cadastrar uma sessão de WhatsApp, o cliente realiza uma busca prévia por `sid` no PocketBase para atualizar (`PATCH`) se já existir ou criar (`POST`) caso seja nova, prevenindo registros duplicados no banco.
- **Sessões em Standby no Ambiente de Desenvolvimento**:
  - Instâncias físicas conectadas na VPS são carregadas no ambiente Dev no estado de standby, permitindo configurar agentes, prompts e contatos sem disputar a conexão de socket do WhatsApp.

---

## 7. Agentes de IA e Transferência de Chamadas (`TransferTo`)

### 7.1 Multi-Provedores de IA
- **Google Gemini Live**: Modelo padrão `models/gemini-3.1-flash-live-preview`, vozes nativas (Puck, Charon, Kore, Fenrir, Aoede), suporte a `languageCode` e chamada de funções (Tools).
- **xAI Grok Realtime**: 26 vozes nativas, reasoning effort (`high`/`none`), ferramentas nativas `web_search` e `x_search`, transcrição `grok-transcribe` e barge-in instantâneo via `input_audio_buffer.speech_started`.
- **Criptografia AES-256-GCM**: Todas as chaves de API dos provedores de IA são armazenadas criptografadas na coleção `ai_providers` com a chave `KALLIA_AI_ENCRYPTION_KEY` e descriptografadas somente em memória durante o atendimento.

### 7.2 Transferência Dinâmica entre Especialistas (`TransferTo`)
Durante uma chamada em andamento atendida pela IA:
1. A IA detecta a necessidade de transbordo (ex: suporte financeiro) e invoca a tool `transfer_to_agent`.
2. O servidor Go desconecta a sessão da IA atual de forma limpa, preservando o fluxo de áudio VoIP do WhatsApp 100% ativo.
3. Carrega o prompt e as instruções do novo agente especialista e injeta o histórico recente da conversa na nova conexão.
4. O atendimento prossegue com o novo especialista sem que a ligação caia.

---

## 8. Tratamento Canônico de Identificadores do WhatsApp: Phone Number (PN) vs JID vs LID vs Username (@handle)

Para evitar inconsistências no CRM, discador, webhooks e relatórios, o sistema estabelece uma diferenciação estrita e um **mecanismo canônico único** para lidar com identificadores no ecossistema do WhatsApp:

### 8.1 O Quarteto de Identificadores:

| Identificador | Formato / Exemplo | Comprimento | Onde é Usado | Onde NUNCA deve ser usado |
| :--- | :--- | :--- | :--- | :--- |
| **Phone Number (PN)** | `5527995307734`, `5511999998888` | 10 a 13 dígitos | **CRM (`contacts.phone`)**, discador Webphone, histórico (`call_history.peer`), webhooks externos (Chatwoot, N8N, Typebot), busca e relatórios. | NUNCA salvar LIDs (`26...`), usernames ou strings com `@...` no campo `phone`. |
| **JID (WhatsApp ID)** | `5527995307734@s.whatsapp.net`, `261916165423237@lid` | Variável (`user@server`) | **Protocolo e rede**: envio de mensagens whatsmeow, sinalização VoIP `<call>`, roteamento de mídia, presença e eventos de socket. | NUNCA exibir como telefone direto na UI sem formatação. |
| **LID (Linked Device ID)** | `261916165423237`, `261916165423237@lid` | 15 dígitos (inicia c/ `26` ou `27`) | **Mapeamento de privacidade**: campo `contacts.lid`, identificação de companion devices e chamadas VoIP com ID oculto. | **NUNCA salvar como `phone`**. Deve ser resolvido para o PN real. |
| **Username (`@handle`)** | `@kalliacall`, `joaosilva` | 3 a 30 caracteres | **CRM (`contacts.username`)**, identificador amigável na interface, busca de contatos e futuras rotas de discagem direta por handle. | NUNCA substituir o `phone` ou o `jid` de rede pelo username. |

### 8.2 Interceptação do `@username` da Meta:
O WhatsApp/Meta está gradualmente liberando usernames (`@username`) para contas pessoais e comerciais. O Kallia intercepta e armazena usernames de forma nativa:
1. **Nós Binários XML & Mensagens**: Captura de nós e atributos de mensagens interativas/vCard contendo `username`.
2. **PushName & Status**: Quando o contato define um handle com `@` em seu nome de exibição ou biografia/status, o sistema extrai e vincula automaticamente a `contacts.username`.
3. **Mapeamento no CRM**: Salvo nas colunas `username` do SQLite e do PocketBase, enriquecendo o cadastro do cliente sem alterar o roteamento numérico.

### 8.3 Mecanismo Canônico Único: `s.realPhone(jid)`
Todo o código do servidor Go deve utilizar exclusivamente o método unificado `s.realPhone(jid types.JID) string` (localizado em [`cmd/server/chatwoot.go`](file:///c:/Users/khara/Desktop/APPS%20GRAVITY/Kallia/Kallia%20Call/cmd/server/chatwoot.go)), evitando reescrever lógicas redundantes de resolução de LID.

```
                  ┌─────────────────────────────────────┐
                  │          types.JID Recebido         │
                  └──────────────────┬──────────────────┘
                                     │
                    É Server == DefaultUserServer E len <= 13?
                                    / \
                             SIM   /   \  NÃO (É LID ou Privacy)
                                  /     \
                                 ▼       ▼
                       Retorna jid.User   Consulta Store.LIDs local
                                         (s.getClient().Store.LIDs.GetPNForLID)
                                                 / \
                                          ACHOU /   \ NÃO ACHOU
                                               /     \
                                              ▼       ▼
                                       Retorna PN    Consulta Servidor WhatsApp
                                                     (cli.GetUserInfo com timeout 3s)
                                                             │
                                                             ├─► Salva no Store.LIDs (PutLIDAndPN)
                                                             └─► Retorna PN real resolvido
```

### 8.3 Boas Práticas ao Salvar Contatos no CRM:
1. **Chamadas Recebidas (`events.CallOffer`)**: Sempre verificar `evt.CallCreatorAlt` (onde o WhatsApp envia o PN real quando `evt.From` for um LID) e fazer fallback para `s.realPhone(evt.From)`.
2. **Upsert no PocketBase (`UpsertContactPB`)**: O filtro de busca busca por `(workspace_id = ws OR session_id = sid) AND (phone = pn OR lid = lid)`. Se um contato foi cadastrado inicialmente com o LID e posteriormente o telefone real foi descoberto, a linha é atualizada automaticamente substituindo o `phone` pelo número real e preenchendo o campo `lid`.

---

## 9. Mídia VoIP, Codec MLow e Resiliência

- **Codec MLow (Meta Low-bitrate)**: Exigido nativamente pelo WhatsApp para chamadas VoIP. Compilado via CGO com `-tags mlow` usando `libopus_mlow.so` (Linux) ou `opus_mlow.dll` (Windows).
- **Parser de Sinalização Resiliente (`ExtractNodeInfo`)**: Varredura prioritária de sub-nós XML (`offer`, `accept`, `terminate`, `transport`), garantindo estabilidade mesmo em variações de estrofes de latência enviadas pelo WhatsApp.
- **Resolução Assíncrona de LID**: Identificação do número real de telefone a partir de LIDs de companion devices executada de forma assíncrona (0ms de impacto na sinalização da chamada).
- **Tratamento de `accepted_elsewhere`**: Encerramento limpo e imediato no painel web quando o usuário atende a ligação pelo aparelho celular principal.

---

## 10. Segurança e Hardening

- **Autenticação JWT**: Tokens assinados com HMAC-SHA256 (`KALLIA_JWT_SECRET`) vinculados ao `userId` e `role`.
- **Criptografia AES-256-GCM**: Chaves de provedores de IA protegidas em repouso no PocketBase na coleção `ai_providers`.
- **Sanitização de Chaves**: Remoção estrita de campos de chaves de API (`geminiApiKey`, `apiKey`, `token`) dos objetos de configuração em trânsito e em repouso nas coleções `agents` e `sessions`.
- **Chaves de Conexão Individuais (`kc_*`)**: Chave exclusiva por sessão para consumo de APIs externas via header `X-Connection-API-Key`.
- **Tickets de Uso Único para SSE/WebSockets**: Tokens de 30s de uso único para conexões de streaming sem expor o JWT na URL.
- **Proteção Anti-SSRF (`safehttp.go`)**: Validação de URLs de webhooks e mídia contra endereços IP privados/reservados.
- **Isolamento por Workspace**: Todas as rotas de gerenciamento filtram recursos pelo `workspace_id` do usuário logado, exceto para o `appadmin` com visão global.

---

---

## 11. Central Omnichannel de Conversas & Mensageria WhatsApp

A Central de Conversas (`/conversations`) opera com sincronização em tempo real de baixa latência e suporte nativo ao protocolo estendido do WhatsApp:

### 11.1 Estrutura de Comunicação em Tempo Real
- **WebSocket Hub (`realtime_ws.go`)**: Endpoint `/api/workspaces/{wid}/ws?token=...` conectado a todos os operadores do Workspace. As mensagens enviadas ou recebidas são despachadas localmente de forma síncrona (< 1ms) e sincronizadas entre múltiplos nós através de canais Redis Pub/Sub (`ws:workspace:{wid}`).
- **Eventos Transmitidos**:
  - `message:created`: Nova mensagem recebida do WhatsApp, disparada por operador ou gerada por IA.
  - `message:updated`: Atualização de reações de emoji, texto editado ou mensagem revogada/apagada.
  - `typing`: Indicador de digitação do cliente em tempo real.
  - `conversation:updated`: Atualização de status (aberta, pendente, resolvida), tags ou atribuição de operador.

### 11.2 Storage Híbrido de Mídia e Motor de Retenção de Disco
- **Descriptografia Automática no Whatsmeow**: Ao receber mensagens de mídia (`ImageMessage`, `AudioMessage`, `VideoMessage`, `DocumentMessage`), o Whatsmeow descriptografa os bytes via `cli.Download` e os armazena em `storage/media/{workspace_id}/{message_id}.{ext}`.
- **Endpoint HTTP com Cache (`GET /api/media/{wid}/{fileName}`)**: Rota pública isenta de Bearer token (para carregamento nativo em tags `<img>`, `<audio>` e `<video>`), com proteção contra *path traversal* e cabeçalho `Cache-Control: public, max-age=86400`.
- **Motor de Retenção Automática (`StartMediaCleaner`)**: Rotina diária que remove mídias com mais de 30 dias (configurável via `KALLIA_MEDIA_RETENTION_DAYS`), preservando espaço no disco do VPS e mantendo todo o histórico textual no PostgreSQL.

### 11.3 Interações de Mensagens Estilo WhatsApp
1. **Reações com Emojis**:
   - Barra flutuante com 6 emojis rápidos (`👍 ❤️ 😂 😮 😢 🙏`) ao passar o mouse.
   - Sincronização bidirecional via `whatsmeow.BuildReaction` e exibição de badges na base dos balões.
2. **Respostas com Citação (Reply / Quoted Message)**:
   - Prévia visual com barra de cancelamento (`X`) acima do input bar.
   - Injeção de `waE2E.ContextInfo` (com `StanzaID` e citação original) para que o WhatsApp do cliente renderize a mensagem respondida.
3. **Edição de Mensagens**:
   - Edição de mensagens enviadas via `PATCH /api/conversations/{convId}/messages/{msgId}`.
   - Disparo do protocolo de edição no WhatsApp (`whatsmeow.BuildEdit`) e exibição do badge `(editada)` no balão.
4. **Apagar para Todos (Revoke)**:
   - Revogação de mensagens enviadas via `DELETE /api/conversations/{convId}/messages/{msgId}`.
   - Disparo do comando de revogação no WhatsApp (`whatsmeow.BuildRevoke`) e substituição do texto por *"Esta mensagem foi apagada"*.
5. **Separadores de Data & Smart Auto-Scroll**:
   - Pílulas sticky agrupando o histórico em *"Hoje"*, *"Ontem"*, dias da semana ou data completa.
   - Detecção de rolagem manual: pausa o scroll automático ao subir para ler histórico antigo e fornece botão flutuante `↓` para retorno rápido.

---

## 12. Manutenção e Atualizações

Sempre que uma alteração estrutural, novo modelo de dados ou adição de protocolo for realizada no sistema, este arquivo **`ARQUITETURA.MD`** deve ser atualizado imediatamente.
