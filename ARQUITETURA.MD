# Arquitetura do Sistema: Kallia 2.0

O **Kallia** (plataforma PABX VoIP profissional SaaS baseada em WhatsApp) é uma solução completa de atendimento por voz, CRM de contatos e inteligência artificial conversacional em tempo real que permite realizar e receber chamadas de voz diretamente pelo navegador, gerenciar múltiplos workspaces e conexões desacopladas, e automatizar atendimentos com agentes de IA multi-provedor autônomos.

O sistema suporta **múltiplos provedores de IA de voz em tempo real**:

- **Google Gemini Live** (`gemini_live.go`) — API nativa de voz bidirecional do Google via WebSockets com 5 vozes e troca dinâmica de persona.
- **xAI Grok Realtime** (`grok_live.go`) — API de voz em tempo real da xAI com suporte a Web Search, X Search, reasoning effort (`high`/`none`), transcrição nativa e 26 vozes.
- **OpenAI Realtime** (planejado) — Estrutura preparada para integração futura.

Modos de operação da IA:

1. **Server-Side (Autônoma/Principal)**: O servidor Go gerencia tudo diretamente em background (WebSocket + CGO Opus/MLow + Pipeline de Áudio), sem necessidade de manter abas de navegador abertas. Suporta múltiplos agentes especialistas, transferência de chamadas em tempo real (`TransferTo`) e troca dinâmica de provedor (Gemini ↔ Grok) durante a chamada.
2. **Client-Side (Híbrida/Navegador)**: O áudio é roteado através do navegador do operador via WebRTC, gerenciando a conexão com a IA diretamente na ponta cliente.

---

## 1. Visão Geral da Arquitetura e Multi-Tenancy (Kallia 2.0 Workspaces)

O Kallia adota o modelo de **Workspaces Multi-Tenant Desacoplados**:

```
                              ┌────────────────────────────────────────┐
                              │            POCKETBASE (SSOT)           │
                              │  ┌──────────────────────────────────┐  │
                              │  │         workspaces               │  │
                              │  │ (Planos, Cotas, Membros, RBAC)   │  │
                              │  └─────────────────┬────────────────┘  │
                              └────────────────────┼───────────────────┘
                                                   │
                ┌──────────────────────────────────┼──────────────────────────────────┐
                │                                  │                                  │
                ▼                                  ▼                                  ▼
      ┌────────────────────┐            ┌────────────────────┐            ┌────────────────────┐
      │      contacts      │            │       agents       │            │    ai_providers    │
      │  (CRM do Workspace)│            │(Especialistas IA)  │            │(Chaves Criptograf.)│
      └────────────────────┘            └────────────────────┘            └────────────────────┘
                ▲                                  ▲                                  ▲
                │                                  │                                  │
                └──────────────────────────────────┼──────────────────────────────────┘
                                                   │ workspace_id
                                                   ▼
                                        ┌────────────────────┐
                                        │      sessions      │
                                        │(Instâncias WhatsApp│
                                        │   Desacopladas)    │
                                        └──────────┬─────────┘
                                                   │
                         ┌─────────────────────────┴─────────────────────────┐
                         │                                                   │
                         ▼                                                   ▼
              ┌─────────────────────┐                             ┌─────────────────────┐
              │    call_history     │                             │    call_ratings     │
              │ (Histórico VoIP)    │                             │  (NPS de Atendimento)│
              └─────────────────────┘                             └─────────────────────┘
```

### Princípios Fundamentais do Modelo Desacoplado:
1. **Workspaces como Tenant Raiz (SSOT)**:
   - Todo recurso (Agentes, Provedores de IA, CRM de Contatos, Histórico de Chamadas, Avaliações e Conexões) pertence a um **Workspace** (`workspace_id`), eliminando o antigo conceito de `projects`.
   - Um usuário pode ser membro ou proprietário de múltiplos Workspaces com papéis granulares (`owner`, `admin`, `member`) via `workspace_members`.
2. **Desacoplamento Total de Conexões WhatsApp**:
   - As conexões WhatsApp (`sessions`) são apenas **canais de entrada e saída de áudio**.
   - Se uma linha de WhatsApp for excluída, reconectada ou substituída, **todos os dados de inteligência (Agentes, CRM de Contatos, Chaves de Provedores e Histórico) permanecem 100% preservados no Workspace**.
