// backend/src/utils/mailer.js
const { Resend } = require('resend');

// -------------------------------------------------------
// Inicializar Resend
// -------------------------------------------------------
const resendApiKey = process.env.RESEND_API_KEY || '';
const resend = resendApiKey ? new Resend(resendApiKey) : null;

// Función que server.js necesita
function initEmailProvider() {
  if (!resendApiKey) {
    console.warn('⚠️ RESEND_API_KEY no definida; los correos NO se enviarán.');
  } else {
    console.log('✅ Resend API key detectada');
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
// Plantilla RESET
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

                    <p style="margin:16px 0 0 0;font-size:12px;color:#666;line-height:1.5;">
                      ¿Tienes alguna duda o comentario? 
                      Contáctanos 
                      <a href="mailto:AccESCOM.app@gmail.com" style="color:#800040;text-decoration:underline;">
                        aquí
                      </a>.
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
// Plantilla ACCESO (mejorada)
// -------------------------------------------------------
function accessNotificationHtml({ name = 'usuario', type, date, locationName, reason }) {
  const isEntry = type === 'ENTRY';
  const accion = isEntry ? 'entrada' : 'salida';
  const accionCapital = isEntry ? 'Entrada' : 'Salida';
  const emoji = isEntry ? '🟢' : '🔴';

  const when = date || new Date();
  const formattedDate = when.toLocaleString('es-MX', {
    timeZone: 'America/Mexico_City',
    dateStyle: 'full',
    timeStyle: 'short',
  });

  const esDenegado =
    !!reason &&
    /deneg|expir|revoc|no activo|ya fue utilizado|ya se encuentra dentro|ya se encuentra fuera|inválid/i.test(
      reason
    );

  const esAdvertencia =
    !!reason &&
    !esDenegado &&
    /ya está dentro|ya esta dentro|se encuentra dentro|se encuentra fuera|ya está fuera|ya esta fuera|aún no ha entrado|aun no ha entrado|visita completada/i.test(
      reason
    );

  let statusClass = 'allowed';
  let statusText = isEntry ? 'Acceso permitido' : 'Salida permitida';

  if (esDenegado) {
    statusClass = 'denied';
    statusText = isEntry ? 'Acceso denegado' : 'Salida denegada';
  } else if (esAdvertencia) {
    statusClass = 'warning';
    statusText = 'Advertencia';
  }

  const preheader = `${esDenegado ? 'Intento' : 'Registro'} de ${accion} en ${
    locationName || 'ESCOM'
  }`;

  return `
    <!DOCTYPE html>
    <html lang="es">
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>${esDenegado ? 'Intento' : 'Registro'} de ${accion}</title>
        <style>
          body {
            margin: 0;
            font-family: Arial, Helvetica, sans-serif;
            color: #333;
            background-color: #f6f6f6;
          }
          .preheader {
            display: none;
            color: transparent !important;
            visibility: hidden;
            opacity: 0;
            height: 0;
            width: 0;
          }
          .container {
            max-width: 720px;
            margin: 24px auto;
            background-color: #fff;
            border-radius: 12px;
            box-shadow: 0 2px 8px rgba(0,0,0,.06);
            overflow: hidden;
          }
          .header {
            background-color: #800040;
            padding: 20px 24px;
            color: #fff;
            font-weight: bold;
            font-size: 18px;
            display: flex;
            align-items: center;
            gap: 10px;
          }
          .header-dot {
            width: 14px;
            height: 14px;
            border-radius: 50%;
            background-color: #31c24b;
          }
          .content {
            padding: 24px;
            background-color: #fff;
          }
          .content h3 {
            margin: 0 0 8px 0;
            font-size: 22px;
            color: #111;
          }
          .content p {
            margin: 0 0 12px 0;
            line-height: 1.5;
          }
          .info-box {
            background-color: #f9f9f9;
            border-radius: 8px;
            padding: 16px 20px;
            margin: 20px 0;
          }
          .info-box p {
            margin: 8px 0;
          }
          .info-box strong {
            color: #800040;
          }
          .reason-box {
            border-radius: 8px;
            padding: 14px 18px;
            margin: 18px 0;
            font-size: 14px;
          }
          .reason-box.warning {
            background-color: #fff3cd;
            border-left: 4px solid #ffc107;
          }
          .reason-box.denied {
            background-color: #f8d7da;
            border-left: 4px solid #dc3545;
          }
          .btn {
            display: inline-block;
            padding: 12px 30px;
            border-radius: 8px;
            text-decoration: none;
            font-weight: bold;
            margin: 24px 0 8px 0;
          }
          .btn.allowed {
            background-color: #28a745;
            color: #fff !important;
          }
          .btn.denied {
            background-color: #dc3545;
            color: #fff !important;
          }
          .btn.warning {
            background-color: #ffc107;
            color: #333 !important;
          }
          .divider {
            border: none;
            border-top: 1px solid #e6e6e6;
            margin: 24px 0;
          }
          .footer {
            padding: 14px 24px 20px;
            color: #666;
            font-size: 12px;
            text-align: center;
          }
          .footer p {
            margin: 6px 0;
          }
        </style>
      </head>
      <body>
        <span class="preheader">${preheader}</span>
        
        <div class="container">
          <div class="header">
            <span class="header-dot"></span>
            <span>AccESCOM${isEntry ? ' - Entrada' : ' - Salida'}</span>
          </div>
          
          <div class="content">
            <h3>Hola, ${name}</h3>
            <p>Se registró tu <strong>${accion}</strong> en <strong>${locationName || 'ESCOM'}</strong>.</p>

            <div class="info-box">
              <p><strong>Tipo de registro:</strong><br/>${accionCapital}</p>
              <p><strong>Fecha y hora:</strong><br/>${formattedDate}</p>
              <p><strong>Ubicación:</strong><br/>${locationName || 'ESCOM'}</p>
            </div>

            ${
              reason
                ? `
            <div class="reason-box ${
              esDenegado ? 'denied' : esAdvertencia ? 'warning' : ''
            }">
              <p style="margin:0;">
                <strong>${esDenegado ? 'Motivo de denegación:' : 'Observación:'}</strong><br/>
                ${reason}
              </p>
            </div>`
                : ''
            }

            <div style="text-align:center;">
              <span class="btn ${statusClass}">${statusText}</span>
            </div>

            <hr class="divider" />

            <p style="color:#666;font-size:12px;line-height:1.5;margin:0;">
              ${
                esDenegado
                  ? 'Si no reconoces este intento o consideras que es un error, comunícate inmediatamente con el personal de control de acceso.'
                  : 'Si no reconoces este registro, comunícate inmediatamente con el personal de control de acceso.'
              }
            </p>

            <p style="margin:16px 0 0 0;font-size:12px;color:#666;line-height:1.5;">
              ¿Tienes alguna duda o comentario? 
              Contáctanos 
              <a href="mailto:AccESCOM.app@gmail.com" style="color:#800040;text-decoration:underline;">
                aquí
              </a>.
            </p>
          </div>

          <div class="footer">
            <p>© ${new Date().getFullYear()} <strong>AccESCOM · IPN · ESCOM</strong></p>
            <p>Este es un correo automático, por favor no responder.</p>
          </div>
        </div>
      </body>
    </html>
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
  const text = `Hola ${name},

Recibimos una solicitud para restablecer tu contraseña de AccESCOM.
Haz clic en el siguiente enlace para continuar (válido por 30 minutos):

${resetUrl}

Si no solicitaste este cambio, puedes ignorar este mensaje.
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
// Envío NOTIFICACIÓN DE ACCESO (mejorada)
// -------------------------------------------------------
async function sendAccessNotificationEmail({
  to,
  name,
  type,          // 'ENTRY' | 'EXIT'
  date,
  locationName,
  reason,
}) {
  if (!resend) {
    console.warn('⚠️ Resend no está inicializado, no se envía notificación de acceso.');
    return;
  }

  const toEmail = normalizeEmail(to);
  if (!toEmail) {
    console.warn('⚠️ Email de destino inválido en notificación de acceso, no se envía.', { to });
    return;
  }

  const safeName = name || 'usuario';
  const when = date instanceof Date ? date : new Date();
  const lugar = locationName || 'ESCOM';
  const isEntry = type === 'ENTRY';
  const accion = isEntry ? 'entrada' : 'salida';

  const esDenegado =
    !!reason &&
    /deneg|expir|revoc|no activo|ya fue utilizado|inválid/i.test(reason);
  const esAdvertencia =
    !!reason &&
    !esDenegado &&
    /ya está dentro|ya esta dentro|se encuentra dentro|se encuentra fuera|ya está fuera|ya esta fuera|aún no ha entrado|aun no ha entrado|visita completada/i.test(reason);

  let subject = `Registro de acceso - AccESCOM`;
  if (esDenegado) {
    subject = `Intento de acceso denegado - AccESCOM`;
  } else if (esAdvertencia) {
    subject = `Advertencia de acceso - AccESCOM`;
  }

  const preheader = `${esDenegado ? 'Intento' : 'Registro'} de ${accion} en ${lugar}`;

  const html = accessNotificationHtml({
    name: safeName,
    type,
    date: when,
    locationName: lugar,
    reason,
  });

  const fechaTexto = when.toLocaleString('es-MX', {
    timeZone: 'America/Mexico_City',
    dateStyle: 'full',
    timeStyle: 'short',
  });

  const textLines = [
    `Hola ${safeName},`,
    `${esDenegado ? 'Intento de' : 'Registro de'} ${accion} en ${lugar}.`,
    `Fecha y hora: ${fechaTexto}`,
    reason ? `${esDenegado ? 'Motivo' : 'Observación'}: ${reason}` : '',
    '',
    esDenegado
      ? 'Si no reconoces este intento, contacta al personal de control de acceso.'
      : 'Si no reconoces este registro, repórtalo al personal de control de acceso.',
    '',
    '— Sistema AccESCOM',
  ].filter(Boolean);

  const from = process.env.EMAIL_FROM || 'AccESCOM <onboarding@resend.dev>';

  const result = await resend.emails.send({
    from,
    to: toEmail,
    subject,
    html,
    text: textLines.join('\n'),
    headers: { 'X-Preheader': preheader },
  });

  console.log('📨 Resend acceso:', result);
}

// -------------------------------------------------------
// EXPORTS
// -------------------------------------------------------
module.exports = {
  initEmailProvider,
  sendPasswordResetEmail,
  sendAccessNotificationEmail,
};
