"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.extractTextFromImage = extractTextFromImage;
exports.parseAmountFromText = parseAmountFromText;
const tesseract_js_1 = __importDefault(require("tesseract.js"));
async function extractTextFromImage(imageUrl) {
    const { data } = await tesseract_js_1.default.recognize(imageUrl, 'eng', {
        logger: () => undefined,
    });
    return data.text || '';
}
function parseAmountFromText(text) {
    if (!text)
        return null;
    // Normalizar separadores y quitar espacios no necesarios
    const normalized = text
        .replace(/\s+/g, ' ')
        .replace(/[Oo]/g, '0'); // confusiones típicas
    // Buscar patrones de moneda comunes: $1.234,56 | $1,234.56 | 1234.56 | 1.234.567
    const candidates = normalized.match(/(\$?\s?\d{1,3}([.,]\d{3})*([.,]\d{2})?)/g);
    if (!candidates)
        return null;
    let best = null;
    for (const raw of candidates) {
        const cleaned = raw.replace(/\s|\$/g, '');
        // Intentar formato tipo "1.234,56" (latam/eu)
        let num = Number(cleaned
            .replace(/\./g, '')
            .replace(',', '.'));
        if (!Number.isFinite(num)) {
            // Intentar formato tipo "1,234.56" (en-US)
            num = Number(cleaned.replace(/,/g, ''));
        }
        if (Number.isFinite(num) && num > 0) {
            if (best == null || num > best)
                best = num;
        }
    }
    return best;
}
