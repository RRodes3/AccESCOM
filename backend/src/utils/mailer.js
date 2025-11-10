const nodemailer = require('nodemailer');

const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: parseInt(process.env.SMTP_PORT || '587', 10),
  secure: String(process.env.SMTP_SECURE).toLowerCase() === 'true', // true->465, false->587/25
  auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
});

/** Plantilla HTML (IPN guinda #800040 + toques “plata”) */
function resetEmailHtml({ name = 'usuario', resetUrl }) {
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

/** Helper de envío */
async function sendPasswordResetEmail({ to, name, resetUrl }) {
  const html = resetEmailHtml({ name, resetUrl });
  const text = `Hola ${name || 'usuario'}:
Solicitaste restablecer tu contraseña. Enlace (expira en 30 minutos):
${resetUrl}

Si no fuiste tú, ignora este correo.`;
  return transporter.sendMail({
    from: process.env.SMTP_FROM || '"AccESCOM" <no-reply@accescom.mx>',
    to,
    subject: 'Restablece tu contraseña de AccESCOM',
    html,
    text,
  });
}

module.exports = { transporter, sendPasswordResetEmail };
