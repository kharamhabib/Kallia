# Arquitetura do Sistema: Kallia

O **Kallia** (plataforma PABX VoIP profissional SaaS baseada em WhatsApp) é uma solução completa de atendimento por voz, CRM de contatos e inteligência artificial conversacional em tempo real que permite realizar e receber chamadas de voz diretamente pelo navegador, gerenciar múltiplos projetos e conexões, e automatizar atendimentos com agentes de IA multi-provedor autônomos.

O sistema suporta **múltiplos provedores de IA de voz em tempo real**:

- **Google Gemini Live** (`gemini_live.go`) — API nativa de voz bidirecional do Google via WebSockets com 5 vozes e troca dinâmica de persona.
- **xAI Grok Realtime** (`grok_live.go`) — API de voz em tempo real da xAI com suporte a Web Search, X Search, reasoning effort (`high`/`none`), transcrição nativa e 26 vozes.
- **OpenAI Realtime** (planejado) — Estrutura preparada para integração futura.

Modos de operação da IA:

1. **Server-Side (Autônoma/Principal)**: O servidor Go gerencia tudo diretamente em background (WebSocket + CGO Opus/MLow + Pipeline de Áudio), sem necessidade de manter abas de navegador abertas. Suporta múltiplos agentes especialistas, transferência de chamadas em tempo real (`TransferTo`) e troca dinâmica de provedor (Gemini ↔ Grok) durante a chamada.
2. **Client-Side (Híbrida/Navegador)**: O áudio é roteado através do navegador do operador via WebRTC, gerenciando a conexão com a IA diretamente na ponta cliente.

---

## 1. Visão Geral da Arquitetura e Multi-Tenancy

O Kallia foi desenhado para operação em formato **SaaS Multi-tenant**:

1. **Projetos e Planos (Billing)**:
   - Planos vinculados ao projeto (`trial`, `basic`, `advantage`, `expert`), controlando o status (`active` / `inactive`), vigência (`plan_starts_at`, `plan_ends_at`) e o limite de conexões de WhatsApp permitidas (ex: Básico 1 conexão, Advantage 3 conexões, Expert 5 conexões).
2. **Controle de Acesso por Roles (RBAC)**:
   - `appadmin`: Superadministrador com visão global de todas as conexões, projetos e usuários cadastrados em todos os bancos de dados (PocketBase e SQLite). Possui permissão para gerenciar, pausar e excluir qualquer conexão (com exclusão em cascata em ambos os bancos).
   - `creator`: Proprietário do tenant/projeto. Gerencia suas próprias conexões, API keys, agentes especialistas e integrações.
   - `normal`: Operador convidado. Acesso operacional (efetuar e receber chamadas), sem permissão para criar/deletar conexões ou chaves.
3. **Módulo de CRM de Contatos Integrado**:
   - Cada sessão de WhatsApp possui repositório de contatos no PocketBase (`contacts`) e SQLite local. Permite cadastrar e gerenciar Nome, Telefone, E-mail, Empresa, Notas, Tags, LID, JID e Foto de perfil.
   - Integração direta entre o CRM e o Webphone: ao clicar no ícone de telefone de qualquer contato, o sistema navega reativamente para a tela de discagem e preenche automaticamente o número do destinatário.
   - Resolução de contato centralizada (`useContactDisplay` e `useContactInfo`), exibindo o nome real e avatar do cliente no Dashboard, Histórico, Notificações de Chamadas e Webphone.
4. **Backend (Go Puro + CGO MLow)**:
   - Gerencia o ciclo de vida das sessões do WhatsApp via `whatsmeow` com SQLite isolado por sessão, controla chamadas VoIP, encapsula sinalização WebRTC, sincroniza dados em tempo real com o **PocketBase** via SSE (`/api/realtime`), orquestra filas e semáforos de concorrência com o **Redis 7** (com fallback automático em memória), executa os clientes nativos Gemini Live (`gemini_live.go`) e Grok Realtime (`grok_live.go`), orquestra o loop de áudio server-side (`ai_agent.go`) com transferência de especialistas (`TransferTo`), gerencia provedores de IA com chaves criptografadas (`ai_providers.go`, `crypto.go`) e expõe a API HTTP/SSE autenticada por JWT.