3. **Controle de Cotas por Plano de Workspace**:
   - Cada Workspace possui limites configuráveis de:
     - `max_connections`: Número de linhas WhatsApp ativas simultaneamente (ex: Trial: 1, Basic: 1, Advantage: 3, Expert: 5).
     - `max_concurrent_calls`: Número de chamadas de voz simultâneas.
     - `max_agents`: Número de personas/agentes especialistas disponíveis.
4. **Controle de Acesso por Roles (RBAC)**:
   - `appadmin`: Superadministrador com visão global de todos os Workspaces, sessões e usuários cadastrados no ecossistema (PocketBase e SQLite). Possui permissão para gerenciar e auditar qualquer workspace e conexão.
   - `creator` / `owner`: Proprietário do Workspace. Gerencia conexões, API keys, membros, agentes especialistas e integrações de IA.
   - `normal` / `member`: Operador convidado. Acesso operacional (efetuar e receber chamadas, visualizar CRM e histórico), sem permissão para criar/deletar conexões ou chaves de provedores.

---

## 2. Divisão de Responsabilidade entre Bancos de Dados

O sistema combina o **PocketBase** como autoridade de negócio central e o **SQLite Local** para operações de baixa latência e protocolos criptográficos:

```
┌────────────────────────────────────────────────────────────────────────────────────────┐
│                                POCKETBASE (SSOT CENTRAL)                               │
│                                                                                        │
│  - users & auth: Gestão de identidade, senhas e roles.                                 │
│  - workspaces: Organizações, cotas (max_connections, max_agents) e planos de billing.  │
│  - workspace_members: Associação n-para-n entre usuários e workspaces.                 │
│  - agents: Prompts de IA, vozes, ferramentas e parâmetros de raciocínio.               │
│  - ai_providers: Chaves criptografadas (AES-256-GCM) de Gemini, Grok e OpenAI.         │
│  - contacts: CRM completo de contatos por empresa.                                     │
│  - call_history & call_ratings: Histórico consolidado de ligações, resumos e NPS.      │
│  - sessions: Cadastro de conexões vinculadas ao workspace_id.                          │
└────────────────────────────────────────────────────────────────────────────────────────┘
                                            ▲
                                            │ Sincronização Bidirecional (SSE /api/realtime)
                                            │ e Hidratação no Boot (hydrateFromPocketBase)
                                            ▼
┌────────────────────────────────────────────────────────────────────────────────────────┐
│                              SQLITE LOCAL (BAIXA LATÊNCIA)                             │
│                                                                                        │
│  1. ./storage/whatsapp/{id}.db (whatsmeow):                                            │
│     - Chaves criptográficas fim-a-fim do protocolo Signal/WhatsApp.                    │
│     - Tokens de sessão, chaves de pré-compartilhamento e estado de dispositivo.        │
│                                                                                        │
│  2. sessions.db (Camada Operacional do Servidor Go):                                   │
│     - sessions: Metadados locais das instâncias ativas (alinhado a workspace_id).       │
│     - call_transcripts: Buffer de áudio em tempo real durante ligações VoIP ao vivo.   │
│     - sent_polls: Mapeamento binário de enquetes e botões interativos do WhatsApp.     │
│     - users / ai_providers / contacts: Cache local de fallback de leitura rápida.      │
└────────────────────────────────────────────────────────────────────────────────────────┘
```

---

## 3. Tecnologias Utilizadas

### Backend (Go 1.26+)
- **Autenticação & Dados Primários (SSOT)**: PocketBase (Google OAuth2, e-mail/senha, RBAC, REST API, SSE Realtime `/api/realtime`).
- **Persistência de Sessão WhatsApp**: SQLite nativo isolado por conexão (`./storage/whatsapp/{id}.db`) para o motor Signal/WhatsApp do `whatsmeow`.
- **Fila & Concorrência**: Redis 7 com fallback automático em memória RAM (`queue.go`) para rate-limiting anti-bloqueio e entrega de webhooks.
- **Processamento de Mídia**: CGO com wrapping de codecs Opus/MLow nativos (`libopus_mlow.so` / `opus_mlow.dll`).
- **Gravação de Áudio Dual-Channel**: Gravação e mixagem estocástica em tempo real dos dois canais de áudio (Cliente + IA) salvas em `storage/recordings/YYYYMMDD_HHMMSS_Contato_CallID.wav` com player autenticado.
- **Protocolo**: Sinalização de VoIP via nós binários do WhatsApp e transporte de mídia UDP (SRTP) intermediado por WebRTC.
- **Comunicação IA Multi-Provedor**: WebSocket bidirecional nativo (`github.com/gorilla/websocket`) para comunicação com Gemini Live (`generativelanguage.googleapis.com`) e Grok Realtime (`wss://api.x.ai/v1/realtime`).
- **Criptografia de Chaves de API**: Chaves de API dos provedores de IA são criptografadas com AES-256-GCM no banco e descriptografadas em runtime via `KALLIA_AI_ENCRYPTION_KEY`.

