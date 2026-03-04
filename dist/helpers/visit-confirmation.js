"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.buildVisitConfirmationEmail = buildVisitConfirmationEmail;
const promises_1 = require("fs/promises");
const path_1 = __importDefault(require("path"));
async function buildVisitConfirmationEmail(data) {
    const filePath = path_1.default.join(process.cwd(), 'src', 'templates', 'visit-confirmation.html');
    let html = await (0, promises_1.readFile)(filePath, 'utf-8');
    const servicesFormatted = data.services.length ? data.services.join(', ') : 'No especificados';
    const descriptionBlock = data.description
        ? `
      <p><strong>Descripción:</strong></p>
      <p>${data.description}</p>
    `
        : '';
    html = html
        .replace('{{USER_NAME}}', data.userName)
        .replace('{{VISIT_DATE}}', data.visitDate)
        .replace('{{VISIT_TIME}}', data.visitTime || 'No especificada')
        .replace('{{ADDRESS}}', data.address)
        .replace('{{SERVICES}}', servicesFormatted)
        .replace('{{STATUS}}', data.status)
        .replace('{{DESCRIPTION_BLOCK}}', descriptionBlock)
        .replace('{{YEAR}}', String(new Date().getFullYear()));
    return html;
}
