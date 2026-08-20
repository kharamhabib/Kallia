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

---

## 🚀 Próximas Implementações (Roadmap)

1. **Painel SaaS Admin Super-App (`appadmin`)**:
   - Interface web para visualizar todos os projetos cadastrados, métricas de consumo de minutos de chamada por projeto, gerenciar status de assinaturas e alterar planos em tempo real.

2. **Relatórios Avançados de Performance de Agentes**:
   - Métricas de NPS acumulado por agente especialista.
   - Análise de sentimentos e tempo médio de atendimento (TMA) das ligações operadas por IA.

3. **Integração de Provedores de Voz Adicionais**:
   - Opção de fallback para ElevenLabs / OpenAI Realtime API além do Google Gemini Live e xAI Grok.

4. **Gravação Dual-Channel na Nuvem (S3 / R2)**:
   - Exportação automática dos arquivos WAV de gravação de áudio para buckets S3 ou Cloudflare R2 para economizar espaço de disco no VPS.
