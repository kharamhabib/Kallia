// Prompts padrão das ferramentas predefinidas da IA. Fonte única usada pelo
// agente client-side (lib/ai/agent.ts) e pelo dialog de configuração (AIDialog) —
// antes eram duplicados e divergiam (inclusive com typos).
export const DEFAULT_TOOL_PROMPTS: Record<string, string> = {
  hangup:
    "* Ferramenta hangup (Desligar Chamada): Use esta ferramenta APENAS E EXCLUSIVAMENTE quando o cliente disser explicitamente que não precisa de mais nada, se despedir ou confirmar que o atendimento está encerrado. NUNCA chame esta ferramenta automaticamente após executar outras ferramentas (como enviar mensagem no WhatsApp, agendar ligação ou pesquisar na web). Sempre pergunte ao cliente se ele precisa de algo mais antes de despedir-se.",
  open_ticket:
    "* Ferramenta open_ticket (Abrir Chamado): Use esta ferramenta quando o cliente solicitar falar com um atendente humano, suporte ou precisar de ajuda especializada que a IA não consiga resolver. Informe ao cliente que o chamado foi aberto e PERGUNTE se ele precisa de ajuda com mais alguma coisa. Não desligue a chamada após usar esta ferramenta.",
  send_message:
    '* Ferramenta send_message (Enviar WhatsApp): Use esta ferramenta quando o cliente solicitar que você envie informações por escrito no WhatsApp (ex: chave Pix, links, endereços, confirmações). Diga ao cliente: "Estou te enviando esses dados agora mesmo no seu WhatsApp", execute a ferramenta e PERGUNTE educadamente se ele precisa de mais alguma coisa. JAMAIS se despeça ou chame a ferramenta hangup imediatamente após enviar a mensagem.',
  schedule_call:
    '* Ferramenta schedule_call (Reagendar/Agendar Ligação): Se o cliente disser que não pode falar no momento ou solicitar um lembrete, pergunte pela data e hora desejada e execute a ferramenta. Confirme o agendamento e PERGUNTE se há algo mais em que você possa ajudar antes de encerrar.',
};

export const FETCH_CHATWOOT_HISTORY_PROMPT =
  "* Ferramenta fetch_chatwoot_history (Buscar histórico do Chatwoot): Use esta ferramenta para carregar o histórico recente de conversas por texto do cliente caso ele faça perguntas sobre o que foi falado no chat de texto anteriormente, ou se você precisar recuperar o contexto de interações passadas. Chame esta ferramenta se o cliente perguntar se você se lembra dele, se tem acesso ao chat, ou se pedir para retomar a conversa anterior.";

export const TOOL_RULES_HEADER =
  "\n\n### REGRAS OBRIGATÓRIAS DE MANUTENÇÃO DA CHAMADA APÓS O USO DE FERRAMENTAS:\n1. REGRA ABSOLUTA: JAMAIS se despeça ou execute a ferramenta `hangup` automaticamente logo após executar qualquer ferramenta (como `send_message`, `web_search`, `x_search`, `schedule_call` ou `open_ticket`).\n2. FLUXO OBRIGATÓRIO APÓS FERRAMENTAS: Assim que qualquer ferramenta for executada, informe verbalmente a confirmação para o cliente e PERGUNTE SEMPRE: \"Há mais alguma coisa em que eu possa te ajudar?\".\n3. USO DA FERRAMENTA HANGUP: A ferramenta `hangup` deve ser chamada APENAS E EXCLUSIVAMENTE quando o cliente responder que NÃO precisa de mais nada e se despedir expressamente.\n\n";
