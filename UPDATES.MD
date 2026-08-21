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
