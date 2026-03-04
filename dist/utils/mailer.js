"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.sendEmail = sendEmail;
const env_1 = require("../config/env");
let nodemailer = null;
try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    nodemailer = require('nodemailer');
}
catch (_e) {
    nodemailer = null;
}
function isConfigured() {
    // Considerar configurado si hay host, user y pass; el puerto puede asumir por defecto 587
    return !!(env_1.env.mailSmtpHost && env_1.env.mailSmtpUser && env_1.env.mailSmtpPass && nodemailer);
}
async function sendEmail(options) {
    if (!isConfigured()) {
        // Fallback no-op en desarrollo cuando no hay SMTP o nodemailer
        // eslint-disable-next-line no-console
        console.log('[sendEmail noop]', options.subject, '→', options.to);
        return;
    }
    const port = env_1.env.mailSmtpPort ?? 587;
    const secure = port === 465;
    const transporter = nodemailer.createTransport({
        host: env_1.env.mailSmtpHost,
        port,
        secure,
        auth: {
            user: env_1.env.mailSmtpUser,
            pass: env_1.env.mailSmtpPass,
        },
    });
    try {
        await transporter.sendMail({
            from: env_1.env.mailFrom,
            to: options.to,
            subject: options.subject,
            text: options.text,
            html: options.html,
        });
    }
    catch (err) {
        // eslint-disable-next-line no-console
        console.error('[sendEmail error]', err?.message || err);
    }
}
