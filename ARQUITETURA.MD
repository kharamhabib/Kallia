# Arquitetura do Sistema: Kallia

O **Kallia** (plataforma PABX VoIP desenvolvida a partir de evoluções dos projetos originários **AstraCalls** e **WaCalls**) é uma solução profissional SaaS de atendimento, CRM de contatos e inteligência de voz baseada em WhatsApp que permite realizar e receber chamadas de voz diretamente pelo navegador, gerenciar múltiplos projetos e conexões, e automatizar atendimentos com agentes de IA (Gemini Live).

O sistema suporta dois modos de operação para a **API Gemini Live** (Google):

1. **Server-Side (Autônoma/Principal)**: O servidor Go gerencia tudo diretamente em background (WebSocket + CGO Opus/MLow + Pipeline de Áudio), sem necessidade de manter abas de navegador abertas. Suporta múltiplos agentes especialistas e transferência de chamadas em tempo real.
2. **Client-Side (Híbrida/Navegador)**: O áudio é roteado através do navegador do operador via WebRTC, gerenciando a conexão com a IA.

---

## 1. Visão Geral da Arquitetura e Multi-Tenancy

O Kallia foi desenhado para operação em formato **SaaS Multi-tenant**:

1. **Projetos e Planos (Billing)**:
   - Planos vinculados ao projeto (`basic`, `advantage`, `expert`), controlando o status (`active` / `inactive`), vigência (`plan_starts_at`, `plan_ends_at`) e o limite de conexões de WhatsApp permitidas (ex: Básico 1 conexão, Advantage 3 conexões, Expert 8 conexões).
2. **Controle de Acesso por Roles (RBAC)**:
   - `appadmin`: Superadministrador com acesso total a todos os projetos, usuários e conexões do sistema.
   - `admin`: Administrador do projeto. Gerencia conexões, API keys, agentes especialistas e usuários do seu próprio projeto.
   - `normal`: Operador convidado. Acesso operacional (efetuar e receber chamadas), sem permissão para criar/deletar conexões, alterar chaves de API ou modificar agentes.
3. **Módulo de CRM de Contatos Integrado**:
   - Cada sessão de WhatsApp possui um repositório de contatos no PostgreSQL (`session_contacts`). Permite cadastrar e gerenciar Nome, Telefone, E-mail, Empresa, Notas, Tags, LID, JID e Foto de perfil.
   - Integração direta entre o CRM e o Webphone: ao clicar no ícone de telefone de qualquer contato, o sistema navega reativamente para a tela de discagem e preenche automaticamente o número do destinatário.
   - Resolução de contato centralizada (`useContactDisplay` e `useContactInfo`), exibindo o nome real e avatar do cliente no Dashboard, Histórico, Notificações de Chamadas e Webphone.
4. **Backend (Go)**:
   - Gerencia o ciclo de vida das sessões do WhatsApp via `whatsmeow`, controla chamadas VoIP, encapsula sinalização WebRTC, realiza a persistência no PostgreSQL (banco por sessão), executa o cliente nativo Gemini Live (`gemini_live.go`), orquestra o loop de áudio server-side (`ai_agent.go`) com transferência de especialistas (`TransferTo`) e expõe a API HTTP/SSE autenticada por JWT.
