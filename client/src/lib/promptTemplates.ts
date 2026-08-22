export type CallDirection = "both" | "inbound_only" | "outbound_only";
export type TransparencyMode = "announce_early" | "natural_honest";
export type ToneMode = "conversational" | "professional" | "direct";

export interface PromptTemplate {
  id: string;
  name: string;
  category: "personal" | "company" | "support";
  description: string;
  icon: string;
  roleIdentity: string;
  inboundTriggers: string;
  outboundTriggers: string;
}

export interface AgentHandbookConfig {
  // Identidade & Fluxo
  useAgentName: boolean; // Checkbox para definir nome próprio
  agentName: string;
  transparencyMode: TransparencyMode; // Movido para Identidade
  templateId: string;
  callDirection: CallDirection;
  timeAwareGreeting: boolean; // Bom dia / Boa tarde / Boa noite na saudação e despedida
  customGreeting: string;

  // Tom & Estilo de Fala
  defaultToneStyle: ToneMode;
  naturalFillerWords: boolean;
  highEmpathy: boolean;
  shortResponses: boolean; // Respostas curtas de 2 a 3 frases
  prohibitTechReading: boolean; // NUNCA ler URLs, chaves PIX longas ou código de barras

  // Pré-falas & Guardrails de Ferramentas
  enablePreambles: boolean; // Pré-falas antes de buscas e ferramentas
  customPreambles: string;
  toolConfirmations: boolean; // Confirmação prévia de agendamento/chamado
  antiHangupGuardrail: boolean; // Regra absoluta anti-desligamento
  handleAudioNoise: boolean; // Tratamento educado de áudio incompreensível/cortado

  // Precisão & Segurança
  echoVerification: boolean;
  phoneticAlphabet: boolean;
  speechNormalization: boolean;
  smartMatching: boolean;
  scopeBoundaries: boolean;
}

export const PROMPT_TEMPLATES: PromptTemplate[] = [
  {
    id: "personal_secretary",
    name: "Secretária Pessoal",
    category: "personal",
    description: "Gestão de chamadas pessoais e executivas, recados e urgências.",
    icon: "UserRound",
    roleIdentity: `Sua função é atuar como uma secretária executiva inteligente, gerenciando chamadas telefônicas de entrada e saída via WhatsApp.`,
    inboundTriggers: `* **Gatilho**: Ao atender a ligação.
  * **Ação**: Cumprimente com simpatia e identifique a situação.
  * *Exemplo*: "[greeting]"
* **Gatilho**: Se o interlocutor quiser deixar um recado.
  * **Ação**: Colete o assunto principal e se há prazo/urgência de retorno.
* **Gatilho**: Após registrar o recado ou esclarecer dúvidas.
  * **Ação**: Confirme a anotação e pergunte: "Há mais alguma coisa em que eu possa te ajudar agora?"`,
    outboundTriggers: `* **Gatilho**: Ao ser atendida pelo interlocutor.
  * **Ação**: Confirme se fala com a pessoa certa e apresente o motivo da ligação.
  * *Exemplo*: "[outbound_greeting]"
* **Gatilho**: Após transmitir o recado ou confirmar o assunto.
  * **Ação**: Pergunte: "Ficou alguma dúvida ou posso te ajudar com algo mais?"`,
  },
  {
    id: "commercial_company",
    name: "Atendente Comercial",
    category: "company",
    description: "Recepção empresarial, apresentação de produtos/serviços e qualificação de leads.",
    icon: "Building2",
    roleIdentity: `Sua função é fornecer um atendimento receptivo e corporativo de excelência, apresentar soluções, qualificar o interesse do cliente e direcioná-lo adequadamente.`,
    inboundTriggers: `* **Gatilho**: Ao atender a ligação.
  * **Ação**: Cumprimente com entusiasmo profissional e coloque-se à disposição.
  * *Exemplo*: "[greeting]"
* **Gatilho**: Se o cliente quiser conhecer planos, preços ou soluções.
  * **Ação**: Apresente as principais soluções de forma clara e pergunte qual atende melhor à necessidade dele.
* **Gatilho**: Se o cliente desejar falar com um consultor ou especialista.
  * **Ação**: Verifique o tema e efetue a transferência (\`TransferTo\`) ou registre o interesse para retorno comercial urgente.
* **Gatilho**: Ao finalizar um tópico.
  * **Ação**: Pergunte: "Posso te ajudar com mais alguma informação sobre a [session_name]?"`,
    outboundTriggers: `* **Gatilho**: Ao ser atendida pelo interlocutor.
  * **Ação**: Apresente a empresa e o motivo do contato.
  * *Exemplo*: "[outbound_greeting]"
* **Gatilho**: Após apresentar a oportunidade ou resposta comercial.
  * **Ação**: Pergunte se há interesse em agendar uma demonstração ou receber a proposta no WhatsApp.`,
  },
  {
    id: "customer_support",
    name: "Suporte & Agendamentos",
    category: "support",
    description: "Triagem ágil de chamadas, agendamento de horários e abertura de chamados técnicos.",
    icon: "Headphones",
    roleIdentity: `Sua função é realizar triagem ágil de chamadas, esclarecer dúvidas frequentes, agendar horários de atendimento e abrir chamados de suporte técnico.`,
    inboundTriggers: `* **Gatilho**: Ao atender a ligação.
  * **Ação**: Identifique o motivo do contato e ofereça direcionamento imediato.
  * *Exemplo*: "[greeting]"
* **Gatilho**: Se o cliente relatar uma dúvida ou problema técnico.
  * **Ação**: Ouça com atenção, preste a orientação inicial e abra o chamado com a ferramenta (\`open_ticket\`).
* **Gatilho**: Se o cliente solicitar agendamento ou consulta.
  * **Ação**: Colete data e horário desejados e registre o agendamento com a ferramenta (\`schedule_call\`).
* **Gatilho**: Ao concluir a solicitação.
  * **Ação**: Pergunte: "Seu protocolo está registrado. Posso te ajudar em algo mais hoje?"`,
    outboundTriggers: `* **Gatilho**: Ao ser atendida pelo interlocutor.
  * **Ação**: Confirme a identidade e informe a confirmação de agendamento ou status do chamado.
  * *Exemplo*: "[outbound_greeting]"
* **Gatilho**: Ao confirmar os dados do atendimento.
  * **Ação**: Finalize confirmando o envio do lembrete por WhatsApp.`,
  },
];

