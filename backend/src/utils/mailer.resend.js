// backend/src/utils/mailer.resend.js
const { Resend } = require('resend');

const resend = new Resend(process.env.RESEND_API_KEY);

/**
 * Enviar correo usando Resend
 * @param {Object} params
 * @param {string} params.to
 * @param {string} params.subject
 * @param {string} params.html
 * @param {string} [params.text]
 */
async function sendEmail({ to, subject, html, text }) {
  try {
    const from =
      process.env.EMAIL_FROM ||
      process.env.SMTP_FROM || // reutilizamos si ya lo tenías así
      'AccESCOM <no-reply@accescom.app>';

    const response = await resend.emails.send({
      from,
      to,
      subject,
      html,
      text,
    });

    console.log('📨 Resend envío OK:', response?.id || response);
    return true;
  } catch (err) {
    console.error('❌ Error enviando correo con Resend:', err);
    return false;
  }
}

module.exports = { sendEmail };
