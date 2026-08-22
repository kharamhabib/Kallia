import React, { useState, useEffect, useCallback } from "react";
import {
  BookOpen,
  FileText,
  Plus,
  Search,
  Trash2,
  Upload,
  Globe,
  Layers,
  HelpCircle,
  FileCheck2,
  Cpu,
  Loader2,
  Play,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";
import { Switch } from "@/components/ui/Switch";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { useWorkspaceStore } from "@/stores/workspace";
import type { KnowledgeDocument, KnowledgeSearchMatch } from "@/types/chatAgent";
import {
  listKnowledgeDocs,
  createKnowledgeDoc,
  updateKnowledgeDoc,
  deleteKnowledgeDoc,
  toggleKnowledgeDoc,
  testKnowledgeSearch,
} from "@/services/knowledge";
import { ConfirmModal } from "@/components/shared/ConfirmModal";

const CATEGORIES = ["Todos", "Empresa", "Produtos", "Suporte", "Políticas", "Vendas"] as const;

export const KnowledgeBasePage = ({ sid: _sid }: { sid: string }) => {
  const currentWorkspace = useWorkspaceStore((s) => s.currentWorkspace);
  const wid = currentWorkspace?.id || "";

  const [docs, setDocs] = useState<KnowledgeDocument[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<string>("Todos");

  // Modal de Adicionar / Editar
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [editingDoc, setEditingDoc] = useState<KnowledgeDocument | null>(null);

  // Form State
  const [formType, setFormType] = useState<"text" | "faq" | "file" | "url">("text");
  const [formTitle, setFormTitle] = useState("");
  const [formCategory, setFormCategory] = useState("Empresa");
  const [formSourceName, setFormSourceName] = useState("");
  const [formContent, setFormContent] = useState("");
  const [faqQuestion, setFaqQuestion] = useState("");
  const [faqAnswer, setFaqAnswer] = useState("");
  const [formUrl, setFormUrl] = useState("");

  // Modal de Exclusão
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  // Modal de Teste / Playground RAG
  const [isTestModalOpen, setIsTestModalOpen] = useState(false);
  const [testQuery, setTestQuery] = useState("");
  const [testResults, setTestResults] = useState<KnowledgeSearchMatch[]>([]);
  const [isSearching, setIsSearching] = useState(false);

  const loadDocuments = useCallback(async () => {
    if (!wid) return;
    setLoading(true);
    try {
      const data = await listKnowledgeDocs(wid, search, selectedCategory === "Todos" ? undefined : selectedCategory);
      setDocs(data);
    } catch (err: any) {
      toast.error(err.message || "Falha ao carregar base de conhecimento");
    } finally {
      setLoading(false);
    }
  }, [wid, search, selectedCategory]);

  useEffect(() => {
    loadDocuments();
  }, [loadDocuments]);

  const handleOpenAddModal = (doc?: KnowledgeDocument) => {
    if (doc) {
      setEditingDoc(doc);
      setFormTitle(doc.title);
      setFormCategory(doc.category);
      setFormType(doc.source_type);
      setFormSourceName(doc.source_name || "");
      setFormContent(doc.content);
    } else {
      setEditingDoc(null);
      setFormTitle("");
      setFormCategory("Empresa");
      setFormType("text");
      setFormSourceName("");
      setFormContent("");
      setFaqQuestion("");
      setFaqAnswer("");
      setFormUrl("");
    }
    setIsAddModalOpen(true);
  };

  const handleSaveDocument = async () => {
    let finalContent = formContent.trim();
    let finalTitle = formTitle.trim();
    let finalSourceName = formSourceName.trim();

    if (formType === "faq") {
      if (!faqQuestion.trim() || !faqAnswer.trim()) {
        toast.error("Preencha a pergunta e a resposta do FAQ");
        return;
      }
      finalTitle = finalTitle || faqQuestion.trim();
      finalContent = `Pergunta: ${faqQuestion.trim()}\nResposta: ${faqAnswer.trim()}`;
      finalSourceName = "FAQ";
    } else if (formType === "url") {
      if (!formUrl.trim() || !finalContent) {
        toast.error("Informe a URL e o conteúdo resumido da página");
        return;
      }
      finalTitle = finalTitle || formUrl.trim();
      finalSourceName = formUrl.trim();
    }

    if (!finalTitle || !finalContent) {
      toast.error("Título e conteúdo são obrigatórios");
      return;
    }

    setIsSaving(true);
    try {
      const payload: Partial<KnowledgeDocument> = {
        title: finalTitle,
        category: formCategory,
        source_type: formType,
        source_name: finalSourceName,
        content: finalContent,
        enabled: true,
      };

      if (editingDoc) {
        await updateKnowledgeDoc(wid, editingDoc.id, payload);
        toast.success("Documento atualizado e re-indexado com sucesso!");
      } else {
        await createKnowledgeDoc(wid, payload);
        toast.success("Documento indexado no pgvector com sucesso!");
      }
      setIsAddModalOpen(false);
      loadDocuments();
    } catch (err: any) {
      toast.error(err.message || "Erro ao salvar documento");
    } finally {
      setIsSaving(false);
    }
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setFormSourceName(file.name);
    if (!formTitle) {
      setFormTitle(file.name.replace(/\.[^/.]+$/, ""));
    }

    const reader = new FileReader();
    reader.onload = (event) => {
      const content = event.target?.result as string;
      if (content) {
        setFormContent(content);
        toast.success(`Arquivo "${file.name}" carregado (${(file.size / 1024).toFixed(1)} KB)`);
      }
    };
    reader.onerror = () => {
      toast.error("Erro ao ler arquivo");
    };
    reader.readAsText(file);
  };

  const handleToggle = async (doc: KnowledgeDocument, enabled: boolean) => {
    try {
      await toggleKnowledgeDoc(wid, doc.id, enabled);
      setDocs((prev) => prev.map((d) => (d.id === doc.id ? { ...d, enabled } : d)));
      toast.success(enabled ? "Documento ativado para RAG" : "Documento desativado");
    } catch (err: any) {
      toast.error(err.message || "Erro ao alterar status");
    }
  };

  const handleDeleteConfirm = async () => {
    if (!deletingId) return;
    setIsDeleting(true);
    try {
      await deleteKnowledgeDoc(wid, deletingId);
      toast.success("Documento e vetores excluídos da base");
      setDocs((prev) => prev.filter((d) => d.id !== deletingId));
    } catch (err: any) {
      toast.error(err.message || "Erro ao excluir documento");
    } finally {
      setIsDeleting(false);
      setDeletingId(null);
    }
  };

  const handleTestSearch = async () => {
    if (!testQuery.trim() || isSearching) return;
    setIsSearching(true);
    try {
      const results = await testKnowledgeSearch(wid, testQuery.trim(), 4);
      setTestResults(results || []);
      if (!results || results.length === 0) {
        toast.info("Nenhum trecho com similaridade suficiente foi encontrado.");
      }
    } catch (err: any) {
      toast.error(err.message || "Erro na busca semântica");
    } finally {
      setIsSearching(false);
    }
  };

  // Métricas
  const totalChunks = docs.reduce((acc, d) => acc + (d.chunks_count || 0), 0);
  const totalTokens = docs.reduce((acc, d) => acc + (d.tokens_count || 0), 0);
  const activeCount = docs.filter((d) => d.enabled).length;

  return (
    <div className="space-y-6 max-w-7xl mx-auto animate-fade-in pb-12">
      {/* Top Banner */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 rounded-2xl border bg-card p-5 shadow-xs">
        <div className="space-y-0.5">
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-extrabold tracking-tight text-foreground flex items-center gap-2">
              <BookOpen className="h-5 w-5 text-primary" />
              Base de Conhecimento RAG
            </h1>
            <span className="rounded-full bg-primary/10 text-primary text-xs font-extrabold px-2.5 py-0.5 border border-primary/20">
              {docs.length} {docs.length === 1 ? "documento" : "documentos"}
            </span>
          </div>
          <p className="text-xs text-muted-foreground">
            Documentos, catálogos e FAQs indexados no pgvector (768 dimensões com Gemini) para respostas autônomas da IA.
          </p>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              setTestResults([]);
              setTestQuery("");
              setIsTestModalOpen(true);
            }}
            className="gap-1.5 shadow-xs"
          >
            <Play className="h-4 w-4 text-emerald-500" />
            Testar Busca RAG
          </Button>

          <Button onClick={() => handleOpenAddModal()} size="sm" className="gap-1.5 shadow-xs">
            <Plus className="h-4 w-4" />
            Adicionar Conteúdo
          </Button>
        </div>
      </div>

      {/* Cards de Métricas */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card className="p-4 shadow-2xs border bg-card/60">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs text-muted-foreground font-medium">Documentos Ativos</p>
              <h3 className="text-2xl font-bold text-foreground mt-0.5">
                {activeCount} / {docs.length}
              </h3>
            </div>
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
              <FileCheck2 className="h-5 w-5" />
            </div>
          </div>
        </Card>

        <Card className="p-4 shadow-2xs border bg-card/60">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs text-muted-foreground font-medium">Trechos Vetoriais (pgvector)</p>
              <h3 className="text-2xl font-bold text-foreground mt-0.5">{totalChunks} Chunks</h3>
            </div>
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-500/10 text-emerald-600">
              <Layers className="h-5 w-5" />
            </div>
          </div>
        </Card>

        <Card className="p-4 shadow-2xs border bg-card/60">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs text-muted-foreground font-medium">Volume Estimado de Tokens</p>
              <h3 className="text-2xl font-bold text-foreground mt-0.5">~{(totalTokens / 1000).toFixed(1)}k Tokens</h3>
            </div>
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-indigo-500/10 text-indigo-600">
              <Cpu className="h-5 w-5" />
            </div>
          </div>
        </Card>
      </div>

      {/* Barra de Filtros e Busca */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-3">
        <div className="relative w-full sm:w-80">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar por título, conteúdo ou fonte..."
            className="pl-9 text-xs"
          />
        </div>

        <div className="flex items-center gap-1 overflow-x-auto custom-scrollbar w-full sm:w-auto pb-1 sm:pb-0">
          {CATEGORIES.map((cat) => (
            <Button
              key={cat}
              variant={selectedCategory === cat ? "default" : "ghost"}
              size="sm"
              onClick={() => setSelectedCategory(cat)}
              className="h-8 text-xs font-semibold rounded-lg shrink-0 cursor-pointer"
            >
              {cat}
            </Button>
          ))}
        </div>
      </div>

      {/* Listagem de Documentos */}
      {loading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-7 w-7 animate-spin text-primary" />
        </div>
      ) : docs.length === 0 ? (
        <Card className="border-dashed p-10 text-center bg-muted/10">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10 text-primary mb-3">
            <BookOpen className="h-6 w-6" />
          </div>
          <h3 className="text-sm font-semibold mb-1">Nenhum documento cadastrado</h3>
          <p className="text-xs text-muted-foreground max-w-md mx-auto mb-4">
            Adicione manuais, tabelas de preço, políticas de atendimento ou FAQs para alimentar o cérebro do seu Agente de
            Chat no WhatsApp.
          </p>
          <Button onClick={() => handleOpenAddModal()} size="sm" className="gap-1.5">
            <Plus className="h-4 w-4" />
            Adicionar Primeiro Conteúdo
          </Button>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {docs.map((doc) => (
            <Card
              key={doc.id}
              className={cn(
                "relative overflow-hidden group hover:border-primary/50 transition-all shadow-xs flex flex-col justify-between",
                !doc.enabled && "opacity-60 bg-muted/20"
              )}
            >
              <CardContent className="p-4 space-y-3 flex-1 flex flex-col justify-between">
                <div>
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <div className="flex items-center gap-2">
                      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                        {doc.source_type === "faq" ? (
                          <HelpCircle className="h-4 w-4" />
                        ) : doc.source_type === "file" ? (
                          <FileText className="h-4 w-4" />
                        ) : doc.source_type === "url" ? (
                          <Globe className="h-4 w-4" />
                        ) : (
                          <BookOpen className="h-4 w-4" />
                        )}
                      </div>
                      <div>
                        <h3 className="text-sm font-bold leading-tight group-hover:text-primary transition-colors line-clamp-1">
                          {doc.title}
                        </h3>
                        <span className="text-[10px] text-muted-foreground font-semibold uppercase tracking-wider">
                          {doc.category}
                        </span>
                      </div>
                    </div>

                    <Switch checked={doc.enabled} onChange={(val: boolean) => handleToggle(doc, val)} />
                  </div>

                  <p className="text-[11px] text-muted-foreground line-clamp-3 leading-relaxed mt-2">
                    {doc.content}
                  </p>
                </div>

                <div className="space-y-2.5 pt-2 border-t mt-3">
                  <div className="flex items-center justify-between text-[10px] text-muted-foreground">
                    <span className="flex items-center gap-1 font-mono">
                      <Layers className="h-3 w-3 text-primary" />
                      {doc.chunks_count || 1} chunks ({doc.tokens_count} tokens)
                    </span>
                    <span>{new Date(doc.created_at).toLocaleDateString("pt-BR")}</span>
                  </div>

                  <div className="flex items-center justify-between pt-1">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleOpenAddModal(doc)}
                      className="h-7 text-xs flex-1 mr-2"
                    >
                      Editar Conteúdo
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => setDeletingId(doc.id)}
                      className="h-7 w-7 text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                      title="Excluir documento"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Modal de Adicionar / Editar Documento */}
      <Dialog open={isAddModalOpen} onOpenChange={setIsAddModalOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>{editingDoc ? "Editar Documento da Base" : "Adicionar Conteúdo à Base RAG"}</DialogTitle>
            <DialogDescription>
              O conteúdo será automaticamente fatiado e indexado no pgvector com modelo Gemini text-embedding-004.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            {/* Formato de Entrada */}
            <div className="flex items-center gap-1 p-1 bg-muted/40 rounded-lg border">
              <button
                type="button"
                onClick={() => setFormType("text")}
                className={cn(
                  "flex-1 py-1.5 text-xs font-semibold rounded-md transition-all",
                  formType === "text" ? "bg-background text-foreground shadow-2xs border" : "text-muted-foreground"
                )}
              >
                ✍️ Texto Livre
              </button>
              <button
                type="button"
                onClick={() => setFormType("faq")}
                className={cn(
                  "flex-1 py-1.5 text-xs font-semibold rounded-md transition-all",
                  formType === "faq" ? "bg-background text-foreground shadow-2xs border" : "text-muted-foreground"
                )}
              >
                ❓ FAQ (P&R)
              </button>
              <button
                type="button"
                onClick={() => setFormType("file")}
                className={cn(
                  "flex-1 py-1.5 text-xs font-semibold rounded-md transition-all",
                  formType === "file" ? "bg-background text-foreground shadow-2xs border" : "text-muted-foreground"
                )}
              >
                📁 Arquivo
              </button>
              <button
                type="button"
                onClick={() => setFormType("url")}
                className={cn(
                  "flex-1 py-1.5 text-xs font-semibold rounded-md transition-all",
                  formType === "url" ? "bg-background text-foreground shadow-2xs border" : "text-muted-foreground"
                )}
              >
                🌐 Link / URL
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs">Título do Documento</Label>
                <Input
                  value={formTitle}
                  onChange={(e) => setFormTitle(e.target.value)}
                  placeholder="Ex: Tabela de Preços e Planos 2026"
                  className="text-xs"
                />
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs">Categoria Temática</Label>
                <select
                  value={formCategory}
                  onChange={(e) => setFormCategory(e.target.value)}
                  className="w-full flex h-9 rounded-md border border-input bg-background px-3 py-1 text-xs shadow-xs focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                >
                  <option value="Empresa">Empresa</option>
                  <option value="Produtos">Produtos</option>
                  <option value="Suporte">Suporte</option>
                  <option value="Políticas">Políticas</option>
                  <option value="Vendas">Vendas</option>
                </select>
              </div>
            </div>

            {formType === "faq" ? (
              <div className="space-y-3">
                <div className="space-y-1.5">
                  <Label className="text-xs">Pergunta Frequente</Label>
                  <Input
                    value={faqQuestion}
                    onChange={(e) => setFaqQuestion(e.target.value)}
                    placeholder="Ex: Como funciona a garantia e reembolso?"
                    className="text-xs"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Resposta Oficial</Label>
                  <Textarea
                    value={faqAnswer}
                    onChange={(e) => setFaqAnswer(e.target.value)}
                    placeholder="Ex: Oferecemos garantia incondicional de 14 dias..."
                    className="min-h-[120px] text-xs"
                  />
                </div>
              </div>
            ) : formType === "file" ? (
              <div className="space-y-3">
                <div className="border-2 border-dashed rounded-xl p-4 text-center hover:bg-muted/20 transition-all cursor-pointer relative">
                  <Upload className="h-6 w-6 mx-auto text-muted-foreground mb-1" />
                  <p className="text-xs font-semibold">Clique para selecionar um arquivo (.txt, .md, .csv, .json)</p>
                  <p className="text-[10px] text-muted-foreground">O texto será extraído e fatiado automaticamente.</p>
                  <input
                    type="file"
                    accept=".txt,.md,.csv,.json,.doc,.docx"
                    onChange={handleFileUpload}
                    className="absolute inset-0 opacity-0 cursor-pointer"
                  />
                </div>
                {formSourceName && (
                  <p className="text-xs text-emerald-600 font-mono flex items-center gap-1">
                    <FileCheck2 className="h-3.5 w-3.5" />
                    Arquivo selecionado: {formSourceName}
                  </p>
                )}
                <div className="space-y-1.5">
                  <Label className="text-xs">Conteúdo Extraído (Editável)</Label>
                  <Textarea
                    value={formContent}
                    onChange={(e) => setFormContent(e.target.value)}
                    placeholder="O conteúdo do arquivo aparecerá aqui..."
                    className="min-h-[140px] text-xs font-mono"
                  />
                </div>
              </div>
            ) : formType === "url" ? (
              <div className="space-y-3">
                <div className="space-y-1.5">
                  <Label className="text-xs">URL da Página</Label>
                  <Input
                    value={formUrl}
                    onChange={(e) => setFormUrl(e.target.value)}
                    placeholder="https://suaempresa.com.br/politica"
                    className="text-xs"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Conteúdo da Página</Label>
                  <Textarea
                    value={formContent}
                    onChange={(e) => setFormContent(e.target.value)}
                    placeholder="Cole aqui o texto principal da página..."
                    className="min-h-[140px] text-xs"
                  />
                </div>
              </div>
            ) : (
              <div className="space-y-1.5">
                <Label className="text-xs">Conteúdo Completo do Artigo / Documento</Label>
                <Textarea
                  value={formContent}
                  onChange={(e) => setFormContent(e.target.value)}
                  placeholder="Escreva ou cole o conteúdo detalhado com tabelas, procedimentos e diretrizes..."
                  className="min-h-[200px] text-xs leading-relaxed"
                />
              </div>
            )}
          </div>

          <DialogFooter>
            <Button variant="ghost" size="sm" onClick={() => setIsAddModalOpen(false)} disabled={isSaving}>
              Cancelar
            </Button>
            <Button size="sm" onClick={handleSaveDocument} disabled={isSaving} className="gap-1.5">
              {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <SaveIcon className="h-4 w-4" />}
              {editingDoc ? "Atualizar e Re-indexar" : "Indexar Documento"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Modal de Teste / Playground de Busca RAG */}
      <Dialog open={isTestModalOpen} onOpenChange={setIsTestModalOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Play className="h-5 w-5 text-emerald-500" />
              Simulador de Busca RAG (pgvector 768d)
            </DialogTitle>
            <DialogDescription>
              Faça uma pergunta como se fosse o cliente no WhatsApp para ver quais trechos a IA encontrará na Base.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="flex items-center gap-2">
              <Input
                value={testQuery}
                onChange={(e) => setTestQuery(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleTestSearch();
                }}
                placeholder="Ex: Quanto custa o plano Pro e como cancelo?"
                className="text-xs"
                disabled={isSearching}
              />
              <Button size="sm" onClick={handleTestSearch} disabled={isSearching || !testQuery.trim()} className="gap-1.5">
                {isSearching ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
                Buscar
              </Button>
            </div>

            {/* Resultados do RAG */}
            <div className="space-y-3 max-h-[340px] overflow-y-auto custom-scrollbar">
              {testResults.map((res, idx) => (
                <div key={idx} className="p-3 rounded-lg border bg-muted/20 space-y-1.5 text-xs">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-primary">Trecho #{idx + 1}</span>
                    <Badge variant="outline" className="text-[10px] font-mono text-emerald-600 border-emerald-500/30">
                      Score de Similaridade: {(res.similarity * 100).toFixed(1)}%
                    </Badge>
                  </div>
                  <p className="text-muted-foreground leading-relaxed whitespace-pre-wrap">{res.chunk_text}</p>
                </div>
              ))}
            </div>
          </div>

          <DialogFooter>
            <Button variant="ghost" size="sm" onClick={() => setIsTestModalOpen(false)}>
              Fechar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmModal
        open={Boolean(deletingId)}
        onOpenChange={(open) => !open && setDeletingId(null)}
        title="Excluir Documento da Base"
        description="Tem certeza que deseja excluir este documento? Todos os vetores gerados no pgvector serão removidos imediatamente."
        confirmText="Excluir"
        variant="destructive"
        loading={isDeleting}
        onConfirm={handleDeleteConfirm}
      />
    </div>
  );
};

const SaveIcon = ({ className }: { className?: string }) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    className={className}
  >
    <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z" />
    <polyline points="17 21 17 13 7 13 7 21" />
    <polyline points="7 3 7 8 15 8" />
  </svg>
);