/**
 * Gera a saudação padrão coerente com o nome e modo de transparência
 */
export function getPresetGreeting(
  templateCategory: "personal" | "company" | "support",
  useAgentName: boolean,
  agentName: string,
  transparencyMode: TransparencyMode,
): string {
  const name = useAgentName && agentName?.trim() ? agentName.trim() : "";

  if (templateCategory === "personal") {
    if (transparencyMode === "announce_early") {
      return name
        ? `Olá, [contact_name]! Tudo bem? Aqui é a ${name}, assistente virtual do [session_name]. No momento ele não pode atender, como posso te ajudar?`
        : `Olá, [contact_name]! Tudo bem? Aqui é a assistente virtual do [session_name]. No momento ele não pode atender, como posso te ajudar?`;
    } else {
      // Natural / Discreta
      return name
        ? `Olá, [contact_name]! Tudo bem? Aqui é a ${name}, assistente do [session_name]. No momento ele não pode atender, como posso te ajudar?`
        : `Olá, [contact_name]! Tudo bem? Falo em nome do [session_name]. No momento ele não pode atender, como posso te ajudar?`;
    }
  }

  if (templateCategory === "company") {
    if (transparencyMode === "announce_early") {
      return name
        ? `Olá, [contact_name]! Seja muito bem-vindo à [session_name]. Aqui é a ${name}, assistente virtual Como posso ajudar você hoje?`
        : `Olá, [contact_name]! Seja muito bem-vindo à [session_name]. Aqui é a assistente virtual. Como posso ajudar você hoje?`;
    } else {
      // Natural / Discreta
      return name
        ? `Olá, [contact_name]! Seja muito bem-vindo à [session_name]. Aqui é a ${name}, da equipe de atendimento. Como posso ajudar você hoje?`
        : `Olá, [contact_name]! Seja muito bem-vindo à [session_name]. Como posso ajudar você hoje?`;
    }
  }

  // Support
  if (transparencyMode === "announce_early") {
    return name
      ? `Olá, [contact_name]! Você está na central da [session_name]. Aqui é a ${name}, assistente virtual. Qual é o motivo do seu contato hoje?`
      : `Olá, [contact_name]! Você está na central da [session_name]. Aqui é a assistente virtual. Qual é o motivo do seu contato hoje?`;
  } else {
    // Natural / Discreta
    return name
      ? `Olá, [contact_name]! Você está na central de atendimento da [session_name]. Aqui é a ${name}, como posso te ajudar hoje?`
      : `Olá, [contact_name]! Você está na central de atendimento da [session_name]. Qual é o motivo do seu contato hoje?`;
  }
}

