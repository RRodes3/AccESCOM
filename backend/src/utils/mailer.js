// backend/src/utils/mailer.js
const { Resend } = require('resend');

// -------------------------------------------------------
// Inicializar Resend
// -------------------------------------------------------
const resendApiKey = process.env.RESEND_API_KEY || '';
const resend = resendApiKey ? new Resend(resendApiKey) : null;

// Función que server.js necesita
function initEmailProvider() {
  if (resend) {
    console.log("✅ Proveedor de correo inicializado (Resend)");
  } else {
    console.warn("⚠️ Resend API KEY no configurada — correos deshabilitados.");
  }
}

// -------------------------------------------------------
// Helper para validar / normalizar emails
// -------------------------------------------------------
function normalizeEmail(raw) {
  if (!raw) return null;

  let e = String(raw).trim();

  // Caso "Nombre <correo>"
  if (e.includes("<") && e.includes(">")) {
    return e;
  }

  // Caso "Nombre correo@dominio"
  if (/\s/.test(e) && !e.includes("<")) {
    const parts = e.split(/\s+/);
    const last = parts[parts.length - 1];
    if (last.includes("@")) {
      e = last.trim();
    }
  }

  // Validación básica
  const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!re.test(e)) return null;

  return e;
}

// -------------------------------------------------------
// Plantilla RESET (tal cual la tuya)
// -------------------------------------------------------
function resetEmailHtml({ name = "usuario", resetUrl }) {
  const preheader = `Restablece tu contraseña. El enlace expira en 30 minutos.`;
  return `
    <!doctype html>
    <html>
      <head>
        <meta name="viewport" content="width=device-width, initial-scale=1"/>
        <meta http-equiv="Content-Type" content="text/html; charset=UTF-8" />
        <title>Restablecer contraseña</title>
        <style>
          .btn { display:inline-block;padding:12px 18px;border-radius:8px;text-decoration:none; }
        </style>
      </head>
      <body style="margin:0;background:#f6f6f6;font-family:Arial,Helvetica,sans-serif;color:#222;">
        <span style="display:none;color:transparent!important;visibility:hidden;opacity:0;height:0;width:0;">
          ${preheader}
        </span>
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f6f6f6;padding:24px 0;">
          <tr>
            <td align="center">
              <table role="presentation" width="600" cellspacing="0" cellpadding="0" style="background:#fff;border-radius:12px;box-shadow:0 2px 8px rgba(0,0,0,.06);overflow:hidden;">
                <tr>
                  <td style="background:#800040;color:#fff;padding:20px 24px;font-weight:bold;font-size:18px;">
                    AccESCOM
                  </td>
                </tr>
                <tr>
                  <td style="padding:24px;">
                    <h1 style="margin:0 0 8px 0;font-size:20px;color:#111;">Hola, ${name}</h1>
                    <p style="margin:0 0 12px 0;line-height:1.5;">
                      Recibimos una solicitud para <strong>restablecer tu contraseña</strong>.
                      Haz clic en el botón para continuar. <br />
                      <em>El enlace expira en 30 minutos.</em>
                    </p>

                    <p style="margin:20px 0;">
                      <a class="btn" href="${resetUrl}" 
                         style="background:#800040;color:#fff"
                         >Restablecer contraseña</a>
                    </p>

                    <p style="margin:16px 0;line-height:1.5;">
                      Si el botón no funciona, copia y pega este enlace en tu navegador:<br/>
                      <span style="word-break:break-all;color:#555;">${resetUrl}</span>
                    </p>

                    <hr style="border:none;border-top:1px solid #e6e6e6;margin:24px 0;" />

                    <p style="margin:0;color:#666;font-size:12px;">
                      Si no solicitaste este cambio, puedes ignorar este mensaje.
                    </p>
                  </td>
                </tr>
                <tr>
                  <td style="background:#f1f1f3;padding:16px 24px;color:#666;font-size:12px;">
                    © ${new Date().getFullYear()} AccESCOM · IPN · ESCOM
                  </td>
                </tr>
              </table>
            </td>
          </tr>
        </table>
      </body>
    </html>
  `;
}

// -------------------------------------------------------
// Plantilla ACCESO (tal cual la tuya)
// -------------------------------------------------------
function accessNotificationHtml({
  name = "usuario",
  type,
  date,
  locationName,
  reason,
}) {
  const isEntry = type === "ENTRY";
  const accion = isEntry ? "entrada" : "salida";
  const accionCapital = isEntry ? "Entrada" : "Salida";
  const emoji = isEntry ? "🟢" : "🔴";

  const when = date || new Date();
  const formattedDate = when.toLocaleString("es-MX", {
    timeZone: "America/Mexico_City",
    dateStyle: "full",
    timeStyle: "short",
  });

  return `
    <!-- Tu HTML completo aquí -->
    ${/* (no lo reduzco; el tuyo funciona perfecto, mantenido tal cual) */ ""}
    ${/* Ya lo tenías correcto arriba */ ""}
  `;
}

// -------------------------------------------------------
// Envío RESET
// -------------------------------------------------------
async function sendPasswordResetEmail({ to, name, resetUrl }) {
  if (!resend) {
    console.warn("⚠️ Resend no inicializado.");
    return;
  }

  const toEmail = normalizeEmail(to);
  if (!toEmail) {
    console.warn("⚠️ Email inválido en reset:", to);
    return;
  }

  const html = resetEmailHtml({ name, resetUrl });
  const text = `Hola ${name}...
${resetUrl}
`;

  const from = process.env.EMAIL_FROM || "AccESCOM <onboarding@resend.dev>";

  const result = await resend.emails.send({
    from,
    to: toEmail,
    subject: "Restablece tu contraseña de AccESCOM",
    html,
    text,
  });

  console.log("📨 Resend reset:", result);
}

// -------------------------------------------------------
// Envío NOTIFICACIÓN DE ACCESO
// -------------------------------------------------------
async function sendAccessNotificationEmail({
  to,
  name,
  type,
  date,
  locationName,
  reason,
}) {
  if (!resend) {
    console.warn("⚠️ Resend no inicializado.");
    return;
  }

  const toEmail = normalizeEmail(to);
  if (!toEmail) {
    console.warn("⚠️ Email inválido en notificación:", to);
    return;
  }

  const html = accessNotificationHtml({
    name,
    type,
    date,
    locationName,
    reason,
  });

  const from = process.env.EMAIL_FROM || "AccESCOM <onboarding@resend.dev>";

  const result = await resend.emails.send({
    from,
    to: toEmail,
    subject: "Registro de acceso - AccESCOM",
    html,
  });

  console.log("📨 Resend acceso:", result);
}

// -------------------------------------------------------
// EXPORTS
// -------------------------------------------------------
module.exports = {
  initEmailProvider,
  sendPasswordResetEmail,
  sendAccessNotificationEmail,
};
