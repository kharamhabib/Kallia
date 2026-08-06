import { useState, useEffect } from "react";
import {
  BookOpen,
  FileText,
  Plus,
  Search,
  Sparkles,
  Trash2,
  Upload,
  Globe,
  Database,
  Sliders,
  CheckCircle2,
  Layers,
  Bot,
  Eye,
  RefreshCw,
  HelpCircle,
  Filter,
  Check,
  FileCheck2,
  HardDrive,
  Cpu,
  Code2,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Switch } from "@/components/ui/Switch";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

interface KnowledgeItem {
  id: string;
  title: string;
  type: "file" | "text" | "url" | "faq";
  category: "Empresa" | "Produtos" | "Suporte" | "Políticas" | "Vendas";
  sourceName: string;
  chunksCount: number;
  tokensCount: number;
  status: "ready" | "processing" | "indexing";
  enabled: boolean;
  updatedAt: string;
  contentSnippet: string;
  assignedAgents: string[];
}

const initialKnowledgeData: KnowledgeItem[] = [
  {
    id: "kb-1",
    title: "Manual Geral da Empresa & Cultura Kallia",
    type: "file",
    category: "Empresa",
    sourceName: "manual_empresa_2026.pdf",
    chunksCount: 142,
    tokensCount: 42800,
    status: "ready",
    enabled: true,
    updatedAt: "05/08/2026",
    contentSnippet: "Missão, visão e valores da Kallia AI Solutions. Diretrizes de atendimento telefônico e tom de voz corporativo.",
    assignedAgents: ["Agente Vendas Principais", "Suporte Nível 1"],
  },
  {
    id: "kb-2",
    title: "Catálogo Completo de Produtos & Preços",
    type: "file",
    category: "Produtos",
    sourceName: "catalogo_produtos_v3.pdf",
    chunksCount: 310,
    tokensCount: 94200,
    status: "ready",
    enabled: true,
    updatedAt: "04/08/2026",
    contentSnippet: "Tabela de preços dos planos Kallia Call, pacotes de minutos de voz, integrações com WhatsApp e taxas de transcrição.",
    assignedAgents: ["Agente Vendas Principais"],
  },
  {
    id: "kb-3",
    title: "Política de Reembolso, Garantia & Cancelamentos",
    type: "faq",
    category: "Políticas",
    sourceName: "politica_cancelamento_faq.txt",
    chunksCount: 48,
    tokensCount: 12400,
    status: "ready",
    enabled: true,
    updatedAt: "02/08/2026",
    contentSnippet: "O cancelamento pode ser feito a qualquer momento pelo painel com aviso de 7 dias úteis. Reembolso integral nos primeiros 14 dias.",
    assignedAgents: ["Agente Vendas Principais", "Suporte Nível 1", "SDR Qualificador"],
  },
  {
    id: "kb-4",
    title: "Documentação de API & Webhooks de Integração",
    type: "url",
    category: "Suporte",
    sourceName: "https://docs.kallia.app/api/webhooks",
    chunksCount: 89,
    tokensCount: 28900,
    status: "ready",
    enabled: true,
    updatedAt: "01/08/2026",
    contentSnippet: "Guia técnico de autenticação por Bearer Token, payloads de chamada finalizada e parâmetros de callback via WebSocket.",
    assignedAgents: ["Suporte Nível 1"],
  },
  {
    id: "kb-5",
    title: "Perguntas Frequentes do Atendimento ao Cliente",
    type: "text",
    category: "Suporte",
    sourceName: "faq_atendimento_suporte.md",
    chunksCount: 65,
    tokensCount: 18300,
    status: "ready",
    enabled: true,
    updatedAt: "30/07/2026",
    contentSnippet: "Respostas para dúvidas recorrentes de conexão de QR Code WhatsApp, portas do Webphone e limitações de chamadas simultâneas.",
    assignedAgents: ["Suporte Nível 1"],
  },
];

type PageTab = "items" | "add" | "agents" | "playground";

