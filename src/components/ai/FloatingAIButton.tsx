import { Sparkles } from "lucide-react";
import { useAI } from "@/services/ai/AIProvider";
import { cn } from "@/lib/utils";

export function FloatingAIButton() {
  const { toggle, open } = useAI();
  return (
    <button
      type="button"
      onClick={toggle}
      aria-label="Assistente IA"
      title="Assistente IA"
      className={cn(
        "group fixed bottom-5 right-5 z-40 flex h-14 w-14 items-center justify-center rounded-full",
        "bg-brand text-brand-foreground shadow-lg shadow-brand/30",
        "transition-all duration-300 hover:scale-110 hover:shadow-xl active:scale-95",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2",
        open && "scale-95 opacity-80",
      )}
    >
      <span className="absolute inset-0 rounded-full bg-brand/40 opacity-0 blur-xl transition-opacity duration-500 group-hover:opacity-100" />
      <Sparkles className="relative h-6 w-6 animate-[pulse_2.5s_ease-in-out_infinite]" />
      <span className="pointer-events-none absolute right-full mr-3 whitespace-nowrap rounded-md bg-foreground px-2 py-1 text-xs font-medium text-background opacity-0 shadow transition-opacity duration-200 group-hover:opacity-100">
        Assistente IA
      </span>
    </button>
  );
}
