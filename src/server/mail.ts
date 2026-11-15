/**
 * Envio de e-mail (hoje só a recuperação de senha), por SMTP — serve qualquer provedor
 * (Gmail com senha de app, Brevo, Resend, Mailgun…). Sem SMTP configurado, a recuperação por
 * e-mail fica desligada e o site não oferece “Esqueci a senha”.
 */
export interface MailMessage {
  to: string;
  subject: string;
  text: string;
  html: string;
}

export interface Mailer {
  /** Há um provedor configurado. */
  readonly configured: boolean;
  send(message: MailMessage): Promise<void>;
}

export interface SmtpConfig {
  host: string;
  port: number;
  user: string;
  pass: string;
  /** Remetente, ex.: `Leilão FC <voce@gmail.com>`. */
  from: string;
}

/** Lê SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS e MAIL_FROM. Faltando host, usuário ou senha: nulo. */
export function smtpFromEnv(env: NodeJS.ProcessEnv): SmtpConfig | null {
  const host = env.SMTP_HOST?.trim();
  const user = env.SMTP_USER?.trim();
  const pass = env.SMTP_PASS;
  if (!host || !user || !pass) return null;
  const port = Number(env.SMTP_PORT ?? 465);
  return { host, port: Number.isInteger(port) && port > 0 ? port : 465, user, pass, from: env.MAIL_FROM?.trim() || `Leilão FC <${user}>` };
}

export const noMailer: Mailer = {
  configured: false,
  async send() {
    throw new Error('Envio de e-mail não configurado.');
  },
};

export function smtpMailer(config: SmtpConfig): Mailer {
  // Carregado só quando há SMTP: quem não usa e-mail não precisa do pacote para subir o servidor.
  let transport: Promise<{ sendMail(m: Record<string, unknown>): Promise<unknown> }> | null = null;
  const open = () =>
    (transport ??= import('nodemailer').then((m) =>
      (m.default ?? m).createTransport({
        host: config.host,
        port: config.port,
        // 465 já começa cifrado; nas outras portas (587) a conexão sobe para TLS com STARTTLS.
        secure: config.port === 465,
        auth: { user: config.user, pass: config.pass },
        connectionTimeout: 15_000,
        greetingTimeout: 15_000,
        socketTimeout: 20_000,
      }),
    ));
  return {
    configured: true,
    async send(message) {
      const t = await open();
      await t.sendMail({ from: config.from, to: message.to, subject: message.subject, text: message.text, html: message.html });
    },
  };
}

const escapeHtml = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

/** E-mail com o link para criar uma senha nova. */
export function passwordResetMail(params: { to: string; teamName: string; link: string; minutes: number }): MailMessage {
  const { teamName, link, minutes } = params;
  const text = [
    `Olá, técnico do ${teamName}!`,
    '',
    `Recebemos um pedido para criar uma senha nova para a sua conta no Leilão FC.`,
    `Abra o link abaixo (vale por ${minutes} minutos e só uma vez):`,
    '',
    link,
    '',
    'Se não foi você, ignore este e-mail: a senha continua a mesma.',
  ].join('\n');
  const html = `<div style="font-family:system-ui,-apple-system,Segoe UI,sans-serif;max-width:520px;margin:0 auto;color:#24160c">
  <h1 style="font-size:22px;margin:0 0 12px">Leilão FC</h1>
  <p>Olá, técnico do <strong>${escapeHtml(teamName)}</strong>!</p>
  <p>Recebemos um pedido para criar uma senha nova para a sua conta.</p>
  <p style="margin:22px 0"><a href="${escapeHtml(link)}" style="background:#ffc81e;color:#24160c;font-weight:700;text-decoration:none;padding:12px 18px;border-radius:10px;border:2px solid #24160c;display:inline-block">Criar senha nova</a></p>
  <p style="font-size:14px">O link vale por ${minutes} minutos e só pode ser usado uma vez. Se o botão não abrir, copie este endereço:<br><span style="word-break:break-all">${escapeHtml(link)}</span></p>
  <p style="font-size:14px;color:#6b5a48">Se não foi você, ignore este e-mail: a senha continua a mesma.</p>
</div>`;
  return { to: params.to, subject: 'Leilão FC: criar senha nova', text, html };
}
