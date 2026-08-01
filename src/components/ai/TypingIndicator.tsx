export function TypingIndicator() {
  return (
    <div className="flex items-center gap-1.5 rounded-2xl bg-muted px-3 py-2 text-muted-foreground w-fit">
      <span className="text-xs">Pensando</span>
      <span className="flex gap-1">
        <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-current [animation-delay:-0.3s]" />
        <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-current [animation-delay:-0.15s]" />
        <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-current" />
      </span>
    </div>
  );
}