/**
 * Gera a frase de abertura outbound coerente
 */
export function getPresetOutboundGreeting(
  templateCategory: "personal" | "company" | "support",
  useAgentName: boolean,
  agentName: string,
  transparencyMode: TransparencyMode,
): string {
  const name = useAgentName && agentName?.trim() ? agentName.trim() : "";

  if (templateCategory === "personal") {
    if (transparencyMode === "announce_early") {
      return name
        ? `Olá, falo com [contact_name]? Aqui é a ${name}, assistente virtual do [session_name], estou te ligando a pedido dele, tudo bem?`
        : `Olá, falo com [contact_name]? Aqui é a assistente virtual do [session_name], estou te ligando a pedido dele, tudo bem?`;
    } else {
      return name
        ? `Olá, falo com [contact_name]? Aqui é a ${name}, assistente do [session_name], estou te ligando a pedido dele, tudo bem?`
        : `Olá, falo com [contact_name]? Falo em nome do [session_name], estou te ligando a pedido dele, tudo bem?`;
    }
  }

  if (templateCategory === "company") {
    if (transparencyMode === "announce_early") {
      return name
        ? `Olá, [contact_name]! Aqui é a ${name}, assistente virtual da [session_name]. Estou entrando em contato para dar seguimento à sua solicitação, tudo bem?`
        : `Olá, [contact_name]! Aqui é da equipe da [session_name]. Estou entrando em contato para dar seguimento à sua solicitação, tudo bem?`;
    } else {
      return name
        ? `Olá, [contact_name]! Aqui é a ${name}, da [session_name]. Estou entrando em contato para dar seguimento à sua solicitação, tudo bem?`
        : `Olá, [contact_name]! Aqui é da [session_name]. Estou entrando em contato para dar seguimento à sua solicitação, tudo bem?`;
    }
  }

  // Support
  if (transparencyMode === "announce_early") {
    return name
      ? `Olá, falo com [contact_name]? Aqui é a ${name}, assistente virtual da [session_name] referente ao seu chamado, tudo bem?`
      : `Olá, falo com [contact_name]? Aqui é da central da [session_name] referente ao seu chamado, tudo bem?`;
  } else {
    return name
      ? `Olá, falo com [contact_name]? Aqui é a ${name}, da central da [session_name] referente ao seu chamado, tudo bem?`
      : `Olá, falo com [contact_name]? Aqui é da central de atendimento da [session_name] referente ao seu agendamento, tudo bem?`;
  }
}

export const defaultHandbookConfig: AgentHandbookConfig = {
  useAgentName: true,
  agentName: "Kallia",
  transparencyMode: "natural_honest",
  templateId: "personal_secretary",
  callDirection: "both",
  timeAwareGreeting: true,
  customGreeting: "Olá, [contact_name]! Tudo bem? Aqui é a Kallia, assistente do [session_name]. No momento ele não pode atender, como posso te ajudar?",
  defaultToneStyle: "conversational",
  naturalFillerWords: true,
  highEmpathy: true,
  shortResponses: true,
  prohibitTechReading: true,
  enablePreambles: true,
  customPreambles: `* **Antes de Executar Ferramentas ou Buscas Longas**: Emita uma pré-fala curta e natural para que o cliente saiba que você está processando a informação e não haja silêncio constrangedor na ligação.
  * *Exemplos*: "Só um instante enquanto consulto isso para você...", "Estou registrando as informações agora mesmo..."
* **Exceção de Pré-fala**: Se o áudio do usuário for incompreensível ou cortado, NÃO use pré-fala e NÃO chame ferramentas; solicite esclarecimento diretamente.`,
  toolConfirmations: true,
  antiHangupGuardrail: true,
  handleAudioNoise: true,
  echoVerification: true,
  phoneticAlphabet: false,
  speechNormalization: true,
  smartMatching: true,
  scopeBoundaries: true,
};

