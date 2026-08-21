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
- **Hidratação Inicial Automática**: Ao iniciar, o backend carrega automaticamente todos os Workspaces, Conexões, Agentes, Provedores de IA e Contatos do CRM a partir do PocketBase remoto.
- **Instâncias em Modo Standby no Dev**: Instâncias ativas na VPS aparecem no ambiente de desenvolvimento no estado configurável (permitindo edição de Agentes, Prompts, Tools e CRM) sem colidir ou disputar o socket físico do WhatsApp.
- **Visão Global SuperAdmin**: Usuários `appadmin` possuem visão total de todas as instâncias e exclusão em cascata sincronizada em ambos os bancos (SQLite + PocketBase).

### 👥 Módulo de CRM de Contatos Integrado por Workspace
- **Base de Dados Centralizada (`contacts`)**: Armazenamento completo de clientes por Workspace contendo Nome, Telefone, E-mail, Empresa, Notas, Tags, LID, JID e Foto de perfil.
- **Discagem Direta p/ o Webphone**: Ao clicar no ícone de telefone em qualquer contato da lista, o sistema navega reativamente para a tela do discador e preenche o número automaticamente.
- **Resolução Reativa de Identidade (`useContactDisplay`)**: Exibição automática do nome cadastrado no CRM e avatar do cliente nas telas de Dashboard, Histórico de Chamadas, Notificações e Webphone.

### 🏢 Multi-Tenancy Desacoplado & Autenticação PocketBase (Google OAuth2 + E-mail)
- **Autenticação Dupla**: Login e Registro por E-mail/Senha e **Google OAuth2** integrado com popup nativo.
- **Controle de Acesso por Roles (RBAC)**:
  - `appadmin`: Superadministrador com visão global de todos os workspaces, usuários e conexões em todos os bancos.
  - `creator` / `owner`: Proprietário do Workspace. Gerencia conexões, membros, agentes de IA e planos.
  - `normal` / `member`: Operador com perfil de atendimento.
- **Onboarding Automático**: Usuários cadastrados recebem automaticamente seu Workspace inicial provisionado no PocketBase.

### ⚡ Gerenciamento de Filas & Concorrência (Redis 7 + Fallback In-Memory)
- **Outbound Call Queue**: Fila de discagem por projeto/sessão com controle estrito de capacidade simultânea e rate limiter anti-spam para proteger números WhatsApp de bloqueios.
- **Webhook Delivery Worker**: Fila assíncrona para entrega de webhooks com retries exponenciais e Dead-Letter Queue (DLQ).
- **Fallback Automático In-Memory**: Caso o Redis não esteja disponível (como em desenvolvimento local), o sistema chaveia automaticamente para filas em memória RAM sem interromper nenhuma funcionalidade.

### 🤖 Agentes Especialistas, IA Multi-Provedor & Transferência (`TransferTo`)
- **Provedores Suportados**:
  - **Google Gemini Live**: Vozes nativas (Puck, Charon, Kore, Fenrir, Aoede), campo `languageCode` nativo.
  - **xAI Grok Realtime**: 26 vozes nativas (Eve ⭐, Sal ⭐), Reasoning Effort (`high`/`none`), ferramentas nativas (`web_search`, `x_search`), transcrição `grok-transcribe`.
- **Transferência ao Vivo (`TransferTo`)**: A IA pode transferir a ligação em andamento para outro agente especialista de forma transparente, mantendo a chamada VoIP do WhatsApp ativa.

---

## 🏗️ Arquitetura

```
┌──────────────────────────────────────────────────────────────────────────┐
│          BROWSER (cliente React 19 + CRM + Discador Webphone)            │
│   mic + alto-falante  ·  WebRTC (Opus)  ·  HTTP REST (JWT) + SSE         │
└───────────────┬───────────────────────────────┬──────────────────────────┘
                │ Auth & CRM                    │ WebRTC & VoIP
                ▼                               ▼
    ┌──────────────────────┐      ┌────────────────────────────┐
    │  PocketBase (:8090)  │      │     Kallia Server (:8080)   │
    │  (SSOT de Metadados) │◄────►│  WebRTC, Pion, whatsmeow   │
    │  SSE /api/realtime   │      └──────────────┬─────────────┘
    └───────────┬──────────┘                     │
                │ SQLite                         ▼
                │                    ┌────────────────────────────┐
                ▼                    │   Redis 7 (:6379)          │
     ┌──────────────────────┐        │   Filas de Discagem &      │
     │  Volume ./storage    │        │   Rate Limiter Anti-Spam   │
     │  (pb_data + *.db)    │        │   (Fallback In-Memory)     │
     └──────────────────────┘        └────────────────────────────┘
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
| `REDIS_URL` | `redis://redis:6379` | URL de conexão com a fila Redis |
| `KALLIA_MAX_CALLS` | `8` | Limite de chamadas simultâneas padrão por sessão |
| `KALLIA_STORAGE_DIR` | `./storage` | Diretório de persistência SQLite e gravações |
| `KALLIA_UDP_PORT` | `50000` | Porta UDP para fluxo de áudio WebRTC / RTP |
| `KALLIA_PUBLIC_IP` | `auto` | IP público para anúncio ICE no WebRTC |
| `KALLIA_JWT_SECRET` | — | Chave secreta HMAC para assinatura de tokens JWT |
| `KALLIA_ENCRYPTION_KEY`| — | Chave mestre AES-256 para criptografia de chaves de IA |
