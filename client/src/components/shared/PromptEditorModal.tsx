import { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import { Sparkles, X, Save, Maximize2 } from "lucide-react";
import { Button } from "@/components/ui/button";

export interface PromptTag {
  tag: string;
  description: string;
}

export interface PromptEditorModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title?: string;
  description?: string;
  value: string;
  onSave: (value: string) => void;
  tags?: PromptTag[];
  placeholder?: string;
}

export const PromptEditorModal = ({
  open,
  onOpenChange,
  title = "Editor de Prompt",
  description = "Edite o prompt em tela cheia para maior conforto e clareza",
  value,
  onSave,
  tags = [],
  placeholder = "Digite aqui as instruções do prompt...",
}: PromptEditorModalProps) => {
  const [draft, setDraft] = useState(value);

  useEffect(() => {
    if (open) {
      setDraft(value);
    }
  }, [open, value]);

  if (!open) return null;

  const handleSave = () => {
    onSave(draft);
    onOpenChange(false);
  };

  const handleInsertTag = (tag: string) => {
    setDraft((prev) => (prev ? `${prev} ${tag}` : tag));
  };

  return createPortal(
    <div className="fixed inset-0 z-[999] flex flex-col bg-background/95 backdrop-blur-md animate-in fade-in duration-200">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b bg-card/90 backdrop-blur-xs shadow-xs shrink-0">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary/10 text-primary font-bold">
            <Sparkles className="h-5 w-5" />
          </div>
          <div>
            <h3 className="font-bold text-base text-foreground">{title}</h3>
            <p className="text-xs text-muted-foreground">{description}</p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="gap-1.5 rounded-lg text-xs"
            onClick={() => onOpenChange(false)}
          >
            <X className="h-4 w-4" /> Cancelar
          </Button>
          <Button
            type="button"
            size="sm"
            className="gap-1.5 rounded-lg text-xs shadow-xs"
            onClick={handleSave}
          >
            <Save className="h-4 w-4" /> Salvar Prompt
          </Button>
        </div>
      </div>

      {/* Tags reference bar if provided */}
      {tags.length > 0 && (
        <div className="flex items-center gap-2 px-6 py-2.5 border-b bg-muted/40 text-xs text-muted-foreground overflow-x-auto shrink-0 scrollbar-none">
          <span className="font-semibold text-foreground shrink-0 mr-1">Tags Disponíveis:</span>
          {tags.map((t) => (
            <button
              key={t.tag}
              type="button"
              className="flex items-center gap-1 rounded-md border bg-background px-2.5 py-1 text-xs hover:bg-primary/10 hover:border-primary/40 hover:text-primary transition-all shrink-0 cursor-pointer shadow-2xs"
              onClick={() => handleInsertTag(t.tag)}
              title={`Inserir ${t.tag} — ${t.description}`}
            >
              <code className="text-primary font-mono font-semibold">{t.tag}</code>
              <span className="text-muted-foreground text-[11px] hidden sm:inline">— {t.description}</span>
            </button>
          ))}
        </div>
      )}

      {/* Textarea Area */}
      <div className="flex-1 p-6 overflow-hidden bg-muted/10">
        <textarea
          autoFocus
          className="w-full h-full rounded-2xl border border-input/80 bg-background px-5 py-4 text-sm font-mono leading-relaxed shadow-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 resize-none transition-all"
          placeholder={placeholder}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
        />
      </div>

      {/* Footer */}
      <div className="flex items-center justify-between px-6 py-3.5 border-t bg-card/90 backdrop-blur-xs shrink-0">
        <div className="flex items-center gap-3 text-xs text-muted-foreground font-mono">
          <span>{draft.length} caracteres</span>
          <span>•</span>
          <span>{draft.split("\n").length} linhas</span>
        </div>

        <div className="flex gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="gap-1.5 rounded-lg text-xs"
            onClick={() => onOpenChange(false)}
          >
            <X className="h-3.5 w-3.5" /> Cancelar
          </Button>
          <Button
            type="button"
            size="sm"
            className="gap-1.5 rounded-lg text-xs shadow-xs"
            onClick={handleSave}
          >
            <Save className="h-3.5 w-3.5" /> Salvar Prompt
          </Button>
        </div>
      </div>
    </div>,
    document.body
  );
};

export const PromptExpandButton = ({
  onClick,
  className = "",
  label = "Ampliar Editor",
}: {
  onClick: (e: React.MouseEvent) => void;
  className?: string;
  label?: string;
}) => (
  <Button
    type="button"
    variant="outline"
    size="sm"
    className={`h-7 text-xs gap-1.5 rounded-lg border-primary/20 hover:bg-primary/10 hover:text-primary hover:border-primary/40 transition-colors ${className}`}
    onClick={onClick}
    title="Abrir editor de prompt em tela cheia"
  >
    <Maximize2 className="h-3.5 w-3.5 text-primary" />
    <span>{label}</span>
  </Button>
);
