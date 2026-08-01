import { AIProvider } from "@/services/ai/AIProvider";
import { FloatingAIButton } from "./FloatingAIButton";
import { AIChatDrawer } from "./AIChatDrawer";
import { useRouterState } from "@tanstack/react-router";
import { useEffect, useState, type ReactNode } from "react";

const AUTH_KEY = "lupo_admin_ok";

function useAdminAuthed(): boolean {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const [authed, setAuthed] = useState(false);

  useEffect(() => {
    const check = () => {
      const ok =
        typeof window !== "undefined" &&
        sessionStorage.getItem(AUTH_KEY) === "1";
      setAuthed(ok);
    };
    check();
    window.addEventListener("storage", check);
    window.addEventListener("lupo-admin-auth-changed", check);
    const t = window.setInterval(check, 1000);
    return () => {
      window.removeEventListener("storage", check);
      window.removeEventListener("lupo-admin-auth-changed", check);
      window.clearInterval(t);
    };
  }, [pathname]);

  return authed && pathname.startsWith("/admin");
}

export function AIAssistant({ children }: { children: ReactNode }) {
  const visible = useAdminAuthed();
  return (
    <AIProvider>
      {children}
      {visible && (
        <>
          <FloatingAIButton />
          <AIChatDrawer />
        </>
      )}
    </AIProvider>
  );
}
