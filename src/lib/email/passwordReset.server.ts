// Server-only: sends the password reset e-mail via Resend.
// Never import this from a route file or any module shipped to the client bundle —
// load it dynamically inside a server function handler, same convention as client.server.ts.
import { Resend } from "resend";

type SendPasswordResetEmailParams = {
  to: string;
  name?: string | null;
  resetUrl: string;
};

function buildHtml(name: string | null | undefined, resetUrl: string): string {
  const greeting = name ? `Olá, ${escapeHtml(name)},` : "Olá,";

  return `<!doctype html>
<html lang="pt-BR">
  <body style="margin:0;padding:0;background-color:#f4f5f7;font-family:'Inter',system-ui,-apple-system,sans-serif;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#f4f5f7;padding:32px 16px;">
      <tr>
        <td align="center">
          <table role="presentation" width="480" cellpadding="0" cellspacing="0" style="max-width:480px;width:100%;background-color:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 2px 12px rgba(0,0,0,0.06);">
            <tr>
              <td style="background:linear-gradient(135deg,#002F87,#E30613);padding:28px 32px;text-align:center;">
                <span style="color:#ffffff;font-size:18px;font-weight:800;letter-spacing:0.3px;">BPInfo ERP</span>
              </td>
            </tr>
            <tr>
              <td style="padding:32px;">
                <h1 style="margin:0 0 16px;font-size:18px;font-weight:700;color:#111827;">Redefinição de senha</h1>
                <p style="margin:0 0 16px;font-size:14px;line-height:1.6;color:#374151;">
                  ${greeting} recebemos uma solicitação para redefinir a senha da sua conta administrativa no BPInfo ERP.
                </p>
                <table role="presentation" cellpadding="0" cellspacing="0" style="margin:24px 0;">
                  <tr>
                    <td style="border-radius:10px;background-color:#002F87;">
                      <a href="${resetUrl}" style="display:inline-block;padding:14px 28px;font-size:14px;font-weight:700;color:#ffffff;text-decoration:none;border-radius:10px;">
                        Redefinir senha
                      </a>
                    </td>
                  </tr>
                </table>
                <p style="margin:0 0 16px;font-size:13px;line-height:1.6;color:#6b7280;">
                  Este link é válido por <strong>15 minutos</strong>. Se você não solicitou essa redefinição, pode ignorar este e-mail com segurança — sua senha permanecerá inalterada.
                </p>
                <p style="margin:0;font-size:12px;line-height:1.6;color:#9ca3af;word-break:break-all;">
                  Se o botão não funcionar, copie e cole este link no navegador:<br />${resetUrl}
                </p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export async function sendPasswordResetEmail({ to, name, resetUrl }: SendPasswordResetEmailParams): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.EMAIL_FROM;

  if (!apiKey || !from) {
    throw new Error("Resend não configurado: RESEND_API_KEY/EMAIL_FROM ausente(s).");
  }

  const resend = new Resend(apiKey);

  const { error } = await resend.emails.send({
    from,
    to,
    subject: "Redefinição de senha — BPInfo ERP",
    html: buildHtml(name, resetUrl),
  });

  if (error) {
    throw new Error(`Resend recusou o envio: ${error.message ?? "erro desconhecido"}`);
  }
}
