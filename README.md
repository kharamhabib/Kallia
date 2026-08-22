<div align="center">

# 📞 Kallia 2.0

**Plataforma PABX VoIP profissional SaaS para WhatsApp com CRM Integrado, Backend PocketBase (SSOT), Workspaces Desacoplados, Sincronização em Tempo Real (SSE), Fila Redis e Agentes de IA Multi-Provedor em Go puro — pronta para deploy no Coolify.**

Mídia VoIP nativa, CRM de contatos por Workspace, multi-tenant desacoplado (Workspaces, planos, cotas e permissões RBAC: `appadmin`, `creator`, `normal`), login por E-mail e **Google OAuth2**, IA de voz **Gemini Live** + **xAI Grok Realtime** (26 vozes, Web Search, X Search, Reasoning Effort), transferência em tempo real entre agentes especialistas (`TransferTo`), gravação dual-channel, API de mensagens, webhooks com retries exponenciais e fila Redis, integração nativa com **Chatwoot**, chaves de API criptografadas (AES-256-GCM) e **deploy containerizado no Coolify via `docker-compose.yml`**.

[![Go](https://img.shields.io/badge/Go-1.26+-00ADD8?logo=go&logoColor=white)](https://go.dev)
[![React](https://img.shields.io/badge/React-19-61DAFB?logo=react&logoColor=black)](https://react.dev)
[![PocketBase](https://img.shields.io/badge/PocketBase-0.22+-B8272C?logo=pocketbase&logoColor=white)](https://pocketbase.io)
[![Redis](https://img.shields.io/badge/Redis-7-DC382D?logo=redis&logoColor=white)](https://redis.io)
[![whatsmeow](https://img.shields.io/badge/whatsmeow-VoIP-25D366?logo=whatsapp&logoColor=white)](https://github.com/tulir/whatsmeow)
[![pion](https://img.shields.io/badge/pion-WebRTC-FF6B6B)](https://github.com/pion/webrtc)
[![License](https://img.shields.io/badge/license-AGPL--3.0-blue.svg)](#-licença)

</div>

---

> **Kallia 2.0** é uma plataforma PABX VoIP desenvolvida a partir de evoluções dos projetos originários **AstraCalls** e [**WaCalls**](https://github.com/JotaDev66/WaCalls) (de [@jotadev66](https://github.com/jotadev66)). Mantém todo o núcleo VoIP nativo em Go e adiciona suporte multi-tenant em **Workspaces Desacoplados**, módulo de CRM de contatos unificado por Workspace, arquitetura de **PocketBase como Fonte Única de Verdade (SSOT)** com sincronização bidirecional em tempo real via **SSE (`/api/realtime`)**, agentes especialistas com transferência de chamadas em tempo real (`TransferTo`), atendimento autônomo por IA multi-provedor (**Gemini Live** + **xAI Grok Realtime**), chaves de API criptografadas com AES-256-GCM, gravação de chamadas no servidor, **gerenciamento de filas e concorrência via Redis 7 (com fallback in-memory)**, **API de mensagens**, **webhooks**, **integração nativa com Chatwoot** e **deploy monolítico no Coolify**.

---

## 📋 Visão Geral

O **Kallia** permite parear múltiplas contas do WhatsApp via **QR code** organizadas em **Workspaces desacoplados**, gerenciar uma base de contatos em formato CRM e realizar/receber **chamadas de voz 1:1** diretamente do navegador ou via atendimento 100% autônomo por IA multi-provedor. O microfone do navegador é enviado por **WebRTC (Opus)** para o servidor Go, que transcodifica para o codec **MLow** da Meta e injeta a mídia na malha de **relay SRTP** do WhatsApp — e o caminho inverso traz o áudio do outro lado de volta ao navegador.

Toda a pilha VoIP roda **nativamente em Go**: o codec de voz MLow, a empacotagem **RTP/SRTP**, **STUN**, o transporte **WebRTC/SCTP relay** e a sinalização `<call>`, integrados ao [**whatsmeow**](https://github.com/tulir/whatsmeow) com persistência em SQLite puro para chaves criptográficas e servidos a um cliente **React 19**.

---

## 🚀 Recursos e Funcionalidades do Kallia 2.0

### 🔄 PocketBase como Fonte Única de Verdade (SSOT) & Sincronização em Tempo Real
- **Sincronização Bidirecional Dev ↔ VPS**: O servidor Go assina os eventos SSE do PocketBase (`/api/realtime`). Alterações feitas em produção ou no ambiente local são refletidas instantaneamente em todos os nós.
- **Inicialização Instantânea**: O backend restaura diretamente as conexões do WhatsApp e opera como cliente direto do PocketBase (Direct SSOT), sem loops pesados de cópia ou sincronização redundante no boot.
- **Instâncias em Modo Standby no Dev**: Instâncias ativas na VPS aparecem no ambiente de desenvolvimento no estado configurável (permitindo edição de Agentes, Prompts, Tools e CRM) sem colidir ou disputar o socket físico do WhatsApp.
- **Visão Global SuperAdmin**: Usuários `appadmin` possuem visão total de todas as instâncias e exclusão em cascata sincronizada em ambos os bancos (SQLite + PocketBase).

### 👥 Módulo de CRM de Contatos Integrado por Workspace & Padrão de Identificadores (PN vs JID vs LID)
- **Base de Dados Centralizada (`contacts`)**: Armazenamento completo de clientes por Workspace contendo Nome, Telefone real (`phone`), E-mail, Empresa, Notas, Tags, LID (`lid`), JID (`jid`) e Foto de perfil em alta definição.
- **Tratamento Canônico de Identificadores WhatsApp**:
  - **Phone Number (`phone`)**: Exclusivamente números E.164 limpos (ex: `5527995307734`). Nunca armazena LIDs ou strings com `@...`.
  - **LID (`lid`)**: Identificador de privacidade/dispositivo do WhatsApp de 15 dígitos (ex: `261916165423237`). Resolvido automaticamente para o número real via `s.realPhone(jid)` sem inchaço de código.
  - **JID (`jid`)**: Identificador de rede para roteamento (ex: `5527995307734@s.whatsapp.net` ou `261916165423237@lid`).
- **Discagem Direta p/ o Webphone**: Ao clicar no ícone de telefone em qualquer contato da lista, o sistema navega reativamente para a tela do discador e preenche o número automaticamente.
- **Resolução Reativa de Identidade (`useContactDisplay`)**: Exibição automática do nome cadastrado no CRM e avatar do cliente nas telas de Dashboard, Histórico de Chamadas, Notificações e Webphone.

### 🏢 Multi-Tenancy Desacoplado & Métodos Canônicos de Autenticação
- **Autenticação Unificada (PocketBase SSOT)**: Login e Registro por E-mail/Senha e **Google OAuth2** integrado com popup nativo.
- **3 Métodos Especializados de Autenticação na API**:
  1. **JWT Bearer (`Authorization: Bearer <TOKEN>`)**: Exclusivo para o Frontend / Dashboard de operadores.
  2. **Chave de Conexão WhatsApp (`kc_...`)**: Aceita em `X-API-Key` ou `X-Connection-API-Key` para automações externas (N8N, Typebot, Chatwoot, Make, Webhooks) vinculada com segurança à linha e ao Workspace.
  3. **Ticket de Uso Único / Query Param (`?ticket=` / `?token=`)**: Para transmissões em tempo real do navegador (SSE `/api/events` e WebSocket `/gemini/ws`).
- **Controle de Acesso por Roles (RBAC)**:
  - `appadmin` / `superadmin`: Superadministrador com visão global de todos os workspaces, usuários e conexões em todos os bancos, destacado com **Badge de Coroa** no card de usuário da barra lateral.
  - `creator` / `owner`: Proprietário do Workspace. Gerencia conexões, membros, agentes de IA e planos.
  - `normal` / `member`: Operador com perfil de atendimento.
- **Central de Perfil do Usuário (`/profile`)**: Tela completa acessível pelo rodapé da Sidebar para gerenciamento de dados pessoais (nome, avatar), listagem e troca de Workspaces, alteração de senha (PocketBase Auth) e visão dos limites de consumo do plano.
- **Onboarding Automático**: Usuários cadastrados recebem automaticamente seu Workspace inicial provisionado no PocketBase (limite de 1 workspace para contas normais).

### ⚡ Gerenciamento de Filas & Concorrência (Redis 7 + Fallback In-Memory)
- **Outbound Call Queue**: Fila de discagem por projeto/sessão com controle estrito de capacidade simultânea e rate limiter anti-spam para proteger números WhatsApp de bloqueios.
- **Webhook Delivery Worker**: Fila assíncrona para entrega de webhooks com retries exponenciais e Dead-Letter Queue (DLQ).
- **Fallback Automático In-Memory**: Caso o Redis não esteja disponível (como em desenvolvimento local), o sistema chaveia automaticamente para filas em memória RAM sem interromper nenhuma funcionalidade.

### 💬 Central Omnichannel de Conversas & Chat WhatsApp Web
- **Interface Completa em 3 Colunas**: Lista de conversas com contadores de não lidas, timeline interativa de mensagens e painel lateral expansível de detalhes do contato.
- **Mensagens Ricas & Mídia Nativa**:
  - Envio e reprodução de notas de voz (áudios PTT gravados diretamente no microfone com medidor de tempo).
  - Envio e visualização em alta resolução de fotos (com modal Lightbox para zoom), vídeos e download de documentos/PDFs.
  - Alternador instantâneo entre mensagem pública de WhatsApp e **Nota Interna Privada** (visível apenas para os operadores).
- **Interações Avançadas Estilo WhatsApp**:
  - **Reações com Emojis**: Pílula flutuante de reações rápidas (`👍 ❤️ 😂 😮 😢 🙏`) com sincronização bidirecional no WhatsApp (`whatsmeow.BuildReaction`).
  - **Responder (Reply / Citação)**: Citação visual da mensagem respondida com injeção de `waE2E.ContextInfo`.
  - **Editar Mensagem**: Edição em tempo real de mensagens enviadas com sincronização nativa no WhatsApp (`whatsmeow.BuildEdit`) e marcação `(editada)`.
  - **Apagar para Todos (Revoke)**: Revogação nativa no WhatsApp (`whatsmeow.BuildRevoke`) e substituição por *"Esta mensagem foi apagada"*.
- **Separadores de Data & Auto-Scroll Inteligente**:
  - Divisores de data sticky (*"Hoje"*, *"Ontem"*, dias da semana para os últimos 7 dias ou data formatada `DD/MM/AAAA`).
  - Rolagem automática inteligente: pausa o scroll quando o operador sobe para ler mensagens antigas e fornece botão flutuante `↓` para retorno rápido.
- **Storage Híbrido & Retenção de Disco**:
  - Descriptografia automática de mídias do WhatsApp com rota `/api/media/{wid}/{file}` otimizada para tags `<img>`, `<audio>` e `<video>`.
  - Limpeza diária automática em background para mídias com mais de 30 dias (`KALLIA_MEDIA_RETENTION_DAYS`), preservando espaço em disco.

### 🤖 Agentes Especialistas, IA Multi-Provedor & Transferência (`TransferTo`)
- **Provedores Suportados**:
  - **Google Gemini Live**: Modelo padrão `models/gemini-3.1-flash-live-preview`, vozes nativas (Puck, Charon, Kore, Fenrir, Aoede), campo `languageCode` nativo.
  - **xAI Grok Realtime**: 26 vozes nativas (Eve ⭐, Sal ⭐), Reasoning Effort (`high`/`none`), ferramentas nativas (`web_search`, `x_search`), transcrição `grok-transcribe`.
- **Isolamento de Segurança de Chaves**: Chaves de API armazenadas exclusivamente na coleção criptografada `ai_providers` com AES-256-GCM, com sanitização automática em `agents` e `sessions`.
- **Transferência ao Vivo (`TransferTo`)**: A IA pode transferir a ligação em andamento para outro agente especialista de forma transparente, mantendo a chamada VoIP do WhatsApp ativa.

---

## 🏗️ Arquitetura

```
┌──────────────────────────────────────────────────────────────────────────┐
│          BROWSER (cliente React 19 + CRM + Chat Omnichannel + Webphone)  │
│   mic/áudio  ·  WebRTC (Opus)  ·  HTTP REST (JWT)  ·  WebSocket (/ws)    │
└───────────────┬───────────────────────────────┬──────────────────────────┘
                │ Auth & CRM                    │ WebRTC, VoIP & Omnichannel
                ▼                               ▼
    ┌──────────────────────┐      ┌────────────────────────────┐
    │  PocketBase (:8090)  │      │     Kallia Server (:8080)   │
    │  (SSOT de Metadados) │◄────►│  WebRTC, Pion, whatsmeow   │
    │  SSE /api/realtime   │      └──────────────┬─────────────┘
    └───────────┬──────────┘                     │
                │ SQLite                         ├────────────────────────────┐
                │                                ▼                            ▼
                ▼                    ┌────────────────────────┐  ┌────────────────────────┐
     ┌──────────────────────┐        │   Redis 7 (:6379)      │  │ PostgreSQL 16 (:5432)  │
     │  Volume ./storage    │        │   Filas de Discagem &  │  │ Inboxes, Mensagens,    │
     │  (pb_data + *.db +   │        │   PubSub WebSocket     │  │ Tags, Contatos &       │
     │   mídias do chat)    │        │   (Fallback In-Memory) │  │ pgvector 768d (RAG)    │
     └──────────────────────┘        └────────────────────────┘  └────────────────────────┘
```

---

## 💻 Executando em Desenvolvimento Local (Windows)

1. Clone o repositório e configure o arquivo `.env`:
   ```bash
   cp .env.example .env
   ```
2. Inicie os serviços locais com o script automatizado:
   ```powershell
   .\start-dev.ps1
   ```
   - O backend Go iniciará em `http://localhost:3001`
   - O frontend React iniciará em `http://localhost:5173`

---

## 🚀 Deploy Monolítico no Coolify / VPS

O projeto está configurado para deploy imediato no **Coolify** via `docker-compose.yml`.

### 1. Pré-requisitos
- VPS com Docker e Coolify instalado (ex: Hostinger KVM).
- Subdomínios apontando para o servidor:
  - `app.seudominio.com` (Frontend React + Servidor VoIP)
  - `pb.seudominio.com` (PocketBase REST API e Admin UI)

### 2. Passo a Passo no Coolify
1. Crie uma nova aplicação do tipo **Docker Compose** no Coolify.
2. Aponte para o repositório Git do Kallia.
3. Configure as variáveis de ambiente baseadas no `.env.example`.
4. Mapeie a porta UDP `50000` para o tráfego de voz WebRTC.
5. Inicie o deploy.

---

## 📋 Variáveis de Ambiente

| Variável | Padrão | Descrição |
| :--- | :--- | :--- |
| `POCKETBASE_URL` | `http://pocketbase:8090` | URL de comunicação com o PocketBase |
| `POCKETBASE_ADMIN_EMAIL` | — | E-mail de superuser/admin do PocketBase para sync |
| `POCKETBASE_ADMIN_PASSWORD` | — | Senha de superuser/admin do PocketBase |
| `REDIS_URL` | `redis://redis:6379` | URL de conexão com a fila Redis / PubSub |
| `KALLIA_PG_URL` | `postgres://kallia:...@postgres:5432/kallia` | URL de conexão com o PostgreSQL 16 (Omnichannel + pgvector) |
| `KALLIA_MAX_CALLS` | `8` | Limite de chamadas simultâneas padrão por sessão |
| `KALLIA_STORAGE_DIR` | `./storage` | Diretório de persistência SQLite, gravações e mídias |
| `KALLIA_MEDIA_RETENTION_DAYS` | `30` | Dias de retenção de mídias locais antes da limpeza automática |
| `KALLIA_UDP_PORT` | `50000` | Porta UDP para fluxo de áudio WebRTC / RTP |
| `KALLIA_PUBLIC_IP` | `auto` | IP público para anúncio ICE no WebRTC |
| `KALLIA_JWT_SECRET` | — | Chave secreta HMAC para assinatura de tokens JWT |
| `KALLIA_ENCRYPTION_KEY`| — | Chave mestre AES-256 para criptografia de chaves de IA |