### Frontend (React 19, TypeScript, Vite)
- **Core**: React 19, TypeScript, Vite.
- **Estilização**: Vanilla CSS / Tailwind CSS v4, Lucide Icons, Design System executivo escuro/claro.
- **Componentes Globais Reutilizáveis**:
  - `WorkspaceSelector`: Seletor rápido de Workspace no cabeçalho com troca ágil de contexto.
  - `ConfirmModal`: Modal de confirmação seguro utilizado em exclusões do CRM e do Histórico.
  - `AudioRecordingPlayer`: Player de áudio com marcador de linha do tempo customizado (`.audio-slider`) e controle de volume/download.
  - `TranscriptModal` & `SummaryModal`: Visualizadores modais de transcrição e resumos gerados por IA.
- **Estado**: Zustand (Stores globais para chamadas, sessões, workspaces, autenticação e IA).
- **Comunicação**: Event Stream via SSE (`/api/events`) com tickets temporários e requisições HTTP REST com Bearer Token.

---

## 4. Estrutura de Arquivos Principal

```
Kallia/
├── pb_schema.json                   # Esquema consolidado das 8 coleções do PocketBase
├── pb_hooks/
│   └── main.pb.js                   # Hook PocketBase para auto-criação de Workspace no registro de usuários
├── cmd/
│   └── server/                      # Servidor Go Principal
│       ├── main.go                  # Bootstrap, inicialização do PocketBase, scheduler e listener SSE
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
│       ├── session.go               # Estado WhatsApp/VoIP, auto-atendimento, attachServerAI
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
│       ├── components/
│       │   ├── auth/LoginScreen.tsx # Tela de login integrada com PocketBase e Google OAuth2
│       │   ├── layout/
│       │   │   ├── AppShell.tsx     # Layout principal com barra superior e seletor de workspaces
│       │   │   └── Sidebar.tsx      # Navegação lateral limpa e responsiva
│       │   ├── shared/
│       │   │   ├── WorkspaceSelector.tsx # Seletor de workspace em tempo real
│       │   │   └── ConfirmModal.tsx      # Modal reutilizável de confirmação
│       │   └── domain/
│       │       ├── call/Webphone.tsx         # Discador Webphone com atalho de discagem do CRM
│       │       ├── history/
│       │       │   ├── HistoryTable.tsx       # Tabela de histórico por Workspace
│       │       │   ├── AudioRecordingPlayer.tsx # Player de áudio com marcador .audio-slider
│       │       │   ├── TranscriptModal.tsx    # Modal de transcrição completa
│       │       │   └── SummaryModal.tsx       # Modal de resumo por IA
│       │       ├── settings/
│       │       │   ├── SettingsTab.tsx        # Configurações de sistema (Chatwoot, Geral e Webhook)
│       │       │   ├── AISettingsPane.tsx     # Painel de Integração de Voz multi-provedor (Gemini/Grok/OpenAI)
│       │       │   ├── ToolsSettingsPane.tsx  # Painel de Ferramentas e Ações da IA
│       │       │   ├── PostCallSettingsPane.tsx # Notificações e resumos pós-chamada
│       │       │   ├── NPSSettingsPane.tsx    # Pesquisa de satisfação pós-atendimento (NPS)
│       │       │   └── FollowupSettingsPane.tsx # Mensagens de acompanhamento (Follow-up)
│       │       └── session/AIDialog.tsx      # Dialog de voz e seleção de agente especialista
│       ├── pages/
│       │   ├── DashboardPage.tsx     # Dashboard executivo com KPIs do Workspace ativo
│       │   ├── ContactsPage.tsx      # Módulo de CRM de contatos unificado por Workspace
│       │   ├── AgentsPage.tsx        # Central Única de Agentes IA do Workspace
│       │   └── ConnectionsPage.tsx   # Conexões de WhatsApp do Workspace + Visão Global para SuperAdmin
│       ├── services/
│       │   ├── auth.ts               # Login/Logout e utilitários de token no localStorage
│       │   ├── workspaces.ts         # Listagem, criação e troca de workspace ativo
│       │   ├── contacts.ts           # Serviços REST de gerenciamento de contatos (CRM)
│       │   ├── agents.ts             # Serviços REST de gerenciamento de agentes
│       │   └── history.ts            # Serviços de busca e exclusão autenticada de histórico
│       ├── hooks/
│       │   ├── useWorkspace.ts       # Hook de gerenciamento do workspace ativo e cotas
│       │   ├── useContactDisplay.ts  # Hook reativo de resolução de nomes e fotos de contatos
│       │   └── useContactInfo.ts     # Hook de busca e cache de informações de contato por JID/LID/Telefone
│       ├── styles/
│       │   └── index.css             # Estilos globais, variáveis CSS, micro-animações e classe .audio-slider
│       └── lib/
│           ├── api.ts                # Cliente HTTP centralizado com injeção automática de Bearer Token
│           └── event-stream.ts       # SSE com ticket de uso único + reconexão manual c/ backoff
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
| **`contacts`** | Base | CRM unificado de contatos | `id`, `workspace_id` (FK), `phone`, `name`, `email`, `company`, `notes`, `tags` (JSON), `avatar_url`, `lid`, `jid` |
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
- **Google Gemini Live**: Vozes nativas (Puck, Charon, Kore, Fenrir, Aoede), suporte a `languageCode` e chamada de funções (Tools).
- **xAI Grok Realtime**: 26 vozes nativas, reasoning effort (`high`/`none`), ferramentas nativas `web_search` e `x_search`, transcrição `grok-transcribe` e barge-in instantâneo via `input_audio_buffer.speech_started`.
- **Criptografia AES-256-GCM**: Todas as chaves de API dos provedores de IA são armazenadas criptografadas na coleção `ai_providers` com a chave `KALLIA_AI_ENCRYPTION_KEY` e descriptografadas somente em memória durante o atendimento.

### 7.2 Transferência Dinâmica entre Especialistas (`TransferTo`)
Durante uma chamada em andamento atendida pela IA:
1. A IA detecta a necessidade de transbordo (ex: suporte financeiro) e invoca a tool `transfer_to_agent`.
2. O servidor Go desconecta a sessão da IA atual de forma limpa, preservando o fluxo de áudio VoIP do WhatsApp 100% ativo.
3. Carrega o prompt e as instruções do novo agente especialista e injeta o histórico recente da conversa na nova conexão.
4. O atendimento prossegue com o novo especialista sem que a ligação caia.

---

## 8. Mídia VoIP, Codec MLow e Resiliência

- **Codec MLow (Meta Low-bitrate)**: Exigido nativamente pelo WhatsApp para chamadas VoIP. Compilado via CGO com `-tags mlow` usando `libopus_mlow.so` (Linux) ou `opus_mlow.dll` (Windows).
- **Parser de Sinalização Resiliente (`ExtractNodeInfo`)**: Varredura prioritária de sub-nós XML (`offer`, `accept`, `terminate`, `transport`), garantindo estabilidade mesmo em variações de estrofes de latência enviadas pelo WhatsApp.
- **Resolução Assíncrona de LID**: Identificação do número real de telefone a partir de LIDs de companion devices executada de forma assíncrona (0ms de impacto na sinalização da chamada).
- **Tratamento de `accepted_elsewhere`**: Encerramento limpo e imediato no painel web quando o usuário atende a ligação pelo aparelho celular principal.

---

## 9. Segurança e Hardening

- **Autenticação JWT**: Tokens assinados com HMAC-SHA256 (`KALLIA_JWT_SECRET`) vinculados ao `userId` e `role`.
- **Criptografia AES-256-GCM**: Chaves de provedores de IA protegidas em repouso no PocketBase.
- **Chaves de Conexão Individuais (`kc_*`)**: Chave exclusiva por sessão para consumo de APIs externas via header `X-Connection-API-Key`.
- **Tickets de Uso Único para SSE/WebSockets**: Tokens de 30s de uso único para conexões de streaming sem expor o JWT na URL.
- **Proteção Anti-SSRF (`safehttp.go`)**: Validação de URLs de webhooks e mídia contra endereços IP privados/reservados.
- **Isolamento por Workspace**: Todas as rotas de gerenciamento filtram recursos pelo `workspace_id` do usuário logado, exceto para o `appadmin` com visão global.

---

## 10. Manutenção e Atualizações

Sempre que uma alteração estrutural, novo modelo de dados ou adição de protocolo for realizada no sistema, este arquivo **`ARQUITETURA.MD`** deve ser atualizado imediatamente.
