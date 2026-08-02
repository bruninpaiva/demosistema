import { createServerFn } from "@tanstack/react-start";

type RequestPasswordResetInput = { email: string };
type RequestPasswordResetResult = { ok: boolean };

const GENERIC_ERROR_LOG_PREFIX = "[password-reset]";

export const requestPasswordReset = createServerFn({ method: "POST" })
  .validator((input: RequestPasswordResetInput) => {
    if (!input || typeof input.email !== "string" || !input.email.trim()) {
      throw new Error("email required");
    }
    return { email: input.email.trim().toLowerCase() };
  })
  .handler(async ({ data }): Promise<RequestPasswordResetResult> => {
    const appUrl = process.env.APP_URL;
    if (!appUrl) {
      console.error(`${GENERIC_ERROR_LOG_PREFIX} APP_URL não configurada`);
      return { ok: false };
    }

    try {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

      const { data: user, error: lookupError } = await supabaseAdmin
        .from("admin_users")
        .select("name, email")
        .eq("email", data.email)
        .eq("active", true)
        .maybeSingle();

      if (lookupError) {
        console.error(`${GENERIC_ERROR_LOG_PREFIX} falha ao buscar usuário:`, lookupError);
        return { ok: false };
      }

      // No matching account: stay silent to the caller (no enumeration), don't send anything.
      if (!user) return { ok: true };

      const { data: token, error: rpcError } = await supabaseAdmin.rpc("admin_request_password_reset", {
        _email: data.email,
      });

      if (rpcError || !token) {
        console.error(`${GENERIC_ERROR_LOG_PREFIX} falha ao gerar token:`, rpcError);
        return { ok: false };
      }

      const resetUrl = `${appUrl.replace(/\/+$/, "")}/admin/redefinir-senha?token=${token}`;

      const { sendPasswordResetEmail } = await import("@/lib/email/passwordReset.server");
      await sendPasswordResetEmail({ to: user.email, name: user.name, resetUrl });

      return { ok: true };
    } catch (err) {
      console.error(`${GENERIC_ERROR_LOG_PREFIX} erro inesperado:`, err);
      return { ok: false };
    }
  });
