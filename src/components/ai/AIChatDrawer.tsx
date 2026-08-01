import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import { Send, Plus, Trash2, Sparkles, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAI } from "@/services/ai/AIProvider";
import { cn } from "@/lib/utils";
import { ChatMessage } from "./ChatMessage";
import { TypingIndicator } from "./TypingIndicator";
import { SuggestionChips } from "./SuggestionChips";

/**
 * Painel lateral não-modal (não bloqueia o restante do sistema).
 * Desktop ~420px; mobile ocupa quase toda a tela.
 */
export function AIChatDrawer() {
  const {
    open,
    setOpen,
    messages,
    isThinking,
    send,
    newConversation,
    clearConversation,
  } = useAI();
  const [input, setInput] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, isThinking, open]);

  useEffect(() => {
    if (open) setTimeout(() => textareaRef.current?.focus(), 200);
  }, [open]);

  const handleSend = async () => {
    const text = input.trim();
    if (!text || isThinking) return;
    setInput("");
    await send(text);
  };

  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div
      role="dialog"
      aria-label="Assistente IA"
      aria-hidden={!open}
      className={cn(
        "fixed right-0 top-0 z-50 flex h-[100dvh] w-full flex-col border-l border-border bg-background shadow-2xl",
        "transition-transform duration-300 ease-out sm:w-[420px]",
        open ? "translate-x-0" : "translate-x-full pointer-events-none",
      )}
    >
      <div className="flex items-center justify-between border-b border-border px-4 py-3">
        <div className="flex items-center gap-2">
          <span className="flex h-8 w-8 items-center justify-center rounded-full bg-brand/10 text-brand">
            <Sparkles className="h-4 w-4" />
          </span>
          <div className="flex flex-col text-left">
            <span className="text-sm font-semibold">Assistente IA</span>
            <span className="text-[10px] text-muted-foreground">Lupo · Copiloto</span>
          </div>
        </div>
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="icon" className="h-8 w-8" title="Nova conversa" onClick={newConversation}>
            <Plus className="h-4 w-4" />
          </Button>
          <Button variant="ghost" size="icon" className="h-8 w-8" title="Limpar conversa" onClick={clearConversation}>
            <Trash2 className="h-4 w-4" />
          </Button>
          <Button variant="ghost" size="icon" className="h-8 w-8" title="Fechar" onClick={() => setOpen(false)}>
            <X className="h-4 w-4" />
          </Button>
        </div>
      </div>

      <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-4">
        <div className="flex flex-col gap-3">
          {messages.map((m) => (
            <ChatMessage key={m.id} message={m} />
          ))}
          {isThinking && <TypingIndicator />}
        </div>
      </div>

      <div className="border-t border-border bg-background p-3">
        <div className="mb-2 overflow-x-auto">
          <SuggestionChips onPick={(t) => send(t)} disabled={isThinking} />
        </div>
        <div className="flex items-end gap-2">
          <textarea
            ref={textareaRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={onKeyDown}
            rows={1}
            placeholder="Ex.: quem vendeu mais? conversão? mês?"
            className="min-h-[40px] max-h-32 flex-1 resize-none rounded-lg border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
            disabled={isThinking}
          />
          <Button
            type="button"
            size="icon"
            onClick={handleSend}
            disabled={!input.trim() || isThinking}
            className="h-10 w-10 shrink-0 bg-brand text-brand-foreground hover:bg-brand/90"
            title="Enviar (Enter)"
          >
            <Send className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}
