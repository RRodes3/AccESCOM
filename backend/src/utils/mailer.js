// backend/src/utils/mailer.js
const { Resend } = require('resend');

// -------------------------------------------------------
// Inicializar Resend
// -------------------------------------------------------
const resendApiKey = process.env.RESEND_API_KEY || '';
const resend = resendApiKey ? new Resend(resendApiKey) : null;

// Usa SIEMPRE un correo del dominio verificado (ajusta en variables de entorno)
const DEFAULT_FROM = 'AccESCOM-No-Reply <notificaciones@projectorio.org>';
const FROM = (process.env.RESEND_FROM || DEFAULT_FROM).trim();

function checkFromDomain() {
  // Extraer solo el correo entre < >
  const match = FROM.match(/<([^>]+)>/);
  const email = match ? match[1] : FROM;

  if (!/@projectorio\.org$/i.test(email)) {
    console.warn(
      '⚠️ RESEND_FROM NO usa el dominio projectorio.org. ' +
        'Actualiza RESEND_FROM en Railway a algo como: ' +
        '"AccESCOM-No-Reply <notificaciones@projectorio.org>"'
    );
  }
}

function initEmailProvider() {
  if (!resendApiKey) {
    console.warn(
      '⚠️ RESEND_API_KEY no definida; los correos NO se enviarán.'
    );
  } else {
    console.log('✅ Resend inicializado.');
    console.log('   Remitente (FROM):', FROM);
    checkFromDomain();
  }
}

// -------------------------------------------------------
// Helper para validar / normalizar emails
// -------------------------------------------------------
function normalizeEmail(raw) {
  if (!raw) return null;
  let e = String(raw).trim();

  // Si ya viene en formato "Nombre <email@dominio>"
  if (e.includes('<') && e.includes('>')) return e;

  // Si viene con nombre + correo en la última "palabra"
  if (/\s/.test(e) && !e.includes('<')) {
    const parts = e.split(/\s+/);
    const last = parts[parts.length - 1];
    if (last.includes('@')) e = last.trim();
  }

  const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!re.test(e)) return null;
  return e;
}

// -------------------------------------------------------
// Plantilla RESET
// -------------------------------------------------------
function resetEmailHtml({ name = 'usuario', resetUrl }) {
  const preheader = `Restablece tu contraseña. El enlace expira en 30 minutos.`;
  return `
    <!doctype html>
    <html>
      <head>
        <meta name="viewport" content="width=device-width, initial-scale=1"/>
        <meta http-equiv="Content-Type" content="text/html; charset=UTF-8" />
        <title>Restablecer contraseña</title>
        <style>.btn{display:inline-block;padding:12px 18px;border-radius:8px;text-decoration:none;}</style>
      </head>
      <body style="margin:0;background:#f6f6f6;font-family:Arial,Helvetica,sans-serif;color:#222;">
        <span style="display:none;color:transparent!important;visibility:hidden;opacity:0;height:0;width:0;">${preheader}</span>
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f6f6f6;padding:24px 0;">
          <tr><td align="center">
            <table role="presentation" width="600" cellspacing="0" cellpadding="0" style="background:#fff;border-radius:12px;box-shadow:0 2px 8px rgba(0,0,0,.06);overflow:hidden;">
              <tr>
                <td style="background:#800040;color:#fff;padding:20px 24px;font-weight:bold;font-size:18px;">AccESCOM</td>
              </tr>
              <tr>
                <td style="padding:24px;">
                  <h1 style="margin:0 0 8px;font-size:20px;color:#111;">Hola, ${name}</h1>
                  <p style="margin:0 0 12px;line-height:1.5;">
                    Recibimos una solicitud para <strong>restablecer tu contraseña</strong>.<br/>
                    <em>El enlace expira en 30 minutos.</em>
                  </p>
                  <p style="margin:20px 0;">
                    <a class="btn" href="${resetUrl}" style="background:#800040;color:#fff">Restablecer contraseña</a>
                  </p>
                  <p style="margin:16px 0;line-height:1.5;">
                    Si el botón no funciona, copia y pega este enlace:<br/>
                    <span style="word-break:break-all;color:#555;">${resetUrl}</span>
                  </p>
                  <hr style="border:none;border-top:1px solid #e6e6e6;margin:24px 0;" />
                  <p style="margin:0;color:#666;font-size:12px;">Si no solicitaste este cambio, ignora este mensaje.</p>
                  <p style="margin:16px 0 0;font-size:12px;color:#666;line-height:1.5;">
                    ¿Dudas? Escríbenos a <a href="mailto:soporte@projectorio.org" style="color:#800040;">soporte@projectorio.org</a>.
                  </p>
                </td>
              </tr>
              <tr>
                <td style="background:#f1f1f3;padding:16px 24px;color:#666;font-size:12px;">
                  © ${new Date().getFullYear()} AccESCOM · IPN · ESCOM
                </td>
              </tr>
            </table>
          </td></tr>
        </table>
      </body>
    </html>
  `;
}