5. **Frontend (React 19, TypeScript, Vite)**:
   - Painel do operador com Login JWT integrado ao PocketBase, escopo automático do projeto ativo, discador VoIP, gerenciamento de agentes, módulo de CRM, histórico interativo, modais reutilizáveis (`ConfirmModal`) e widget embutível para o Chatwoot.

```
┌────────────────────────────────────────────────────────────────────────────────────────┐
│                                BROWSER (React Frontend)                                │
│                                                                                        │
│ ┌────────────────┐      ┌─────────────────────────┐ (Se Client-Side) ┌────────────────┐│
│ │  Painel Web /  │◄────►│    GeminiLiveAgent      │◄───────────────►│ Google Gemini  ││
│ │ CRM / Webphone │      │  (Audio Loop & Bridge)  │                 │ (Bidi WebSocket││
│ └───────┬────────┘      └────────────┬────────────┘                 └────────────────┘│
└─────────┼────────────────────────────┼─────────────────────────────────────────────────┘
          │ WebRTC (SDP / Opus)        │ PCM 16kHz / 24kHz
          ▼                            ▼
┌────────────────────────────────────────────────────────────────────────────────────────┐
│                                  BACKEND (Go Server)                                   │
│                                                                                        │
│ ┌────────────────┐      ┌─────────────────────────┐ (Se Server-Side) ┌────────────────┐│
│ │ JWT / REST /   │◄────►│ ServerAIAgent / Transfer│◄───────────────►│ Gemini / Grok  ││
│ │ SSE Broker     │      │ (Agentes Especialistas) │                 │ (Bidi WebSocket││
│ └───────┬────────┘      └────────────┬────────────┘                 └────────────────┘│
│         │                            ▼                                                 │
│         │                    SessionManager (VoIP)◄─────────► PocketBase (SSOT Central)│
│         │                            ▲                     (Realtime SSE & Hydrate)    │
│         │                            │                                                 │
│         │                            ├──────────────────────► SQLite (WhatsApp Chaves) │
│         │                            │                                                 │
│         └────────────────────────────┴──────────────────────► Redis 7 (Filas & Locks)  │
│                                                               (Fallback In-Memory)     │
└──────────────────────────────────────┬─────────────────────────────────────────────────┘
                                       │ VoIP (WhatsApp Protocol)
                                       ▼
                                WhatsApp VoIP Server
```

---

## 2. Tecnologias Utilizadas

### Backend

- **Linguagem**: Go (Golang) 1.26+
- **Autenticação & Dados Primários (SSOT)**: PocketBase (Google OAuth2, e-mail/senha, RBAC, REST API, SSE Realtime `/api/realtime`).
- **Persistência de Sessão WhatsApp**: SQLite nativo isolado por conexão (`./storage/whatsapp/{id}.db`) para armazenamento de chaves criptográficas do protocolo Signal/WhatsApp.
- **Fila & Concorrência**: Redis 7 com fallback automático em memória RAM (`queue.go`) para rate-limiting anti-bloqueio e entrega de webhooks.
- **Processamento de Mídia**: CGO com wrapping de codecs Opus nativos (`opus_mlow` do WhatsApp).
- **Gravação de Áudio Dual-Channel**: Gravação e mixagem estocástica em tempo real dos dois canais de áudio (Cliente + IA) salvas em `storage/recordings/YYYYMMDD_HHMMSS_Contato_CallID.wav` com player autenticado.
- **Protocolo**: Sinalização de VoIP via nós binários do WhatsApp e transporte de mídia UDP (SRTP) intermediado por WebRTC.
- **Comunicação IA Multi-Provedor**: WebSocket bidirecional nativo (`github.com/gorilla/websocket`) para comunicação com Gemini Live (`generativelanguage.googleapis.com`) e Grok Realtime (`wss://api.x.ai/v1/realtime`).
- **Criptografia de Chaves de API**: Chaves de API dos provedores de IA (Gemini, Grok, OpenAI) são criptografadas com AES-256-GCM no banco e descriptografadas em runtime com a variável `KALLIA_AI_ENCRYPTION_KEY`.

