const nodemailer = require('nodemailer');

const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: parseInt(process.env.SMTP_PORT || '587', 10),
  secure: String(process.env.SMTP_SECURE).toLowerCase() === 'true', // true->465, false->587/25
  auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
});

/** Plantilla HTML (IPN guinda #800040 + toques "plata") */
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

/** Plantilla HTML para notificación de acceso (entrada/salida) */
function accessNotificationHtml({ name = 'usuario', type, date, locationName, reason }) {
  const isEntry = type === 'ENTRY';
  const accion = isEntry ? 'entrada' : 'salida';
  const accionCapital = isEntry ? 'Entrada' : 'Salida';
  const emoji = isEntry ? '🟢' : '🔴';
  
  const when = date || new Date();
  const formattedDate = when.toLocaleString('es-MX', { 
    timeZone: 'America/Mexico_City',
    dateStyle: 'full',
    timeStyle: 'short'
  });

  const esDenegado = !!reason && /deneg|expir|revoc|no activo|ya fue utilizado|ya se encuentra dentro|aún no ha entrado|inválid/i.test(reason);
  const esAdvertencia = !!reason && !esDenegado && /ya está dentro|ya esta dentro|se encuentra dentro|se encuentra fuera|ya está fuera|ya esta fuera|aún no ha entrado|aun no ha entrado|visita completada/i.test(reason);
  
  let statusClass = '';
  let statusText = 'Acceso registrado';
  
  if (esDenegado) {
    statusClass = 'denied';
    statusText = 'Acceso denegado';
  } else if (esAdvertencia) {
    statusClass = 'warning';
    statusText = 'Advertencia';
  }

  const preheader = `${esDenegado ? 'Intento' : 'Registro'} de ${accion} en ${locationName || 'ESCOM'}`;

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
            max-width: 600px;
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
          }
          .content {
            padding: 24px;
            background-color: #fff;
          }
          .content h3 {
            margin: 0 0 8px 0;
            font-size: 20px;
            color: #111;
          }
          .content p {
            margin: 0 0 12px 0;
            line-height: 1.5;
          }
          .info-box {
            background-color: #f9f9f9;
            border-radius: 8px;
            padding: 16px;
            margin: 16px 0;
          }
          .info-box p {
            margin: 8px 0;
          }
          .info-box strong {
            color: #800040;
          }
          .reason-box {
            background-color: #fff3cd;
            border-left: 4px solid #ffc107;
            padding: 12px 16px;
            margin: 16px 0;
            border-radius: 4px;
          }
          .reason-box.denied {
            background-color: #f8d7da;
            border-left-color: #dc3545;
          }
          .btn {
            display: inline-block;
            padding: 12px 24px;
            background-color: #28a745;
            color: white !important;
            text-decoration: none;
            border-radius: 8px;
            font-weight: bold;
            margin: 16px 0;
          }
          .btn.denied {
            background-color: #dc3545;
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
            background-color: #f1f1f3;
            padding: 16px 24px;
            color: #666;
            font-size: 12px;
            text-align: center;
          }
          .footer p {
            margin: 8px 0;
          }
        </style>
      </head>
      <body>
        <span class="preheader">${preheader}</span>
        
        <div class="container">
          <div class="header">
            ${emoji} AccESCOM
          </div>
          
          <div class="content">
            <h3>Hola, ${name}</h3>
            <p>
              ${esDenegado ? 'Se registró un intento de' : 'Registramos tu'} 
              <strong>${accion}</strong> en <strong>${locationName || 'ESCOM'}</strong>.
            </p>

            <div class="info-box">
              <p><strong>Tipo de registro:</strong><br/><span style="color:#333;">${accionCapital}</span></p>
              <p><strong>Fecha y hora:</strong><br/><span style="color:#333;">${formattedDate}</span></p>
              <p><strong>Ubicación:</strong><br/><span style="color:#333;">${locationName || 'ESCOM'}</span></p>
            </div>

            ${reason ? `
            <div class="reason-box ${esDenegado ? 'denied' : ''}">
              <p style="margin:0;"><strong>${esDenegado ? 'Motivo de denegación:' : 'Observación:'}</strong></p>
              <p style="margin:4px 0 0 0;">${reason}</p>
            </div>
            ` : ''}

            <div style="text-align: center; margin: 24px 0;">
              <span class="btn ${statusClass}">${statusText}</span>
            </div>

            <hr class="divider" />

            <p style="color:#666;font-size:12px;line-height:1.5;margin:0;">
              ${esDenegado 
                ? 'Si no reconoces este intento o consideras que es un error, comunícate inmediatamente con el personal de control de acceso.' 
                : 'Si no reconoces este registro, comunícate inmediatamente con el personal de control de acceso.'
              }
            </p>
          </div>

          <div class="footer">
            <p><strong>© ${new Date().getFullYear()} AccESCOM · IPN · ESCOM</strong></p>
            <p>Este es un correo automático, por favor no responder.</p>
          </div>
        </div>
      </body>
    </html>
  `;
}

/** Helper de envío - Restablecimiento de contraseña */
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

/**
 * Helper de envío - Notificación de acceso (entrada/salida con QR)
 * @param {Object} params
 * @param {string} params.to - Email del usuario
 * @param {string} params.name - Nombre del usuario
 * @param {string} params.type - 'ENTRY' | 'EXIT'
 * @param {Date} [params.date] - Fecha del registro (default: now)
 * @param {string} [params.locationName] - Nombre del lugar (default: 'ESCOM')
 * @param {string} [params.reason] - Motivo de denegado o contexto (opcional)
 */
async function sendAccessNotificationEmail({
  to,
  name,
  type,          // 'ENTRY' | 'EXIT'
  date,
  locationName,
  reason          // opcional: motivo de denegado o contexto
}) {
  if (!to) return;
  
  const safeName = name || 'usuario';
  const when = date instanceof Date ? date : new Date();
  const lugar = locationName || 'ESCOM';
  const isEntry = type === 'ENTRY';
  const accion = isEntry ? 'entrada' : 'salida';
  const accionCapital = isEntry ? 'Entrada' : 'Salida';
  const emoji = isEntry ? '🟢' : '🔴';

  const fechaTexto = when.toLocaleString('es-MX', {
    timeZone: 'America/Mexico_City',
    dateStyle: 'full',
    timeStyle: 'short'
  });

  // Determinar el estado basado en el reason
  const esDenegado = !!reason && /deneg|expir|revoc|no activo|ya fue utilizado|inválid/i.test(reason);
  const esAdvertencia = !!reason && !esDenegado && /ya está dentro|ya esta dentro|se encuentra dentro|se encuentra fuera|ya está fuera|ya esta fuera|aún no ha entrado|aun no ha entrado|visita completada/i.test(reason);
  
  let statusClass = '';
  let statusText = 'Acceso permitido';
  let status = 'ALLOWED';
  
  if (esDenegado) {
    statusClass = 'denied';
    statusText = isEntry ? 'Acceso denegado' : 'Salida denegada';
    status = 'DENIED';
  } else if (esAdvertencia) {
    statusClass = 'warning';
    statusText = 'Advertencia';
    status = 'WARNING';
  } else {
    // Acceso permitido (sin reason)
    statusText = isEntry ? 'Acceso permitido' : 'Salida permitida';
  }

  const subject = `AccESCOM - ${esDenegado ? 'Intento' : 'Registro'} de ${accion}${esDenegado ? ' (denegado)' : ''}`;
  const preheader = `${esDenegado ? 'Intento' : 'Registro'} de ${accion} en ${lugar}`;

  const html = `
    <!DOCTYPE html>
    <html lang="es">
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>${subject}</title>
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
            max-width: 600px;
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
          }
          .content {
            padding: 24px;
            background-color: #fff;
          }
          .content h3 {
            margin: 0 0 8px 0;
            font-size: 20px;
            color: #111;
          }
          .content p {
            margin: 0 0 12px 0;
            line-height: 1.5;
          }
          .info-box {
            background-color: #f9f9f9;
            border-radius: 8px;
            padding: 16px;
            margin: 16px 0;
          }
          .info-box p {
            margin: 8px 0;
          }
          .info-box strong {
            color: #800040;
          }
          .reason-box {
            background-color: #fff3cd;
            border-left: 4px solid #ffc107;
            padding: 12px 16px;
            margin: 16px 0;
            border-radius: 4px;
          }
          .reason-box.denied {
            background-color: #f8d7da;
            border-left-color: #dc3545;
          }
          .btn {
            display: inline-block;
            padding: 12px 24px;
            background-color: #28a745;
            color: white !important;
            text-decoration: none;
            border-radius: 8px;
            font-weight: bold;
            margin: 16px 0;
          }
          .btn.denied {
            background-color: #dc3545;
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
            background-color: #f1f1f3;
            padding: 16px 24px;
            color: #666;
            font-size: 12px;
            text-align: center;
          }
          .footer p {
            margin: 8px 0;
          }
        </style>
      </head>
      <body>
        <span class="preheader">${preheader}</span>
        
        <div class="container">
          <div class="header">
            ${emoji} AccESCOM
          </div>
          
          <div class="content">
            <h3>Hola, ${safeName}</h3>
            <p>
              ${esDenegado ? 'Se registró un intento de' : 'Registramos tu'} 
              <strong>${accion}</strong> en <strong>${lugar}</strong>.
            </p>

            <div class="info-box">
              <p><strong>Tipo de registro:</strong><br/><span style="color:#333;">${accionCapital}</span></p>
              <p><strong>Fecha y hora:</strong><br/><span style="color:#333;">${fechaTexto}</span></p>
              <p><strong>Ubicación:</strong><br/><span style="color:#333;">${lugar}</span></p>
            </div>

            ${reason ? `
            <div class="reason-box ${esDenegado ? 'denied' : ''}">
              <p style="margin:0;"><strong>${esDenegado ? 'Motivo de denegación:' : 'Observación:'}</strong></p>
              <p style="margin:4px 0 0 0;">${reason}</p>
            </div>
            ` : ''}

            <div style="text-align: center; margin: 24px 0;">
              <span class="btn ${statusClass}">${statusText}</span>
            </div>

            <hr class="divider" />

            <p style="color:#666;font-size:12px;line-height:1.5;margin:0;">
              ${esDenegado 
                ? 'Si no reconoces este intento o consideras que es un error, comunícate inmediatamente con el personal de control de acceso.' 
                : 'Si no reconoces este registro, comunícate inmediatamente con el personal de control de acceso.'
              }
            </p>
          </div>

          <div class="footer">
            <p><strong>© ${new Date().getFullYear()} AccESCOM · IPN · ESCOM</strong></p>
            <p>Este es un correo automático, por favor no responder.</p>
          </div>
        </div>
      </body>
    </html>
  `;

  const text = [
    `Hola ${safeName},`,
    `${esDenegado ? 'Intento de' : 'Registro de'} ${accion} en ${lugar}.`,
    `Tipo de registro: ${accionCapital}`,
    `Fecha y hora: ${fechaTexto}`,
    `Ubicación: ${lugar}`,
    reason ? `${esDenegado ? 'Motivo' : 'Observación'}: ${reason}` : '',
    '',
    esDenegado
      ? 'Si no reconoces este intento, contacta al personal de control de acceso.'
      : 'Si no reconoces este registro, repórtalo al personal de control de acceso.',
    '',
    '— Sistema AccESCOM'
  ].filter(Boolean).join('\n');

  return transporter.sendMail({
    from: process.env.SMTP_FROM || '"AccESCOM" <no-reply@accescom.mx>',
    to,
    subject,
    html,
    text,
  });
}

module.exports = { 
  transporter, 
  sendPasswordResetEmail,
  sendAccessNotificationEmail 
};