5. **Frontend (React 19, TypeScript, Vite)**:
   - Painel do operador com Login JWT (sem necessidade de digitar URL do servidor), escopo automático do projeto ativo, discador VoIP, gerenciamento de agentes, módulo de CRM, histórico interativo, modais reutilizáveis (`ConfirmModal`) e widget embutível para o Chatwoot.

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
│ │ JWT / REST /   │◄────►│ ServerAIAgent / Transfer│◄───────────────►│ Google Gemini  ││
│ │ SSE Broker     │      │ (Agentes Especialistas) │                 │ (Bidi WebSocket││
│ └────────────────┘      └────────────┬────────────┘                 └────────────────┘│
│                                      ▼                                                 │
│                              SessionManager (VoIP)◄─────────► PostgreSQL (Database)    │
└──────────────────────────────────────┬─────────────────────────────────────────────────┘
                                       │ VoIP (WhatsApp Prot)
                                       ▼
                              WhatsApp VoIP Server
```

---

## 2. Tecnologias Utilizadas

### Backend

- **Linguagem**: Go (Golang) 1.26+
- **Autenticação**: JWT nativo (HMAC-SHA256) com controle de perfis (`appadmin`, `admin`, `normal`).
- **Banco de Dados**: PostgreSQL (banco principal `kallia_main` + 1 banco por sessão `kallia_<session_id>`, com detecção automática de fallback para bancos legados `wacalls_main`).
- **Processamento de Mídia**: CGO com wrapping de codecs Opus nativos (`opus_mlow` do WhatsApp).
- **Gravação de Áudio Dual-Channel**: Gravação e mixagem estocástica em tempo real dos dois canais de áudio (Cliente + IA) salvas em `storage/recordings/YYYYMMDD_HHMMSS_Contato_CallID.wav` com player autenticado.
- **Protocolo**: Sinalização de VoIP via nós binários do WhatsApp e transporte de mídia UDP (SRTP) intermediado por WebRTC.
- **Comunicação Gemini**: WebSocket bidirecional nativo (`github.com/gorilla/websocket`) para comunicação direta com a API Gemini Live.

### Frontend

- **Core**: React 19, TypeScript, Vite.
- **Estilização**: Tailwind CSS v4, Lucide Icons, Design System sóbrio executivo escuro/claro.
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
│   ├── migrate/                     # Migrações e setup de tabelas do PostgreSQL (projects, users, sessions, agents, contacts, etc.)
│   └── server/                      # Servidor Go Principal
│       ├── main.go                  # Bootstrap, carregador de .env (KALLIA_*), flags e sinal do SO
│       ├── auth.go                  # Autenticação JWT, login, registro, geração de tickets e middleware RBAC
│       ├── db.go                    # dbProvider com suporte inteligente a namespaces (kallia_main / fallback wacalls)
│       ├── project.go               # Handlers de gerenciamento de projetos, planos e limites de conexões
│       ├── agents.go                # Handlers REST para CRUD e vinculação de Agentes Especialistas por conexão
│       ├── ai_agent.go              # Agente de voz server-side (WA<->Gemini + tools + transfer + post-call)
│       ├── ai_scheduler.go          # Scheduler background de ligações programadas do servidor
│       ├── aiconfig.go              # Handlers REST de configuração da IA
│       ├── authticket.go            # Tickets de uso único (30s) p/ SSE/WebSocket sem exposição de chave na URL
│       ├── gemini_live.go           # Cliente WebSocket nativo em Go para a API Gemini Live
│       ├── gemini_proxy.go          # Proxy WS/REST do Gemini (a key nunca sai do servidor)
│       ├── httpapi.go               # Rotas da API HTTP/WebRTC, SSE, CORS, rate limit, health/metrics
│       ├── safehttp.go              # Guarda anti-SSRF (validação de URL/DNS/IP + redirects)
│       ├── util.go                  # Helpers de fuso, retry HTTP e goroutines seguras (goSafe)
│       ├── server.go                # Inicialização do servidor + hidratação do histórico do banco
│       ├── session.go               # Estado WhatsApp/VoIP, auto-atendimento, attachServerAI
│       ├── sessionmanager.go        # Ciclo de vida e restauração de sessões do banco
│       └── sessionstore.go          # Operações no Postgres (users, projects, contacts, call_history, agents)
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
│       │   ├── auth/LoginScreen.tsx # Tela de login simplificada (sem campo de URL do servidor)
│       │   ├── layout/
│       │   │   ├── AppShell.tsx     # Layout principal com barra superior e gerenciador de workspaces
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
│       │       │       ├── settings/
│       │       │   ├── SettingsTab.tsx        # Configurações de sistema (Chatwoot, Geral e Webhook)
│       │       │   ├── AISettingsPane.tsx     # Painel de Voz, Chave Gemini e automação de atendimento
│       │       │   ├── ToolsSettingsPane.tsx    # Painel de Ferramentas e Ações da IA
│       │       │   ├── PostCallSettingsPane.tsx# Notificações e resumos pós-chamada
│       │       │   ├── NPSSettingsPane.tsx    # Pesquisa de satisfação pós-atendimento (NPS)
│       │       │   └── FollowupSettingsPane.tsx # Mensagens de acompanhamento (Follow-up)
│       │       └── session/AIDialog.tsx      # Dialog de voz e seleção de agente especialista
│       ├── pages/
│       │   ├── DashboardPage.tsx     # Dashboard executivo com KPIs, histórico de atendimentos e botões de IA
│       │   ├── ContactsPage.tsx      # Módulo de CRM de contatos com busca, criação, edição e confirmação de exclusão
│       │   ├── AgentsPage.tsx        # Central Única de Agentes IA (Master-Detail: Agente Principal + Especialistas + Tools + NPS)
│       │   └── ConnectionsPage.tsx   # Conexões de WhatsApp escopadas pelo plano do projeto
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

### 4.1 Modelo de Dados (PostgreSQL)

O banco principal (`kallia_main`) contém as tabelas fundamentais de controle de contas:

1. **`projects`**:
   - `id`, `name`, `plan` (`basic` | `advantage` | `expert`), `status` (`active` | `inactive`), `plan_starts_at`, `plan_ends_at`.
2. **`users`**:
   - `id`, `email`, `password_hash`, `role` (`appadmin` | `admin` | `normal`), `project_id`.
3. **`sessions`**:
   - `id`, `project_id`, `name`, `jid`, `status`, `api_key` (`kc_...`), `paired`.
4. **`agents`**:
   - `id`, `session_id`, `name`, `prompt`, `greeting`, `voice`, `inbound_enabled`, `outbound_enabled`, `is_default`.

Nos bancos por sessão (`kallia_<session_id>`):

5. **`session_contacts`**:
   - `id`, `phone`, `name`, `email`, `company`, `notes`, `tags`, `lid`, `jid`, `picture_url`, `created_at`, `updated_at`.

### 4.2 Integridade do CRM e Navegação Reativa

- O sistema sincroniza de forma transparente os números gravados no banco de contatos da sessão.
- Ao clicar no botão de discagem em `ContactsPage.tsx`, o aplicativo dispara o evento de navegação reativa `navigateToWebphone(phone)`, abrindo a página do discador Webphone e preenchendo automaticamente o campo de telefone.
- O hook `useContactDisplay` centraliza a resolução de identificadores, garantindo que o nome do contato cadastrado no CRM seja exibido em vez de números brutos em todas as telas do sistema.

---

## 5. Agentes de IA e Transferência de Chamadas (Hot-Swap)

### 5.1 Persona Inbound / Outbound por Conexão

Cada conexão do WhatsApp pode estar vinculada a múltiplos agentes especialistas cadastrados no sistema. Os agentes podem ser definidos especificamente para:

- Atendimento de ligações recebidas (**Inbound**).
- Realização de ligações ativas (**Outbound**).
- Ambos ou Agente Padrão.

### 5.2 Transferência Dinâmica entre Agentes (`TransferTo`)

Durante uma chamada em andamento operada pelo `ServerAIAgent`:

1. A IA detecta que o assunto requer um especialista (ex: "Transferir para o suporte técnico").
2. A IA aciona a ferramenta de transferência (`transfer_to_agent`).
3. O método `ServerAIAgent.TransferTo(targetAgentID)` é executado no servidor:
   - Desconecta a sessão atual do Gemini Live de forma limpa.
   - Carrega as instruções e o prompt do novo agente especialista.
   - Conecta a nova sessão do Gemini Live injetando a nova persona e o histórico recente do diálogo.
   - Mantém a mesma mídia VoIP do WhatsApp 100% ativa sem que a ligação caia!

---

## 6. Mídia VoIP, Audio Codec e Resiliência

### 6.1 Codec MLow (Meta Low-bitrate)

- A transmissão de áudio VoIP nativa do WhatsApp exige o codec **MLow**.
- A compilação é realizada via CGO com a flag `-tags mlow` e a biblioteca `libopus_mlow.so` (Linux) ou `opus_mlow.dll` (Windows) presente em `native/`.
- Caso o binário seja compilado sem CGO/MLow, o sistema roda em modo **somente sinalização** (permitindo o pareamento e recebimento do sinal, mas sem áudio).

### 6.2 Marcador de Linha do Tempo Customizado (`.audio-slider`)

- Para garantir que a linha do tempo das gravações de áudio no Dashboard e no Histórico não obstrua as informações do cabeçalho ou o número do contato, o player utiliza a classe CSS `.audio-slider`.
- O elemento `input[type="range"]` utiliza estilização customizada via `::-webkit-slider-thumb` e `::-moz-range-thumb`, definindo o marcador de controle com diâmetro de 10px perfeitamente alinhado ao centro da faixa de 4px.

---

## 7. Segurança e Hardening

- **Autenticação por JWT**: Senhas salvas via `bcrypt`. Tokens assinados com HMAC-SHA256 (`KALLIA_JWT_SECRET`).
- **Chaves de Conexão Individuais (`kc_*`)**: Cada conexão de WhatsApp gera uma API key única (`kc_...`) para consumo externo via header `X-Connection-API-Key`.
- **Tickets de Uso Único para SSE/WebSockets**: O SSE (`/api/events`) e os proxies usam tickets gerados via `POST /api/events/ticket` com validade de 30s.
- **Proteção Anti-SSRF (`safehttp.go`)**: URLs externas de mídia e webhooks são validadas contra endereços IP privados/reservados.
- **Isolamento Multi-tenant**: Todas as rotas de gerenciamento filtram os recursos pelo `project_id` do usuário logado.

---

## 8. Manutenção e Atualizações

Sempre que uma nova alteração de arquitetura, tabela de banco de dados ou protocolo de mídia for efetuada, este arquivo **`ARQUITETURA.MD`** deve ser atualizado imediatamente.