// -------------------------------------------------------
// Plantilla ACCESO
// -------------------------------------------------------
function accessNotificationHtml({ name = 'usuario', type, date, locationName, reason }) {
  const isEntry = type === 'ENTRY';
  const accion = isEntry ? 'entrada' : 'salida';
  const cuando = date || new Date();
  const formattedDate = cuando.toLocaleString('es-MX', {
    timeZone: 'America/Mexico_City',
    dateStyle: 'full',
    timeStyle: 'short',
  });

  const esDenegado =
    !!reason &&
    /deneg|expir|revoc|no activo|ya fue utilizado|inválid|fuera de vigencia/i.test(reason);
  const esAdvertencia =
    !!reason && !esDenegado &&
    /ya está dentro|ya esta dentro|se encuentra dentro|se encuentra fuera|ya está fuera|ya esta fuera|aún no ha entrado|aun no ha entrado|visita completada/i.test(reason);

  let statusClass = 'allowed';
  let statusText = isEntry ? 'Acceso permitido' : 'Salida permitida';
  if (esDenegado) { statusClass = 'denied'; statusText = isEntry ? 'Acceso denegado' : 'Salida denegada'; }
  else if (esAdvertencia) { statusClass = 'warning'; statusText = 'Advertencia'; }

  const preheader = `${esDenegado ? 'Intento' : 'Registro'} de ${accion} en ${locationName || 'ESCOM'}`;

  return `
    <!DOCTYPE html><html lang="es"><head>
      <meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0">
      <title>${esDenegado ? 'Intento' : 'Registro'} de ${accion}</title>
      <style>
        body{margin:0;font-family:Arial,Helvetica,sans-serif;background:#f6f6f6;color:#333;}
        .preheader{display:none!important;opacity:0;height:0;width:0;}
        .container{max-width:720px;margin:24px auto;background:#fff;border-radius:12px;box-shadow:0 2px 8px rgba(0,0,0,.06);overflow:hidden;}
        .header{background:#800040;color:#fff;padding:20px 24px;font-weight:bold;font-size:18px;}
        .content{padding:24px;}
        .info-box{background:#f9f9f9;border-radius:8px;padding:16px 20px;margin:20px 0;}
        .reason-box{border-radius:8px;padding:14px 18px;margin:18px 0;font-size:14px;}
        .reason-box.warning{background:#fff3cd;border-left:4px solid #ffc107;}
        .reason-box.denied{background:#f8d7da;border-left:4px solid #dc3545;}
        .btn{display:inline-block;padding:12px 30px;border-radius:8px;text-decoration:none;font-weight:bold;margin:24px 0 8px;}
        .btn.allowed{background:#28a745;color:#fff!important;}
        .btn.denied{background:#dc3545;color:#fff!important;}
        .btn.warning{background:#ffc107;color:#333!important;}
        .divider{border:none;border-top:1px solid #e6e6e6;margin:24px 0;}
        .footer{padding:14px 24px 20px;color:#666;font-size:12px;text-align:center;}
      </style>
    </head><body>
      <span class="preheader">${preheader}</span>
      <div class="container">
        <div class="header">AccESCOM - ${isEntry ? 'Entrada' : 'Salida'}</div>
        <div class="content">
          <h3 style="margin:0 0 12px;">Hola, ${name}</h3>
          <p style="margin:0 0 12px;">Se registró tu <strong>${accion}</strong> en <strong>${locationName || 'ESCOM'}</strong>.</p>
          <div class="info-box">
            <p style="margin:8px 0;"><strong>Tipo:</strong> ${isEntry ? 'Entrada' : 'Salida'}</p>
            <p style="margin:8px 0;"><strong>Fecha y hora:</strong> ${formattedDate}</p>
            <p style="margin:8px 0;"><strong>Ubicación:</strong> ${locationName || 'ESCOM'}</p>
          </div>
          ${
            reason
              ? `<div class="reason-box ${esDenegado ? 'denied' : esAdvertencia ? 'warning' : ''}">
                  <p style="margin:0;"><strong>${esDenegado ? 'Motivo de denegación' : esAdvertencia ? 'Observación' : 'Detalle'}:</strong><br/>${reason}</p>
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
                ? 'Si no reconoces este intento, contacta al personal de control de acceso.'
                : 'Si no reconoces este registro, repórtalo al personal de control de acceso.'
            }
          </p>
          <p style="margin:16px 0 0;font-size:12px;color:#666;line-height:1.5;">
            ¿Dudas? Escríbenos a <a href="mailto:soporte@projectorio.org" style="color:#800040;">soporte@projectorio.org</a>.
          </p>
        </div>
        <div class="footer">
          <p style="margin:6px 0;">© ${new Date().getFullYear()} AccESCOM · IPN · ESCOM</p>
          <p style="margin:6px 0;">Correo automático, no responder.</p>
        </div>
      </div>
    </body></html>
  `;
}

// -------------------------------------------------------
// Envío RESET
// -------------------------------------------------------
async function sendPasswordResetEmail({ to, name, resetUrl }) {
  if (!resend) {
    console.warn('⚠️ Resend no inicializado (reset).');
    return;
  }
  const toEmail = normalizeEmail(to);
  if (!toEmail) {
    console.warn('⚠️ Email inválido en reset:', to);
    return;
  }

  try {
    const html = resetEmailHtml({ name, resetUrl });
    const text = `Hola ${name},