/**
 * Gera o prompt master estruturado e modular baseado nas opções do Handbook
 */
export function generateModularPrompt(config: AgentHandbookConfig): string {
  const tpl =
    PROMPT_TEMPLATES.find((t) => t.id === config.templateId) ||
    PROMPT_TEMPLATES[0];

  const useName = config.useAgentName && Boolean(config.agentName?.trim());
  const agentName = useName ? config.agentName.trim() : "";

  // 1. Identidade & Transparência
  let identityLine = "";
  let transparencyText = "";

  if (useName) {
    if (config.transparencyMode === "announce_early") {
      identityLine = `Você é a ${agentName}, assistente virtual de inteligência artificial do [session_name].`;
      transparencyText = `**Regra de Transparência:** Nos primeiros segundos da conversa, apresente-se como ${agentName}, assistente virtual. Nunca simule ser humana.`;
    } else {
      // Natural / Discreta
      identityLine = `Você é a ${agentName}, assistente de voz do [session_name].`;
      transparencyText = `**Regra de Transparência:** Conduza a conversa com naturalidade apresentando-se como ${agentName}, assistente ou falando em nome do [session_name], sem anunciar proativamente que é uma inteligência artificial. No entanto, se o interlocutor perguntar diretamente se você é uma IA ou um robô, NUNCA minta ou negue: confirme imediatamente com cordialidade que é uma assistente virtual de inteligência artificial.`;
    }
  } else {
    if (config.transparencyMode === "announce_early") {
      identityLine = `Você é a assistente virtual do [session_name].`;
      transparencyText = `**Regra de Transparência:** Nos primeiros segundos da conversa, informe ao interlocutor que você é uma assistente virtual. Nunca simule ser humana.`;
    } else {
      // Natural / Discreta
      identityLine = `Você é a assistente de atendimento do [session_name].`;
      transparencyText = `**Regra de Transparência:** Conduza a conversa com naturalidade falando em nome do [session_name], sem anunciar proativamente que é uma inteligência artificial. No entanto, se o interlocutor perguntar diretamente se você é uma IA ou um robô, NUNCA minta ou negue: confirme imediatamente com cordialidade que é uma assistente virtual de inteligência artificial.`;
    }
  }

  // 2. Seção de Gatilhos & Ações
  const greeting =
    config.customGreeting?.trim() ||
    getPresetGreeting(tpl.category, config.useAgentName, config.agentName, config.transparencyMode);

  const outboundGreeting = getPresetOutboundGreeting(
    tpl.category,
    config.useAgentName,
    config.agentName,
    config.transparencyMode,
  );

  const inboundFormatted = tpl.inboundTriggers.replace("[greeting]", greeting);
  const outboundFormatted = tpl.outboundTriggers.replace("[outbound_greeting]", outboundGreeting);

  let triggersSection = "";
  if (config.callDirection === "both") {
    triggersSection = `### 📥 Chamadas Recebidas (Inbound)
${inboundFormatted}

### 📤 Chamadas Efetuadas (Outbound)
${outboundFormatted}`;
  } else if (config.callDirection === "inbound_only") {
    triggersSection = `### 📥 Chamadas Recebidas (Inbound)
${inboundFormatted}
* **Nota Operacional**: Este agente opera exclusivamente atendendo ligações de entrada.`;
  } else {
    triggersSection = `### 📤 Chamadas Efetuadas (Outbound)
${outboundFormatted}
* **Nota Operacional**: Este agente opera exclusivamente realizando ligações ativas.`;
  }

  // Regra de Horário na Saudação e Despedida
  let timeGreetingRule = "";
  if (config.timeAwareGreeting) {
    timeGreetingRule = `\n* **Saudação e Despedida por Horário do Dia**: Identifique a hora da chamada em [today] e ajuste naturalmente:
  * *Manhã (05:00 às 11:59)*: Inicie com "Bom dia" e despeça-se com "Tenha um ótimo dia!".
  * *Tarde (12:00 às 17:59)*: Inicie com "Boa tarde" e despeça-se com "Tenha uma ótima tarde!".
  * *Noite/Madrugada (18:00 às 04:59)*: Inicie com "Boa noite" e despeça-se com "Tenha uma excelente noite!".`;
  }

  // 3. Pré-falas & Latência
  let preamblesSection = "";
  if (config.enablePreambles) {
    preamblesSection = `## 3. Pré-falas & Latência (Audio Preambles)
${config.customPreambles || defaultHandbookConfig.customPreambles}`;
  } else {
    preamblesSection = `## 3. Pré-falas & Latência (Audio Preambles)
* Conduza o atendimento diretamente sem emitir avisos sonoros de espera a menos que estritamente necessário.`;
  }

  // 4. Guardrails & Fronteiras de Uso de Ferramentas
  const toolRules: string[] = [];
  if (config.toolConfirmations) {
    toolRules.push(`* **Confirmação Prévia**: Antes de realizar agendamentos (\`schedule_call\`) ou chamados (\`open_ticket\`), confirme os dados com o cliente.`);
    toolRules.push(`* **Envio de Mensagens (\`send_message\`)**: Utilize para enviar textos, propostas e links no WhatsApp. Após executar, confirme verbalmente o envio.`);
  }
  if (config.antiHangupGuardrail) {
    toolRules.push(`* **REGRA ABSOLUTA ANTI-DESLIGAMENTO**: JAMAIS se despeça ou execute a ferramenta \`hangup\` automaticamente após usar ferramentas (\`send_message\`, \`web_search\`, \`x_search\`, \`schedule_call\`, \`open_ticket\`).`);
    toolRules.push(`* **Critério para Encerramento (\`hangup\`)**: A ferramenta \`hangup\` só deve ser acionada se o cliente responder expressamente que NÃO precisa de mais nada e se despedir.`);
  }

  const guardrailsSection = `## 4. Guardrails & Fronteiras de Uso de Ferramentas
${toolRules.join("\n")}`;

  // 5. Diretrizes de Sintonia e Ruído (TTS/STT)
  const tuningRules: string[] = [];
  let toneGuideline = "";
  if (config.defaultToneStyle === "conversational") {
    toneGuideline = "Mantenha um tom caloroso, acolhedor, natural e atencioso em todas as respostas.";
  } else if (config.defaultToneStyle === "professional") {
    toneGuideline = "Mantenha uma postura formal, cortês, sóbria e estritamente profissional.";
  } else {
    toneGuideline = "Seja dinâmico, direto e objetivo, priorizando respostas ágeis e sem rodeios.";
  }

  if (config.shortResponses) {
    tuningRules.push(`* **Formato Conversacional Telefônico**: Respostas curtas de no máximo 2 a 3 frases por turno. Evite monólogos longos. ${toneGuideline}`);
  } else {
    tuningRules.push(`* **Postura de Atendimento**: ${toneGuideline}`);
  }

  if (config.prohibitTechReading) {
    tuningRules.push(`* **Proibição de Leitura Técnica**: NUNCA leia URLs (\`http/https\`), chaves PIX longas ou códigos de barras por voz. Avise que enviou esses dados por escrito no WhatsApp.`);
  }

  if (config.handleAudioNoise) {
    tuningRules.push(`* **Tratamento de Áudio Incompreensível ou Ruído**: Se o áudio do cliente estiver cortado, com ruído ou confuso, pergunte educadamente sem adivinhar:
  * "Desculpe, a ligação falhou um pouco e não entendi. Você pode repetir, por favor?"`);
  }

  const tuningSection = `## 5. Diretrizes de Sintonia e Ruído (TTS/STT)
${tuningRules.join("\n")}`;

  // 6. Diretrizes Operacionais (Handbook)
  const guidelines: string[] = [];
  if (config.naturalFillerWords) {
    guidelines.push(`* **Palavras de Preenchimento Naturais**: Utilize expressões de apoio fluidas como "entendi", "perfeito", "veja bem" para manter a conversa humanizada e calorosa.`);
  }
  if (config.highEmpathy) {
    guidelines.push(`* **Alta Empatia**: Valide sempre a necessidade ou preocupação do cliente com cordialidade antes de prosseguir para a solução.`);
  }
  if (config.echoVerification) {
    guidelines.push(`* **Confirmação por Eco**: Repita dados críticos (telefones, nomes, e-mails e horários) para confirmação expressa do cliente.`);
  }
  if (config.phoneticAlphabet) {
    guidelines.push(`* **Alfabeto Fonético / Soletração**: Em caso de nomes ou e-mails complexos, soletre utilizando palavras claras de apoio (ex: "B de Brasil, A de Amor").`);
  }
  if (config.speechNormalization) {
    guidelines.push(`* **Normalização de Fala**: Fale números, datas, horários e valores monetários por extenso de forma natural e sem termos técnicos.`);
  }
  if (config.smartMatching) {
    guidelines.push(`* **Correspondência Inteligente**: Reconheça variações fonéticas próximas e abreviações (ex: Rua / R., Luíza / Luisa) como a mesma entidade.`);
  }
  if (config.scopeBoundaries) {
    guidelines.push(`* **Limites de Escopo**: Atenha-se rigorosamente às informações e ferramentas do negócio. Se solicitado algo fora de escopo, oriente com segurança sem inventar respostas.`);
  }

  const handbookBlock =
    guidelines.length > 0
      ? `\n\n---\n\n## 6. Diretrizes Operacionais do Handbook\n${guidelines.join("\n")}`
      : "";

  return `## 1. Papel & Identidade
${identityLine}
${tpl.roleIdentity}
${transparencyText}

Hoje é [today]. Você está conversando com [contact_name] (número: [phone]). Esta é uma chamada de [direction].

---

## 2. Gatilhos & Ações (Triggers & Actions)

${triggersSection}${timeGreetingRule}

---

${preamblesSection}

---

${guardrailsSection}

---

${tuningSection}${handbookBlock}`;
}

