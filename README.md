<div align="center">

# 📞 Kallia

**Plataforma PABX VoIP profissional SaaS para WhatsApp com CRM Integrado, Backend OpenSource PocketBase, Fila Redis e Agentes de IA Multi-Provedor em Go puro — pronta para deploy no Coolify.**

Mídia VoIP nativa, CRM de contatos por sessão, multi-tenant (projetos, planos e permissões RBAC: `appadmin`, `creator`, `normal`), login por E-mail e **Google OAuth2**, IA de voz **Gemini Live** + **xAI Grok Realtime** (26 vozes, Web Search, X Search, Reasoning Effort), transferência em tempo real entre agentes especialistas (`TransferTo`), gravação dual-channel, API de mensagens, webhooks com retries exponenciais e fila Redis, integração nativa com **Chatwoot**, chaves de API criptografadas (AES-256-GCM) e **deploy monolítico containerizado no Coolify via `docker-compose.yml`**.

[![Go](https://img.shields.io/badge/Go-1.26+-00ADD8?logo=go&logoColor=white)](https://go.dev)
[![React](https://img.shields.io/badge/React-19-61DAFB?logo=react&logoColor=black)](https://react.dev)
[![PocketBase](https://img.shields.io/badge/PocketBase-0.22+-B8272C?logo=pocketbase&logoColor=white)](https://pocketbase.io)
[![Redis](https://img.shields.io/badge/Redis-7-DC382D?logo=redis&logoColor=white)](https://redis.io)
[![whatsmeow](https://img.shields.io/badge/whatsmeow-VoIP-25D366?logo=whatsapp&logoColor=white)](https://github.com/tulir/whatsmeow)
[![pion](https://img.shields.io/badge/pion-WebRTC-FF6B6B)](https://github.com/pion/webrtc)
[![License](https://img.shields.io/badge/license-AGPL--3.0-blue.svg)](#-licença)

</div>

---

> **Kallia** é uma plataforma PABX VoIP desenvolvida a partir de evoluções dos projetos originários **AstraCalls** e [**WaCalls**](https://github.com/JotaDev66/WaCalls) (de [@jotadev66](https://github.com/jotadev66)). Mantém todo o núcleo VoIP nativo em Go e adiciona suporte multi-tenant (projetos, planos de cobrança e perfis de usuário), módulo de CRM de contatos por sessão, autenticação via **PocketBase com Google OAuth2**, agentes especialistas com transferência de chamadas em tempo real (`TransferTo`), atendimento autônomo por IA multi-provedor (**Gemini Live** + **xAI Grok Realtime**), chaves de API criptografadas com AES-256-GCM, gravação de chamadas no servidor, **armazenamento SQLite isolado por sessão**, **gerenciamento de filas e concorrência via Redis 7**, **API de mensagens**, **webhooks**, **integração nativa com Chatwoot** e **deploy monolítico no Coolify**.

---

## 📋 Visão Geral

O **Kallia** permite parear múltiplas contas do WhatsApp via **QR code** organizadas por projetos, gerenciar uma base de contatos em formato CRM e realizar/receber **chamadas de voz 1:1** diretamente do navegador ou via atendimento 100% autônomo por IA multi-provedor. O microfone do navegador é enviado por **WebRTC (Opus)** para o servidor Go, que transcodifica para o codec **MLow** da Meta e injeta a mídia na malha de **relay SRTP** do WhatsApp — e o caminho inverso traz o áudio do outro lado de volta ao navegador.

Toda a pilha VoIP roda **nativamente em Go**: o codec de voz MLow, a empacotagem **RTP/SRTP**, **STUN**, o transporte **WebRTC/SCTP relay** e a sinalização `<call>`, integrados ao [**whatsmeow**](https://github.com/tulir/whatsmeow) com persistência em SQLite puro e servidos a um cliente **React 19**.

---

## 🚀 Recursos e Funcionalidades do Kallia

### 👥 Módulo de CRM de Contatos Integrado
- **Base de Dados por Sessão (`contacts`)**: Armazenamento completo de clientes contendo Nome, Telefone, E-mail, Empresa, Notas, Tags, LID, JID e Foto de perfil.
- **Discagem Direta p/ o Webphone**: Ao clicar no ícone de telefone em qualquer contato da lista, o sistema navega reativamente para a tela do discador e preenche o número automaticamente.
- **Resolução Reativa de Identidade (`useContactDisplay`)**: Exibição automática do nome cadastrado no CRM e avatar do cliente nas telas de Dashboard, Histórico de Chamadas, Notificações e Webphone.

### 🏢 Multi-Tenancy & Autenticação PocketBase (Google OAuth2 + E-mail)
- **Autenticação Dupla**: Login e Registro por E-mail/Senha e **Google OAuth2** integrado com popup nativo.
- **Controle de Acesso por Roles (RBAC)**:
  - `appadmin`: Superadministrador com visão global de todos os projetos, usuários e conexões.
  - `creator`: Proprietário/Criador do projeto/tenant. Gerencia conexões, membros, agentes de IA e planos.
  - `normal`: Operador com perfil de atendimento (sem permissão para excluir conexões ou alterar configurações críticas).
- **Onboarding Automático**: Usuários criados via Google OAuth2 recebem automaticamente o papel `creator` e um novo projeto com plano `trial`.

### ⚡ Gerenciamento de Filas & Concorrência (Redis 7)
- **Outbound Call Queue**: Fila de discagem por projeto/sessão com controle estrito de capacidade simultânea e rate limiter anti-spam para proteger números WhatsApp de bloqueios.
- **Webhook Delivery Worker**: Fila assíncrona para entrega de webhooks com retries exponenciais e Dead-Letter Queue (DLQ).

### 🤖 Agentes Especialistas, IA Multi-Provedor & Transferência (`TransferTo`)
- **Provedores Suportados**:
  - **Google Gemini Live**: Vozes nativas (Puck, Charon, Kore, Fenrir, Aoede), campo `languageCode` nativo.
  - **xAI Grok Realtime**: 26 vozes (Eve ⭐, Sal ⭐), Reasoning Effort (`high`/`none`), ferramentas nativas (`web_search`, `x_search`), transcrição `grok-transcribe`.
- **Transferência ao Vivo (`TransferTo`)**: A IA pode transferir a ligação em andamento para outro agente especialista de forma transparente, mantendo a chamada VoIP do WhatsApp ativa.

### 🗄️ Persistência Leve em SQLite & PocketBase
- **Whatsmeow SQLite Isolado**: Cada sessão WhatsApp mantém suas credenciais e chaves criptográficas em `./storage/whatsapp/{id}.db`.
- **Coleções no PocketBase**: `users`, `projects`, `sessions`, `agents`, `contacts`, `call_history`, `call_transcripts`, `ai_providers`, `call_ratings`, `sent_polls`.

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
    │  Users, Collections  │      │  WebRTC, Pion, whatsmeow   │
    │  & Google OAuth2     │      └──────────────┬─────────────┘
    └───────────┬──────────┘                     │
                │ SQLite                         ▼
                │                    ┌────────────────────────────┐
                ▼                    │   Redis 7 (:6379)          │
     ┌──────────────────────┐        │   Filas de Discagem &      │
     │  Volume ./storage    │        │   Rate Limiter Anti-Spam   │
     │  (pb_data + *.db)    │        └────────────────────────────┘
     └──────────────────────┘
```

---

## 🚀 Deploy Monolítico no Coolify

O projeto está configurado para deploy imediato no **Coolify** via `docker-compose.yml`.

### 1. Pré-requisitos
- VPS com Docker e Coolify instalado (ex: Hostinger KVM 16GB RAM).
- Dois subdomínios apontando para o servidor:
  - `app.seudominio.com` (Frontend React + Servidor VoIP)
  - `pb.seudominio.com` (PocketBase REST API e Admin UI)

### 2. Passo a Passo no Coolify
1. Crie uma nova aplicação do tipo **Docker Compose** no Coolify.
2. Aponte para o repositório Git do Kallia.
3. Configure as variáveis de ambiente baseadas no `.env.example`.
4. Mapeie a porta UDP `50000` para o tráfego de voz WebRTC.
5. Inicie o deploy. O PocketBase executará as migrações automáticas em `pb_migrations/` e o servidor estará pronto para uso.

---

## 📋 Variáveis de Ambiente

| Variável | Padrão | Descrição |
| :--- | :--- | :--- |
| `POCKETBASE_URL` | `http://pocketbase:8090` | URL interna de comunicação com o PocketBase |
| `REDIS_URL` | `redis://redis:6379` | URL de conexão com a fila Redis |
| `KALLIA_MAX_CALLS` | `8` | Limite de chamadas simultâneas padrão por sessão |
| `KALLIA_STORAGE_DIR` | `./storage` | Diretório de persistência SQLite e gravações |
| `KALLIA_UDP_PORT` | `50000` | Porta UDP para fluxo de áudio WebRTC / RTP |
| `KALLIA_PUBLIC_IP` | `auto` | IP público para anúncio ICE no WebRTC |
| `KALLIA_JWT_SECRET` | — | Chave secreta HMAC para assinatura de tokens JWT |
| `KALLIA_ENCRYPTION_KEY`| — | Chave mestre AES-256 para criptografia de chaves de IA |