Recibimos una solicitud para restablecer tu contraseña.
Enlace (30 min): ${resetUrl}

Si no solicitaste esto, ignora el mensaje.

— AccESCOM`;

    const { data, error } = await resend.emails.send({
      from: FROM,
      to: toEmail,
      subject: 'Restablece tu contraseña - AccESCOM',
      html,
      text,
      headers: { 'X-Template': 'password-reset' },
    });

    if (error) {
      console.error('❌ Error Resend reset:', error);
      if (error.message?.includes('verify a domain')) {
        console.error('👉 Revisa que RESEND_FROM use @projectorio.org y que el dominio esté verificado.');
      }
    } else {
      console.log('📨 Reset enviado:', data?.id);
    }
  } catch (err) {
    console.error('❌ Excepción enviando reset:', err);
  }
}

// -------------------------------------------------------
// Envío NOTIFICACIÓN DE ACCESO
// -------------------------------------------------------
async function sendAccessNotificationEmail({
  to,
  name,
  type, // ENTRY | EXIT
  date,
  locationName,
  reason,
}) {
  if (!resend) {
    console.warn('⚠️ Resend no inicializado (acceso).');
    return;
  }
  const toEmail = normalizeEmail(to);
  if (!toEmail) {
    console.warn('⚠️ Email destino inválido (acceso):', to);
    return;
  }

  try {
    const safeName = name || 'usuario';
    const when = date instanceof Date ? date : new Date();
    const lugar = locationName || 'ESCOM';
    const isEntry = type === 'ENTRY';

    const esDenegado =
      !!reason &&
      /deneg|expir|revoc|no activo|ya fue utilizado|inválid/i.test(reason);
    const esAdvertencia =
      !!reason &&
      !esDenegado &&
      /ya está dentro|ya esta dentro|se encuentra dentro|se encuentra fuera|ya está fuera|ya esta fuera|aún no ha entrado|aun no ha entrado|visita completada/i.test(
        reason
      );

    let subject = `${isEntry ? 'Registro de acceso' : 'Registro de salida'} - ${lugar}`;
    if (esDenegado) subject = `Intento de acceso denegado - ${lugar}`;
    else if (esAdvertencia) subject = `Advertencia de acceso - ${lugar}`;

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

    const textParts = [
      `Hola ${safeName},`,
      `${esDenegado ? 'Intento de' : 'Registro de'} ${isEntry ? 'entrada' : 'salida'} en ${lugar}.`,
      `Fecha y hora: ${fechaTexto}`,
      reason
        ? `${esDenegado ? 'Motivo' : esAdvertencia ? 'Observación' : 'Detalle'}: ${reason}`
        : '',
      '',
      esDenegado
        ? 'Si no reconoces este intento, contacta al personal de control de acceso.'
        : 'Si no reconoces este registro, repórtalo al personal de control de acceso.',
      '',
      '— Sistema AccESCOM',
    ].filter(Boolean);

    const preheader = `${esDenegado ? 'Intento' : 'Registro'} de ${
      isEntry ? 'entrada' : 'salida'
    } en ${lugar}`;

    const { data, error } = await resend.emails.send({
      from: FROM,
      to: toEmail,
      subject,
      html,
      text: textParts.join('\n'),
      headers: { 'X-Preheader': preheader, 'X-Template': 'access-notification' },
    });

    if (error) {
      console.error('❌ Error Resend acceso:', error);
      if (error.message?.includes('verify a domain')) {
        console.error('👉 Revisa que RESEND_FROM use @projectorio.org y que el dominio esté verificado.');
      }
    } else {
      console.log('📨 Acceso enviado:', data?.id);
    }
  } catch (err) {
    console.error('❌ Excepción enviando acceso:', err);
  }
}

// -------------------------------------------------------
// EXPORTS
// -------------------------------------------------------
module.exports = {
  initEmailProvider,
  sendPasswordResetEmail,
  sendAccessNotificationEmail,
};