### Frontend

- **Core**: React 19, TypeScript, Vite.
- **Estilização**: Tailwind CSS v4, Lucide Icons, Design System executivo escuro/claro.
- **Componentes Globais Reutilizáveis**:
  - `ConfirmModal`: Modal de confirmação seguro utilizado em exclusões do CRM e do Histórico.
  - `AudioRecordingPlayer`: Player de áudio com marcador de linha do tempo customizado (`.audio-slider`) e controle de volume/download.
  - `TranscriptModal` & `SummaryModal`: Visualizadores modais de transcrição e resumos gerados por IA.
- **Estado**: Zustand (Stores globais para controle de chamadas, sessões, autenticação, navegação e IA).
- **Comunicação**: Event Stream via SSE (`/api/events`) autenticado por ticket temporário e requisições HTTP REST com Bearer Token.

---

## 3. Estrutura de Arquivos Principal

```
Kallia/
├── cmd/
│   └── server/                      # Servidor Go Principal
│       ├── main.go                  # Bootstrap, inicialização do PocketBase, scheduler e listener SSE
│       ├── auth.go                  # Autenticação JWT, login PocketBase, middleware RBAC e SuperAdmin
│       ├── db.go                    # dbProvider com suporte a SQLite local e namespaces
│       ├── project.go               # Handlers de gerenciamento de projetos, planos e limites de conexões
│       ├── agents_api.go            # Handlers REST para CRUD e vinculação de Agentes Especialistas
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
│       ├── httpapi.go               # Rotas da API HTTP/WebRTC, unificação de sessões, SSE, CORS, rate limit
│       ├── pocketbase_client.go     # Cliente PocketBase autenticado de superuser com CRUD para todas as coleções
│       ├── pocketbase_sync.go       # Motor de hidratação inicial e listener SSE persistente (/api/realtime)
│       ├── queue.go                 # Gerenciador de filas Redis com fallback automático In-Memory
│       ├── safehttp.go              # Guarda anti-SSRF (validação de URL/DNS/IP + redirects)
│       ├── server.go                # Inicialização do servidor + hidratação do histórico do banco
│       ├── session.go               # Estado WhatsApp/VoIP, auto-atendimento, attachServerAI
│       ├── sessionmanager.go        # Ciclo de vida de conexões, restauração segura no Dev e exclusão nos dois bancos
│       ├── sessionstore.go          # Operações no SQLite local (cache, contacts, call_history, ratings)
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
│       ├── App.tsx                  # Ponto de entrada React com rotas autenticadas e modal de login
│       ├── components/
│       │   ├── auth/LoginScreen.tsx # Tela de login integrada com PocketBase e Google OAuth2
│       │   ├── layout/
│       │   │   ├── AppShell.tsx     # Layout principal com barra superior e seletor de workspaces
│       │   │   └── Sidebar.tsx      # Navegação lateral limpa e responsiva
│       │   ├── shared/
│       │   │   └── ConfirmModal.tsx # Modal reutilizável de confirmação com variantes de ação
│       │   └── domain/
│       │       ├── call/Webphone.tsx         # Discador Webphone com atalho de discagem do CRM
│       │       ├── history/
│       │       │   ├── HistoryTable.tsx       # Tabela de histórico com badges discretos e exclusão autenticada
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
│       │   ├── DashboardPage.tsx     # Dashboard executivo com KPIs, histórico de atendimentos e botões de IA
│       │   ├── ContactsPage.tsx      # Módulo de CRM de contatos com busca, criação, edição e exclusão
│       │   ├── AgentsPage.tsx        # Central Única de Agentes IA (Master-Detail: Agente Principal + Especialistas)
│       │   └── ConnectionsPage.tsx   # Conexões de WhatsApp com Visão Global para SuperAdmin
│       ├── services/
│       │   ├── auth.ts               # Login/Logout e utilitários de token no localStorage
│       │   ├── contacts.ts           # Serviços REST de gerenciamento de contatos (CRM)
│       │   ├── agents.ts             # Serviços REST de gerenciamento de agentes
│       │   └── history.ts            # Serviços de busca e exclusão autenticada de histórico
│       ├── hooks/
│       │   ├── useContactDisplay.ts  # Hook reativo de resolução de nomes e fotos de contatos
│       │   └── useContactInfo.ts     # Hook de busca e cache de informações de contato por JID/LID/Telefone
│       ├── styles/
│       │   └── index.css             # Estilos globais, variáveis CSS, micro-animações e classe .audio-slider
│       └── lib/
│           ├── api.ts                # Cliente HTTP centralizado com injeção automática de Bearer Token
│           └── event-stream.ts       # SSE com ticket de uso único + reconexão manual c/ backoff
```

