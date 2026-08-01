import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { sendChat } from "./aiService";
import {
  INITIAL_ASSISTANT_MESSAGE,
  newId,
  toWireMessages,
  type ChatMessage,
} from "./chatService";

type AIContextValue = {
  open: boolean;
  setOpen: (v: boolean) => void;
  toggle: () => void;
  messages: ChatMessage[];
  isThinking: boolean;
  send: (text: string) => Promise<void>;
  newConversation: () => void;
  clearConversation: () => void;
};

const Ctx = createContext<AIContextValue | null>(null);

export function AIProvider({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([INITIAL_ASSISTANT_MESSAGE]);
  const [isThinking, setIsThinking] = useState(false);
  const pending = useRef(false);

  const send = useCallback(async (text: string) => {
    const content = text.trim();
    if (!content || pending.current) return;
    pending.current = true;
    setIsThinking(true);

    const userMsg: ChatMessage = {
      id: newId(),
      role: "user",
      content,
      createdAt: Date.now(),
    };
    const nextHistory = [...messages, userMsg];
    setMessages(nextHistory);

    try {
      const reply = await sendChat(toWireMessages(nextHistory));
      setMessages((prev) => [
        ...prev,
        { id: newId(), role: "assistant", content: reply, createdAt: Date.now() },
      ]);
    } catch (err) {
      setMessages((prev) => [
        ...prev,
        {
          id: newId(),
          role: "assistant",
          content:
            "Não consegui responder agora. Tente novamente em instantes.",
          createdAt: Date.now(),
        },
      ]);
      console.error("AI chat failed", err);
    } finally {
      setIsThinking(false);
      pending.current = false;
    }
  }, [messages]);

  const newConversation = useCallback(() => {
    setMessages([{ ...INITIAL_ASSISTANT_MESSAGE, createdAt: Date.now() }]);
  }, []);

  const clearConversation = useCallback(() => {
    setMessages([{ ...INITIAL_ASSISTANT_MESSAGE, createdAt: Date.now() }]);
  }, []);

  const value = useMemo<AIContextValue>(
    () => ({
      open,
      setOpen,
      toggle: () => setOpen((v) => !v),
      messages,
      isThinking,
      send,
      newConversation,
      clearConversation,
    }),
    [open, messages, isThinking, send, newConversation, clearConversation],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAI(): AIContextValue {
  const v = useContext(Ctx);
  if (!v) throw new Error("useAI must be used inside <AIProvider>");
  return v;
}