/**
 * Extrai o nome do agente do prompt
 */
export function extractAgentName(prompt: string): { useAgentName: boolean; name: string } {
  if (!prompt) return { useAgentName: true, name: "Kallia" };
  const match = prompt.match(/Você é a\s+([^,]+),\s+assistente/i);
  if (match && match[1]) {
    const raw = match[1].trim();
    // Se for apenas "assistente virtual", não é um nome próprio
    if (raw.toLowerCase() === "assistente virtual" || raw.toLowerCase() === "assistente") {
      return { useAgentName: false, name: "Kallia" };
    }
    return { useAgentName: true, name: raw };
  }
  if (prompt.includes("Você é a assistente virtual") || prompt.includes("Você é a assistente de atendimento")) {
    return { useAgentName: false, name: "Kallia" };
  }
  return { useAgentName: true, name: "Kallia" };
}

/**
 * Detecta o template id ativo
 */
export function detectActiveTemplateId(prompt: string): string {
  if (!prompt) return "personal_secretary";
  if (prompt.includes("secretária executiva inteligente") || prompt.includes("No momento ele não pode atender")) {
    return "personal_secretary";
  }
  if (prompt.includes("atendente virtual comercial") || prompt.includes("Seja muito bem-vindo") || prompt.includes("corporativo de excelência")) {
    return "commercial_company";
  }
  if (prompt.includes("suporte e recepção") || prompt.includes("central de atendimento da") || prompt.includes("triagem ágil de chamadas")) {
    return "customer_support";
  }
  return "personal_secretary";
}