---

## 4. Multi-Tenancy, Autenticação, CRM e Gestão de Planos

### 4.1 Modelo de Dados (PocketBase SSOT & Sincronização em Tempo Real)

O **PocketBase** atua como a **Fonte Única de Verdade (SSOT)** central para todos os metadados do ecossistema Kallia:

1. **`projects`**:
   - `id`, `name`, `plan` (`trial` | `basic` | `advantage` | `expert`), `plan_status` (`active` | `inactive` | `canceled`), `plan_starts_at`, `plan_ends_at`.
2. **`users`**:
   - `id`, `email`, `password`, `role` (`appadmin` | `creator` | `normal`), `project_id`, `name`, `avatar`.
3. **`sessions`**:
   - `id`, `sid`, `name`, `jid`, `webhook`, `chatwoot`, `ai_config`, `project_id`, `api_key`.
4. **`agents`**:
   - `id`, `session_id`, `name`, `description`, `ai_config`, `inbound`, `outbound`.
5. **`contacts`**:
   - `id`, `session_id`, `phone`, `name`, `email`, `company`, `notes`, `tags`, `avatar_url`, `lid`, `jid`.
6. **`call_history`**:
   - `id`, `session_id`, `call_id`, `peer`, `direction` (`inbound` | `outbound`), `started_at`, `ended_at`, `summary`, `recording_url`, `transcript`, `agent_id`.
7. **`ai_providers`**:
   - `id`, `project_id`, `provider` (`gemini` | `grok` | `openai` | `elevenlabs`), `encrypted_api_key`, `enabled`, `default_model`, `options_json`.
8. **`call_ratings`**:
   - `id`, `session_id`, `call_id`, `score`, `comment`, `agent_id`.

#### Arquitetura de Sincronização em Tempo Real (Dev ↔ VPS)
- **Hidratação Inicial no Boot (`hydrateFromPocketBase`)**: Ao iniciar, o servidor Go obtém automaticamente o token de Superuser/Admin do PocketBase e sincroniza todos os projetos, sessões, agentes, provedores e contatos no banco local.
- **Escuta em Tempo Real (`/api/realtime` SSE)**: O Go mantém uma subscrição SSE persistente conectada ao PocketBase. Qualquer alteração feita na VPS ou no ambiente DEV é propagada e atualizada atomicamente no banco local e emitida aos clientes conectados via SSE interno.
- **Sessões em Standby no Dev**: Instâncias ativas na VPS são carregadas no ambiente Dev no estado configurável (permitindo edição de Agentes, Prompts, Tools e CRM) sem colidir ou disputar o socket físico do WhatsApp.
- **Exclusão Sincronizada nos Dois Bancos**: Ao excluir uma sessão pelo painel (pelo SuperAdmin ou proprietário), o sistema purga o registro tanto do SQLite local quanto do PocketBase remoto e deleta em cascata todos os agentes e contatos vinculados.
- **Isolamento de Mídia VoIP**: No SQLite local (`./storage/whatsapp/{id}.db`), apenas as chaves criptográficas de handshake do WhatsApp (`whatsmeow`) e streams RTP de voz permanecem isolados na máquina servidora.