export const KnowledgeBasePage = ({ sid: _sid }: { sid: string }) => {
  const [items, setItems] = useState<KnowledgeItem[]>(() => {
    const saved = localStorage.getItem("kallia_knowledge_base");
    if (saved) {
      try { return JSON.parse(saved); } catch (e) { console.error(e); }
    }
    return initialKnowledgeData;
  });

  const [activeTab, setActiveTab] = useState<PageTab>("items");
  const [searchTerm, setSearchTerm] = useState("");
  const [categoryFilter, setCategoryFilter] = useState<string>("all");
  const [selectedItemForView, setSelectedItemForView] = useState<KnowledgeItem | null>(null);

  // Form states for ingestion
  const [addType, setAddType] = useState<"file" | "text" | "url">("text");
  const [newTitle, setNewTitle] = useState("");
  const [newCategory, setNewCategory] = useState<KnowledgeItem["category"]>("Empresa");
  const [newTextContent, setNewTextContent] = useState("");
  const [newUrl, setNewUrl] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  // RAG Playground states
  const [playgroundQuery, setPlaygroundQuery] = useState("");
  const [playgroundResults, setPlaygroundResults] = useState<any[] | null>(null);
  const [isSearchingRAG, setIsSearchingRAG] = useState(false);

  // Vector Engine Settings
  const [topK, setTopK] = useState(4);
  const [similarityThreshold, setSimilarityThreshold] = useState(72);
  const [ragMode, setRagMode] = useState<"hybrid" | "semantic" | "keyword">("hybrid");

  useEffect(() => {
    localStorage.setItem("kallia_knowledge_base", JSON.stringify(items));
  }, [items]);

  const handleToggleItem = (id: string) => {
    setItems((prev) =>
      prev.map((item) => {
        if (item.id === id) {
          const updated = !item.enabled;
          toast.success(`Base "${item.title}" ${updated ? "ativada" : "desativada"}`);
          return { ...item, enabled: updated };
        }
        return item;
      })
    );
  };

  const handleDeleteItem = (id: string, title: string) => {
    setItems((prev) => prev.filter((item) => item.id !== id));
    toast.success(`Base de conhecimento "${title}" removida.`);
  };

  const handleCreateKnowledge = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTitle.trim()) {
      toast.error("Informe o título do documento.");
      return;
    }
    if (addType === "text" && !newTextContent.trim()) {
      toast.error("Insira o conteúdo do texto ou FAQ.");
      return;
    }
    if (addType === "url" && !newUrl.trim()) {
      toast.error("Insira a URL para raspagem.");
      return;
    }

    setIsSubmitting(true);
    setTimeout(() => {
      const estimatedChunks = Math.max(3, Math.floor(Math.random() * 40) + 10);
      const estimatedTokens = estimatedChunks * 320;

      const newItem: KnowledgeItem = {
        id: `kb-${Date.now()}`,
        title: newTitle.trim(),
        type: addType,
        category: newCategory,
        sourceName: addType === "url" ? newUrl.trim() : addType === "file" ? "documento_upload.pdf" : "nota_manual.txt",
        chunksCount: estimatedChunks,
        tokensCount: estimatedTokens,
        status: "ready",
        enabled: true,
        updatedAt: new Date().toLocaleDateString("pt-BR"),
        contentSnippet: newTextContent ? newTextContent.slice(0, 140) + "..." : `Conteúdo importado da fonte ${newUrl || "Arquivo"}.`,
        assignedAgents: ["Agente Vendas Principais"],
      };

      setItems((prev) => [newItem, ...prev]);
      setIsSubmitting(false);
      setNewTitle("");
      setNewTextContent("");
      setNewUrl("");
      setActiveTab("items");
      toast.success("Nova base de conhecimento vetorizada e indexada com sucesso!");
    }, 800);
  };

  const handleRunPlaygroundSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (!playgroundQuery.trim()) return;

    setIsSearchingRAG(true);
    setTimeout(() => {
      const activeItems = items.filter((i) => i.enabled);
      const matched = activeItems
        .map((item) => {
          const textToMatch = (item.title + " " + item.contentSnippet).toLowerCase();
          const q = playgroundQuery.toLowerCase();
          let score = 0;
          if (textToMatch.includes(q)) score = 0.94;
          else if (q.split(" ").some((w) => textToMatch.includes(w) && w.length > 3)) score = 0.78;
          else score = 0.55 + Math.random() * 0.2;

          return {
            item,
            score: Math.round(score * 100),
            chunkSnippet: `"...${item.contentSnippet} Ref: ${item.sourceName} [Trecho relevante indexado]..."`,
          };
        })
        .filter((r) => r.score >= similarityThreshold)
        .sort((a, b) => b.score - a.score)
        .slice(0, topK);

      setPlaygroundResults(matched);
      setIsSearchingRAG(false);
    }, 500);
  };

  const filteredItems = items.filter((item) => {
    const matchesSearch =
      item.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
      item.sourceName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      item.contentSnippet.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesCategory = categoryFilter === "all" || item.category === categoryFilter;
    return matchesSearch && matchesCategory;
  });

  const totalChunks = items.reduce((acc, i) => acc + i.chunksCount, 0);
  const totalTokens = items.reduce((acc, i) => acc + i.tokensCount, 0);
  const activeCount = items.filter((i) => i.enabled).length;

  return (
    <div className="space-y-6 max-w-6xl mx-auto animate-fade-in pb-12">
      {/* Header Banner */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 border-b pb-5">
        <div>
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-primary/10 text-primary">
              <BookOpen className="h-6 w-6" />
            </div>
            <div>
              <h1 className="text-xl font-bold tracking-tight text-foreground">
                Base de Conhecimento (RAG)
              </h1>
              <p className="text-xs text-muted-foreground">
                Gerencie documentos, FAQs e repositórios de dados vetorizados para alimentar a inteligência dos seus Agentes IA.
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Button
            size="sm"
            onClick={() => setActiveTab("add")}
            className="gap-2 shadow-xs cursor-pointer"
          >
            <Plus className="h-4 w-4" />
            Adicionar Conhecimento
          </Button>
        </div>
      </div>

      {/* Top Metrics Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card className="card-premium p-4">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-muted-foreground">Documentos Ativos</span>
            <FileCheck2 className="h-4 w-4 text-emerald-500" />
          </div>
          <div className="mt-2 flex items-baseline gap-1.5">
            <span className="text-2xl font-bold">{activeCount}</span>
            <span className="text-xs text-muted-foreground">/ {items.length} total</span>
          </div>
        </Card>

        <Card className="card-premium p-4">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-muted-foreground">Vetores (Chunks)</span>
            <Layers className="h-4 w-4 text-blue-500" />
          </div>
          <div className="mt-2 flex items-baseline gap-1.5">
            <span className="text-2xl font-bold">{totalChunks.toLocaleString("pt-BR")}</span>
            <span className="text-xs text-muted-foreground">trechos</span>
          </div>
        </Card>

        <Card className="card-premium p-4">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-muted-foreground">Volume de Tokens</span>
            <HardDrive className="h-4 w-4 text-purple-500" />
          </div>
          <div className="mt-2 flex items-baseline gap-1.5">
            <span className="text-2xl font-bold">{(totalTokens / 1000).toFixed(1)}k</span>
            <span className="text-xs text-muted-foreground">tokens RAG</span>
          </div>
        </Card>

        <Card className="card-premium p-4">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-muted-foreground">Motor RAG</span>
            <Cpu className="h-4 w-4 text-amber-500" />
          </div>
          <div className="mt-2 flex items-center gap-1.5">
            <span className="text-xs font-bold text-foreground">Postgres pgvector</span>
            <span className="text-[10px] bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 font-medium px-2 py-0.5 rounded-full">
              Embeddings v3
            </span>
          </div>
        </Card>
      </div>

      {/* Main Tabs Navigation */}
      <div className="flex flex-wrap gap-2 border-b pb-2">
        <button
          onClick={() => setActiveTab("items")}
          className={cn(
            "flex items-center gap-2 px-4 py-2 text-xs font-semibold rounded-lg transition-all cursor-pointer",
            activeTab === "items"
              ? "bg-primary text-primary-foreground shadow-2xs"
              : "text-muted-foreground hover:bg-muted/60 hover:text-foreground"
          )}
        >
          <Database className="h-3.5 w-3.5" />
          Bases Indexadas ({items.length})
        </button>

        <button
          onClick={() => setActiveTab("add")}
          className={cn(
            "flex items-center gap-2 px-4 py-2 text-xs font-semibold rounded-lg transition-all cursor-pointer",
            activeTab === "add"
              ? "bg-primary text-primary-foreground shadow-2xs"
              : "text-muted-foreground hover:bg-muted/60 hover:text-foreground"
          )}
        >
          <Plus className="h-3.5 w-3.5" />
          Adicionar Nova Fonte
        </button>

        <button
          onClick={() => setActiveTab("agents")}
          className={cn(
            "flex items-center gap-2 px-4 py-2 text-xs font-semibold rounded-lg transition-all cursor-pointer",
            activeTab === "agents"
              ? "bg-primary text-primary-foreground shadow-2xs"
              : "text-muted-foreground hover:bg-muted/60 hover:text-foreground"
          )}
        >
          <Bot className="h-3.5 w-3.5" />
          Vínculo com Agentes & Configs RAG
        </button>

        <button
          onClick={() => setActiveTab("playground")}
          className={cn(
            "flex items-center gap-2 px-4 py-2 text-xs font-semibold rounded-lg transition-all cursor-pointer",
            activeTab === "playground"
              ? "bg-primary text-primary-foreground shadow-2xs"
              : "text-muted-foreground hover:bg-muted/60 hover:text-foreground"
          )}
        >
          <Sparkles className="h-3.5 w-3.5" />
          Playground de Busca RAG
        </button>
      </div>

      {/* TAB 1: LIST / ITEMS */}
      {activeTab === "items" && (
        <div className="space-y-4">
          {/* Filters & Search */}
          <div className="flex flex-col sm:flex-row items-center justify-between gap-3">
            <div className="relative w-full sm:w-80">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Buscar por título, palavra ou arquivo..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-9 text-xs"
              />
            </div>

            <div className="flex items-center gap-2 w-full sm:w-auto">
              <Filter className="h-3.5 w-3.5 text-muted-foreground" />
              <div className="flex items-center gap-1 overflow-x-auto">
                {["all", "Empresa", "Produtos", "Suporte", "Políticas", "Vendas"].map((cat) => (
                  <button
                    key={cat}
                    onClick={() => setCategoryFilter(cat)}
                    className={cn(
                      "px-2.5 py-1 text-xs rounded-md transition-all whitespace-nowrap cursor-pointer",
                      categoryFilter === cat
                        ? "bg-primary/15 text-primary font-semibold border border-primary/20"
                        : "bg-muted/40 text-muted-foreground hover:text-foreground"
                    )}
                  >
                    {cat === "all" ? "Todas Categorias" : cat}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* List of Knowledge Cards */}
          {filteredItems.length === 0 ? (
            <Card className="p-12 text-center card-premium">
              <BookOpen className="h-10 w-10 text-muted-foreground/40 mx-auto mb-3" />
              <h3 className="text-sm font-semibold">Nenhuma base encontrada</h3>
              <p className="text-xs text-muted-foreground mt-1">
                Tente ajustar os filtros de busca ou adicione um novo documento RAG.
              </p>
              <Button size="sm" onClick={() => setActiveTab("add")} className="mt-4 gap-2">
                <Plus className="h-3.5 w-3.5" /> Adicionar Documento
              </Button>
            </Card>
          ) : (
            <div className="grid gap-3.5">
              {filteredItems.map((item) => (
                <Card
                  key={item.id}
                  className={cn(
                    "card-premium transition-all duration-200",
                    !item.enabled && "opacity-60 bg-muted/20"
                  )}
                >
                  <CardContent className="p-4">
                    <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                      {/* Left info */}
                      <div className="space-y-1.5 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-semibold text-sm text-foreground flex items-center gap-2">
                            {item.type === "file" && <FileText className="h-4 w-4 text-blue-500 shrink-0" />}
                            {item.type === "text" && <Code2 className="h-4 w-4 text-emerald-500 shrink-0" />}
                            {item.type === "url" && <Globe className="h-4 w-4 text-purple-500 shrink-0" />}
                            {item.type === "faq" && <HelpCircle className="h-4 w-4 text-amber-500 shrink-0" />}
                            {item.title}
                          </span>

                          <span className="text-[10px] font-medium bg-muted px-2 py-0.5 rounded-md text-muted-foreground">
                            {item.category}
                          </span>

                          <span className="text-[10px] font-medium bg-primary/10 text-primary px-2 py-0.5 rounded-full">
                            {item.chunksCount} chunks ({Math.round(item.tokensCount / 1000)}k tokens)
                          </span>
                        </div>

                        <p className="text-xs text-muted-foreground line-clamp-2">
                          {item.contentSnippet}
                        </p>

                        <div className="flex flex-wrap items-center gap-4 text-[11px] text-muted-foreground pt-1">
                          <span>Fonte: <strong className="text-foreground">{item.sourceName}</strong></span>
                          <span>Atualizado em: {item.updatedAt}</span>
                          <span>Agentes: {item.assignedAgents.join(", ")}</span>
                        </div>
                      </div>

                      {/* Right controls */}
                      <div className="flex items-center gap-3 shrink-0 self-end md:self-center">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setSelectedItemForView(item)}
                          className="h-8 gap-1.5 text-xs text-muted-foreground hover:text-foreground"
                        >
                          <Eye className="h-3.5 w-3.5" />
                          Ver Trechos
                        </Button>

                        <div className="flex items-center gap-2 border-l pl-3">
                          <span className="text-xs text-muted-foreground">
                            {item.enabled ? "Ativo" : "Inativo"}
                          </span>
                          <Switch
                            checked={item.enabled}
                            onChange={() => handleToggleItem(item.id)}
                          />
                        </div>

                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => handleDeleteItem(item.id, item.title)}
                          className="h-8 w-8 text-muted-foreground hover:text-destructive cursor-pointer"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </div>
      )}

      {/* TAB 2: INGESTION FORM */}
      {activeTab === "add" && (
        <Card className="card-premium">
          <CardHeader>
            <CardTitle className="text-base">Adicionar Nova Fonte ao Conhecimento RAG</CardTitle>
            <CardDescription className="text-xs">
              Escolha o formato da informação. Os dados serão automaticamente limpos, divididos em trechos (chunking) e vetorizados.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleCreateKnowledge} className="space-y-5">
              {/* Type Selection */}
              <div className="grid grid-cols-3 gap-3">
                <button
                  type="button"
                  onClick={() => setAddType("text")}
                  className={cn(
                    "flex flex-col items-center justify-center p-3.5 rounded-xl border text-xs font-semibold gap-2 transition-all cursor-pointer",
                    addType === "text"
                      ? "border-primary bg-primary/10 text-primary shadow-2xs"
                      : "border-border bg-card text-muted-foreground hover:bg-muted/40"
                  )}
                >
                  <FileText className="h-5 w-5" />
                  Texto / FAQ Manual
                </button>

                <button
                  type="button"
                  onClick={() => setAddType("file")}
                  className={cn(
                    "flex flex-col items-center justify-center p-3.5 rounded-xl border text-xs font-semibold gap-2 transition-all cursor-pointer",
                    addType === "file"
                      ? "border-primary bg-primary/10 text-primary shadow-2xs"
                      : "border-border bg-card text-muted-foreground hover:bg-muted/40"
                  )}
                >
                  <Upload className="h-5 w-5" />
                  Upload de Arquivo (PDF/DOC)
                </button>

                <button
                  type="button"
                  onClick={() => setAddType("url")}
                  className={cn(
                    "flex flex-col items-center justify-center p-3.5 rounded-xl border text-xs font-semibold gap-2 transition-all cursor-pointer",
                    addType === "url"
                      ? "border-primary bg-primary/10 text-primary shadow-2xs"
                      : "border-border bg-card text-muted-foreground hover:bg-muted/40"
                  )}
                >
                  <Globe className="h-5 w-5" />
                  URL Web / Documentação
                </button>
              </div>

              {/* Title & Category */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="md:col-span-2 space-y-1.5">
                  <Label className="text-xs">Título do Documento / Identificador</Label>
                  <Input
                    placeholder="Ex: Tabela de Preços e Condições de Pagamento 2026"
                    value={newTitle}
                    onChange={(e) => setNewTitle(e.target.value)}
                    className="text-xs"
                  />
                </div>

                <div className="space-y-1.5">
                  <Label className="text-xs">Categoria de Negócio</Label>
                  <select
                    value={newCategory}
                    onChange={(e) => setNewCategory(e.target.value as any)}
                    className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-xs shadow-xs focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                  >
                    <option value="Empresa">Empresa</option>
                    <option value="Produtos">Produtos</option>
                    <option value="Suporte">Suporte</option>
                    <option value="Políticas">Políticas</option>
                    <option value="Vendas">Vendas</option>
                  </select>
                </div>
              </div>

              {/* Specific Content Inputs */}
              {addType === "text" && (
                <div className="space-y-1.5">
                  <Label className="text-xs">Conteúdo Textual / Regras / FAQ</Label>
                  <Textarea
                    placeholder="Cole ou digite aqui as regras de negócio, perguntas e respostas frequentes ou especificações..."
                    rows={6}
                    value={newTextContent}
                    onChange={(e) => setNewTextContent(e.target.value)}
                    className="text-xs font-mono"
                  />
                </div>
              )}

              {addType === "file" && (
                <div className="border-2 border-dashed rounded-xl p-8 text-center bg-muted/20 hover:bg-muted/40 transition-colors cursor-pointer space-y-3">
                  <Upload className="h-8 w-8 text-muted-foreground mx-auto" />
                  <div>
                    <p className="text-xs font-semibold text-foreground">Arraste seu arquivo PDF, TXT, MD ou DOCX aqui</p>
                    <p className="text-[11px] text-muted-foreground mt-0.5">Suporta até 25MB por documento</p>
                  </div>
                  <Button type="button" variant="outline" size="sm" className="text-xs">
                    Selecionar Arquivo do Computador
                  </Button>
                </div>
              )}

              {addType === "url" && (
                <div className="space-y-1.5">
                  <Label className="text-xs">URL da Página Web para Raspagem RAG</Label>
                  <Input
                    placeholder="https://suaempresa.com.br/central-de-ajuda/politica-servicos"
                    value={newUrl}
                    onChange={(e) => setNewUrl(e.target.value)}
                    className="text-xs"
                  />
                </div>
              )}

              <div className="flex justify-end gap-2 pt-2 border-t">
                <Button type="button" variant="ghost" size="sm" onClick={() => setActiveTab("items")}>
                  Cancelar
                </Button>
                <Button type="submit" size="sm" disabled={isSubmitting} className="gap-2">
                  {isSubmitting ? (
                    <>
                      <RefreshCw className="h-4 w-4 animate-spin" /> Processando & Vetorizando...
                    </>
                  ) : (
                    <>
                      <Check className="h-4 w-4" /> Processar e Indexar RAG
                    </>
                  )}
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}

      {/* TAB 3: AGENTS & RAG SETTINGS */}
      {activeTab === "agents" && (
        <div className="space-y-5">
          <Card className="card-premium">
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <Sliders className="h-4 w-4 text-primary" /> Parâmetros do Motor Vetorial (RAG Engine)
              </CardTitle>
              <CardDescription className="text-xs">
                Ajuste os limiares de precisão e quantidade de trechos injetados no contexto dos Agentes IA durante a chamada.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
                <div className="space-y-2 border rounded-xl p-4 bg-card/60">
                  <div className="flex items-center justify-between">
                    <Label className="text-xs font-semibold">Top-K Trechos</Label>
                    <span className="text-xs font-bold text-primary">{topK} trechos</span>
                  </div>
                  <input
                    type="range"
                    min={1}
                    max={10}
                    value={topK}
                    onChange={(e) => setTopK(Number(e.target.value))}
                    className="w-full accent-primary"
                  />
                  <p className="text-[11px] text-muted-foreground">
                    Número máximo de trechos relevantes recuperados do banco vetorial para cada pergunta do cliente.
                  </p>
                </div>

                <div className="space-y-2 border rounded-xl p-4 bg-card/60">
                  <div className="flex items-center justify-between">
                    <Label className="text-xs font-semibold">Limiar de Similaridade</Label>
                    <span className="text-xs font-bold text-primary">{similarityThreshold}%</span>
                  </div>
                  <input
                    type="range"
                    min={50}
                    max={95}
                    value={similarityThreshold}
                    onChange={(e) => setSimilarityThreshold(Number(e.target.value))}
                    className="w-full accent-primary"
                  />
                  <p className="text-[11px] text-muted-foreground">
                    Pontuação mínima de correspondência de cosseno para aceitar o trecho RAG e não enviar lixo à IA.
                  </p>
                </div>

                <div className="space-y-2 border rounded-xl p-4 bg-card/60">
                  <Label className="text-xs font-semibold">Modo de Algoritmo de Busca</Label>
                  <select
                    value={ragMode}
                    onChange={(e) => setRagMode(e.target.value as any)}
                    className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-xs shadow-xs"
                  >
                    <option value="hybrid">Busca Híbrida (Embeddings + BM25 Reciprocal Rank)</option>
                    <option value="semantic">Busca Estritamente Semântica (Cosine Similarity)</option>
                    <option value="keyword">Busca por Palavras-Chave (Full-Text Search)</option>
                  </select>
                  <p className="text-[11px] text-muted-foreground">
                    Modo Híbrido combina entendimento de contexto com precisão de nomes e números específicos.
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="card-premium">
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <Bot className="h-4 w-4 text-emerald-500" /> Vinculação de Conhecimento por Agente IA
              </CardTitle>
              <CardDescription className="text-xs">
                Defina quais bases de conhecimento cada Agente de Voz/Chat tem permissão para consultar.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {[
                  { name: "Agente Vendas Principais", basesCount: 3, role: "SDR / Atendimento Comercial" },
                  { name: "Suporte Nível 1", basesCount: 4, role: "Suporte Técnico e Resolução" },
                  { name: "SDR Qualificador", basesCount: 2, role: "Qualificação de Leads" },
                ].map((agent, idx) => (
                  <div
                    key={idx}
                    className="flex items-center justify-between p-3.5 border rounded-xl bg-muted/20 hover:bg-muted/40 transition-colors"
                  >
                    <div className="flex items-center gap-3">
                      <div className="p-2 rounded-lg bg-primary/10 text-primary">
                        <Bot className="h-4 w-4" />
                      </div>
                      <div>
                        <h4 className="text-xs font-bold text-foreground">{agent.name}</h4>
                        <p className="text-[11px] text-muted-foreground">{agent.role}</p>
                      </div>
                    </div>

                    <div className="flex items-center gap-3">
                      <span className="text-xs text-muted-foreground font-medium">
                        {agent.basesCount} bases vinculadas
                      </span>
                      <Button size="sm" variant="outline" className="h-8 text-xs cursor-pointer">
                        Gerenciar Bases do Agente
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* TAB 4: RAG PLAYGROUND SEARCH TEST */}
      {activeTab === "playground" && (
        <div className="space-y-5">
          <Card className="card-premium">
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <Sparkles className="h-4 w-4 text-purple-500" /> Playground de Teste RAG em Tempo Real
              </CardTitle>
              <CardDescription className="text-xs">
                Simule perguntas de clientes para testar quais trechos do seu banco de conhecimento serão recuperados e enviados ao prompt da IA.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <form onSubmit={handleRunPlaygroundSearch} className="flex gap-2">
                <Input
                  placeholder="Ex: Qual o prazo para reembolso do plano?"
                  value={playgroundQuery}
                  onChange={(e) => setPlaygroundQuery(e.target.value)}
                  className="text-xs"
                />
                <Button type="submit" disabled={isSearchingRAG} className="gap-2 cursor-pointer shrink-0">
                  {isSearchingRAG ? (
                    <RefreshCw className="h-4 w-4 animate-spin" />
                  ) : (
                    <Search className="h-4 w-4" />
                  )}
                  Testar Busca RAG
                </Button>
              </form>

              {/* Search Results */}
              {playgroundResults !== null && (
                <div className="space-y-3 pt-3 border-t">
                  <div className="flex items-center justify-between text-xs text-muted-foreground">
                    <span>Resultados da busca semântica para: "{playgroundQuery}"</span>
                    <span>{playgroundResults.length} trechos recuperados</span>
                  </div>

                  {playgroundResults.length === 0 ? (
                    <div className="p-6 text-center border rounded-xl bg-muted/20">
                      <p className="text-xs text-muted-foreground">
                        Nenhum trecho atingiu o limiar de similaridade ({similarityThreshold}%). Tente diminuir a exigência no painel de configs ou adicione novas informações.
                      </p>
                    </div>
                  ) : (
                    <div className="space-y-2.5">
                      {playgroundResults.map((res, i) => (
                        <div
                          key={i}
                          className="p-3.5 rounded-xl border bg-card/80 space-y-2 shadow-2xs border-l-4 border-l-primary"
                        >
                          <div className="flex items-center justify-between">
                            <span className="text-xs font-bold text-foreground flex items-center gap-2">
                              <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />
                              {res.item.title}
                            </span>
                            <span className="text-[11px] font-semibold bg-primary/10 text-primary px-2 py-0.5 rounded-full">
                              Score de Match: {res.score}%
                            </span>
                          </div>

                          <p className="text-xs text-muted-foreground italic font-mono bg-muted/30 p-2 rounded-md">
                            {res.chunkSnippet}
                          </p>

                          <div className="flex items-center justify-between text-[10px] text-muted-foreground pt-1">
                            <span>Fonte: {res.item.sourceName}</span>
                            <span>Categoria: {res.item.category}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      )}

      {/* Modal View Chunks */}
      <Dialog open={!!selectedItemForView} onOpenChange={() => setSelectedItemForView(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="text-base flex items-center gap-2">
              <BookOpen className="h-4 w-4 text-primary" />
              Trechos Vetorizados (Chunks RAG)
            </DialogTitle>
            <DialogDescription className="text-xs">
              {selectedItemForView?.title} ({selectedItemForView?.chunksCount} chunks)
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3 max-h-[60vh] overflow-y-auto pr-1">
            {Array.from({ length: Math.min(4, selectedItemForView?.chunksCount || 1) }).map((_, idx) => (
              <div key={idx} className="p-3 rounded-lg border bg-muted/20 space-y-1">
                <div className="flex items-center justify-between text-[11px] text-muted-foreground font-semibold">
                  <span>Chunk #{idx + 1}</span>
                  <span>~320 tokens</span>
                </div>
                <p className="text-xs font-mono text-foreground leading-relaxed">
                  {selectedItemForView?.contentSnippet} Trecho #{idx + 1} de informações vetorizadas sobre a empresa, políticas e regras operacionais.
                </p>
              </div>
            ))}
          </div>

          <DialogFooter>
            <Button size="sm" variant="outline" onClick={() => setSelectedItemForView(null)}>
              Fechar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};