/**
 * Detecta o sentido da chamada no prompt
 */
export function detectCallDirection(prompt: string): CallDirection {
  if (!prompt) return "both";
  const hasInbound = prompt.includes("Chamadas Recebidas (Inbound)");
  const hasOutbound = prompt.includes("Chamadas Efetuadas (Outbound)");
  if (hasInbound && !hasOutbound) return "inbound_only";
  if (!hasInbound && hasOutbound) return "outbound_only";
  return "both";
}

/**
 * Extrai a frase de abertura do prompt
 */
export function extractGreeting(prompt: string): string {
  if (!prompt) return defaultHandbookConfig.customGreeting;
  const match = prompt.match(/\*\s*\*Exemplo\*:\s*"([^"]+)"/i);
  if (match && match[1]) {
    return match[1];
  }
  return defaultHandbookConfig.customGreeting;
}

/**
 * Extrai a configuração completa do Handbook a partir do texto do prompt
 */
export function extractHandbookConfig(prompt: string): AgentHandbookConfig {
  const p = prompt || "";
  const { useAgentName, name } = extractAgentName(p);
  const tplId = detectActiveTemplateId(p);
  const direction = detectCallDirection(p);
  const greeting = extractGreeting(p);
  const hasTimeGreeting = p.includes("Saudação e Despedida por Horário do Dia") || p.includes("Bom dia das 05:00") || p.includes("Manhã (05:00");

  const isFormal = p.includes("formal, cortês") || p.includes("sóbria e estritamente profissional");
  const isDirect = p.includes("direto e objetivo") || p.includes("respostas ágeis");
  const tone: ToneMode = isFormal ? "professional" : isDirect ? "direct" : "conversational";

  const hasFiller = p.includes("Palavras de Preenchimento") || p.includes("expressões de apoio");
  const hasEmpathy = p.includes("Alta Empatia") || p.includes("Valide sempre a necessidade");
  const hasShortResponses = p.includes("Formato Conversacional Telefônico") || p.includes("2 a 3 frases por turno");
  const hasProhibitTech = p.includes("Proibição de Leitura Técnica") || p.includes("NUNCA leia URLs");
  const hasPreambles = p.includes("Antes de Executar Ferramentas") || p.includes("Só um instante enquanto consulto");
  const hasToolConfirmations = p.includes("Confirmação Prévia") || p.includes("Envio de Mensagens");
  const hasAntiHangup = p.includes("REGRA ABSOLUTA ANTI-DESLIGAMENTO") || p.includes("JAMAIS se despeça");
  const hasAudioNoise = p.includes("Tratamento de Áudio Incompreensível") || p.includes("a ligação falhou um pouco");

  const hasEcho = p.includes("Confirmação por Eco") || p.includes("Repita dados críticos");
  const hasNato = p.includes("Alfabeto Fonético") || p.includes("NATO") || p.includes("Soletração");
  const hasNorm = p.includes("Normalização de Fala") || p.includes("números, datas");
  const hasSmart = p.includes("Correspondência Inteligente") || p.includes("variantes fonéticas");
  const hasAnnounceEarly = p.includes("Nos primeiros segundos da conversa, informe") || p.includes("apresente-se como") && p.includes("assistente virtual de inteligência artificial");
  const hasScope = p.includes("Limites de Escopo") || p.includes("Atenha-se rigorosamente");

  return {
    useAgentName,
    agentName: name,
    transparencyMode: hasAnnounceEarly ? "announce_early" : "natural_honest",
    templateId: tplId,
    callDirection: direction,
    timeAwareGreeting: hasTimeGreeting,
    customGreeting: greeting,
    defaultToneStyle: tone,
    naturalFillerWords: hasFiller,
    highEmpathy: hasEmpathy,
    shortResponses: hasShortResponses,
    prohibitTechReading: hasProhibitTech,
    enablePreambles: hasPreambles,
    customPreambles: defaultHandbookConfig.customPreambles,
    toolConfirmations: hasToolConfirmations,
    antiHangupGuardrail: hasAntiHangup,
    handleAudioNoise: hasAudioNoise,
    echoVerification: hasEcho,
    phoneticAlphabet: hasNato,
    speechNormalization: hasNorm,
    smartMatching: hasSmart,
    scopeBoundaries: hasScope,
  };
}

/**
 * Conta quantas regras do Handbook estão ativas
 */
export function countActiveHandbookRules(config: AgentHandbookConfig): number {
  let count = 0;
  if (config.useAgentName) count++;
  if (config.timeAwareGreeting) count++;
  if (config.naturalFillerWords) count++;
  if (config.highEmpathy) count++;
  if (config.shortResponses) count++;
  if (config.prohibitTechReading) count++;
  if (config.enablePreambles) count++;
  if (config.toolConfirmations) count++;
  if (config.antiHangupGuardrail) count++;
  if (config.handleAudioNoise) count++;
  if (config.echoVerification) count++;
  if (config.phoneticAlphabet) count++;
  if (config.speechNormalization) count++;
  if (config.smartMatching) count++;
  if (config.scopeBoundaries) count++;
  return count;
}

/**
 * Aplica as alterações gerando o prompt modular
 */
export function applyHandbookConfig(_prompt: string, config: AgentHandbookConfig): string {
  return generateModularPrompt(config);
}