### 4.2 Visão Global para SuperAdmin (`appadmin`)
- O usuário com perfil `appadmin` possui acesso irrestrito a todas as conexões da plataforma.
- A listagem de sessões (`GET /api/sessions`) unifica e deduplica dados da memória ativa, SQLite e PocketBase, exibindo o status de cada conexão e identificando o tenant proprietário (`ownerEmail`).

---

## 5. Agentes de IA e Transferência de Chamadas (Hot-Swap)

### 5.1 Persona Inbound / Outbound por Conexão

Cada conexão do WhatsApp pode estar vinculada a múltiplos agentes especialistas cadastrados no sistema. Os agentes podem ser definidos especificamente para:

- Atendimento de ligações recebidas (**Inbound**).
- Realização de ligações ativas (**Outbound**).
- Ambos ou Agente Padrão.

### 5.2 Provedores de IA Multi-Provedor

O sistema suporta múltiplos provedores de IA de voz, gerenciados via coleção `ai_providers` no PocketBase:

- **Google Gemini Live**: Vozes nativas (Puck, Charon, Kore, Fenrir, Aoede), campo `languageCode` nativo no `session.update`.
- **xAI Grok Realtime**: 26 vozes nativas (Eve ⭐, Sal ⭐, Ara, Carina, Luna, Iris, Celeste, Ursa, Zagan, Helix, Orion, Altair, Zenith, Perseus, Helios, Kepler, Rigel, Sirius, Castor, Naksh, Atlas, Leo, Rex, Lux, Cosmo, Lumen). Funcionalidades exclusivas:
  - **Reasoning Effort**: `high` (raciocínio profundo) ou `none` (resposta ultrarrápida) via query param `reasoning.effort`.
  - **Ferramentas Nativas**: `web_search` (busca na web em tempo real) e `x_search` (busca no X/Twitter).
  - **Transcrição Nativa**: Motor `grok-transcribe` com parâmetro de `language`.
  - **Diretiva de Idioma**: Injeção textual explícita nas `instructions` do Grok.
  - **VAD Ajustado**: `threshold: 0.5`, `prefix_padding_ms: 300`, `silence_duration_ms: 500`.
  - **Interrupção Instantânea (Barge-in)**: Evento `input_audio_buffer.speech_started` limpa a fila de áudio da IA.
- **OpenAI Realtime** (planejado): Estrutura preparada.

As chaves de API são armazenadas criptografadas com **AES-256-GCM** na coleção `ai_providers` e descriptografadas em runtime.

### 5.3 Transferência Dinâmica entre Agentes (`TransferTo`)

Durante uma chamada em andamento operada pelo `ServerAIAgent`:

1. A IA detecta que o assunto requer um especialista (ex: "Transferir para o suporte técnico").
2. A IA aciona a ferramenta de transferência (`transfer_to_agent`).
3. O método `ServerAIAgent.TransferTo(targetAgentID)` é executado no servidor:
   - Desconecta a sessão atual do provedor de IA (Gemini ou Grok) de forma limpa.
   - Carrega as instruções e o prompt do novo agente especialista.
   - Conecta a nova sessão no provedor configurado, injetando a nova persona e o histórico recente do diálogo.
   - Mantém a mesma mídia VoIP do WhatsApp 100% ativa sem que a ligação caia!

