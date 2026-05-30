import { Resend } from "resend";
import { env } from "../config/env.js";

export async function sendMail(opts: {
  to: string | string[];
  subject: string;
  html: string;
  replyTo?: string;
}) {
  if (!env.resendApiKey) {
    console.error("[email] RESEND_API_KEY is not set — skipping email send");
    return;
  }

  const from = env.resendFrom ?? "KAOS HRIS <kaoshris@kaoscafé.com>";
  const resend = new Resend(env.resendApiKey);

  const { error } = await resend.emails.send({
    from,
    to: Array.isArray(opts.to) ? opts.to : [opts.to],
    replyTo: opts.replyTo,
    subject: opts.subject,
    html: opts.html,
  });

  if (error) {
    console.error("[email] Failed to send email:", error);
    throw new Error(`[email] Send failed: ${error.message}`);
  }

  console.log(`[email] Sent "${opts.subject}" to ${Array.isArray(opts.to) ? opts.to.join(", ") : opts.to}`);
}
