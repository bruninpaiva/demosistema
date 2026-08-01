import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { cn } from "@/lib/utils";
import type { ChatMessage as ChatMessageType } from "@/services/ai/chatService";

function formatTime(ts: number) {
  return new Date(ts).toLocaleTimeString("pt-BR", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function ChatMessage({ message }: { message: ChatMessageType }) {
  const isUser = message.role === "user";
  return (
    <div className={cn("flex flex-col gap-1", isUser ? "items-end" : "items-start")}>
      <div
        className={cn(
          "max-w-[90%] rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed shadow-sm",
          isUser
            ? "whitespace-pre-wrap bg-brand text-brand-foreground rounded-br-sm"
            : "bg-muted text-foreground rounded-bl-sm",
        )}
      >
        {isUser ? (
          message.content
        ) : (
          <div
            className={cn(
              "space-y-2",
              "[&_h1]:text-base [&_h1]:font-bold [&_h1]:mt-0",
              "[&_h2]:text-sm [&_h2]:font-bold [&_h2]:mt-1 [&_h2]:text-brand",
              "[&_h3]:text-sm [&_h3]:font-bold [&_h3]:mt-0 [&_h3]:text-brand",
              "[&_p]:leading-relaxed [&_p]:my-0",
              "[&_strong]:font-semibold [&_strong]:text-foreground",
              "[&_ul]:my-1 [&_ul]:space-y-1 [&_ul]:pl-4 [&_ul]:list-disc [&_ul]:marker:text-brand/60",
              "[&_ol]:my-1 [&_ol]:space-y-1 [&_ol]:pl-4 [&_ol]:list-decimal [&_ol]:marker:text-brand/60",
              "[&_li]:leading-snug",
              "[&_a]:text-brand [&_a]:underline",
              "[&_code]:rounded [&_code]:bg-background/60 [&_code]:px-1 [&_code]:py-0.5 [&_code]:text-[12px] [&_code]:font-mono",
              "[&_hr]:my-2 [&_hr]:border-border/60",
              "[&_table]:w-full [&_table]:text-xs [&_table]:border-collapse [&_table]:my-1",
              "[&_th]:border [&_th]:border-border [&_th]:bg-background/60 [&_th]:px-2 [&_th]:py-1 [&_th]:text-left [&_th]:font-semibold",
              "[&_td]:border [&_td]:border-border [&_td]:px-2 [&_td]:py-1",
              "[&_blockquote]:border-l-2 [&_blockquote]:border-brand/40 [&_blockquote]:pl-2 [&_blockquote]:italic [&_blockquote]:text-muted-foreground",
            )}
          >
            <ReactMarkdown remarkPlugins={[remarkGfm]}>
              {message.content}
            </ReactMarkdown>
          </div>
        )}
      </div>
      <span className="px-1 text-[10px] text-muted-foreground">
        {formatTime(message.createdAt)}
      </span>
    </div>
  );
}