---

## 6. Mídia VoIP, Sinalização e Resiliência

### 6.1 Codec MLow (Meta Low-bitrate)

- A transmissão de áudio VoIP nativa do WhatsApp exige o codec **MLow**.
- A compilação é realizada via CGO com a flag `-tags mlow` e a biblioteca `libopus_mlow.so` (Linux) ou `opus_mlow.dll` (Windows) presente em `native/`.
- Caso o binário seja compilado sem CGO/MLow, o sistema roda em modo **somente sinalização** (permitindo o pareamento e recebimento do sinal, mas sem áudio).

### 6.2 Parser de Sinalização VoIP Resiliente (`ExtractNodeInfo`)

- O WhatsApp envolve nós binários `<call>` contendo estrofes secundárias de latência e transporte (como `<relaylatency>`, `<te>`, `<enc>`) junto com os nós de controle principal (`offer`, `accept`, `terminate`, `reject`, `transport`, `preaccept`).
- O parser `ExtractNodeInfo` utiliza um mapa de priorização de tags primárias (`signalingTags`). Ele varre a árvore XML em busca do comando de controle VoIP verdadeiro e do `call-id` correto, garantindo resiliência total mesmo quando a ordem ou quantidade de sub-nós é alterada pelo WhatsApp.

### 6.3 Resolução Assíncrona de LID e Encerramento `accepted_elsewhere`

- **Sinalização Instantânea (0ms Delay)**: A resolução de telefones reais (PN) a partir de LIDs de dispositivos secundários (`realPhone`) é executada de forma **100% assíncrona** (`goSafe`) com um limite estrito de timeout (`context.WithTimeout(2s)`) e sanitização `.ToNonAD()`.
- **Tratamento de Chamadas Atendidas em Outros Dispositivos (`accepted_elsewhere`)**:
  - Quando o usuário atende a chamada em seu celular principal ou em outro companion device, o WhatsApp envia um encerramento do tipo `reason="accepted_elsewhere"`.
  - O backend captura a estrofe de término, transiciona o estado da chamada para `accepted_elsewhere` e notifica o frontend via evento `call-ended` / `call-status`.
  - O store do frontend (`useCalls`) reage imediatamente alterando `incoming: null`, fechando o modal de toque e pausando a reprodução de áudio sem deixar a interface pendente.

---

## 7. Segurança e Hardening

- **Autenticação por JWT**: Senhas salvas via `bcrypt`. Tokens assinados com HMAC-SHA256 (`KALLIA_JWT_SECRET`).
- **Criptografia de Chaves de IA (AES-256-GCM)**: Chaves de API dos provedores (Gemini, Grok, OpenAI) são criptografadas no banco (`ai_providers.encrypted_api_key`) com a variável `KALLIA_ENCRYPTION_KEY` e descriptografadas apenas em runtime. Nunca transitam em plain text.
- **Chaves de Conexão Individuais (`kc_*`)**: Cada conexão de WhatsApp gera uma API key única (`kc_...`) para consumo externo via header `X-Connection-API-Key`.
- **Tickets de Uso Único para SSE/WebSockets**: O SSE (`/api/events`) e os proxies usam tickets gerados via `POST /api/events/ticket` com validade de 30s.
- **Proteção Anti-SSRF (`safehttp.go`)**: URLs externas de mídia e webhooks são validadas contra endereços IP privados/reservados.
- **Isolamento Multi-tenant**: Todas as rotas de gerenciamento filtram os recursos pelo `project_id` do usuário logado, exceto para o `appadmin` que possui acesso global.

---

## 8. Manutenção e Atualizações

Sempre que uma nova alteração de arquitetura, tabela de banco de dados ou protocolo de mídia for efetuada, este arquivo **`ARQUITETURA.MD`** deve ser atualizado imediatamente.
