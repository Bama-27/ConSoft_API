import Tesseract from 'tesseract.js';

export async function extractTextFromImage(imageSource: string): Promise<string> {
	let input: Buffer | string = imageSource;

	// Si es URL remota, descargar primero
	if (imageSource.startsWith('http')) {
		const fetchFn = (globalThis as any).fetch as undefined | ((...args: any[]) => Promise<any>);
		if (!fetchFn) {
			throw new Error('fetch is not available in this runtime');
		}
		const res = await fetchFn(imageSource);
		const arrayBuffer = await res.arrayBuffer();
		input = Buffer.from(arrayBuffer);
	}

	const { data } = await Tesseract.recognize(input, 'spa+eng', { // 👈 spa+eng para español
		logger: () => undefined,
	});
	return data.text || '';
}

export function parseAmountFromText(text: string): number | null {
	if (!text) return null;

	const normalized = text
		.replace(/\s+/g, ' ')
		.replace(/[Oo]/g, '0')
		.replace(/[lI]/g, '1'); // otras confusiones comunes de OCR

	// Captura: $1.250.000 | $50.000 | 1,250,000 | 1250000 | $1.250,50
	const candidates = normalized.match(
		/\$?\s?\d{1,3}(?:[.,]\d{3})*(?:[.,]\d{1,2})?|\d{4,}/g
	);
	if (!candidates) return null;

	let best: number | null = null;

	for (const raw of candidates) {
		const cleaned = raw.replace(/\s|\$/g, '');

		let num: number;

		const dotCount = (cleaned.match(/\./g) || []).length;
		const commaCount = (cleaned.match(/,/g) || []).length;

		if (dotCount > 1) {
			// Formato LATAM: 1.250.000 o 1.250.000,50
			num = Number(cleaned.replace(/\./g, '').replace(',', '.'));
		} else if (commaCount > 1) {
			// Formato US: 1,250,000
			num = Number(cleaned.replace(/,/g, ''));
		} else if (dotCount === 1 && commaCount === 1) {
			// Ambos: decidir por posición
			const dotIdx = cleaned.indexOf('.');
			const commaIdx = cleaned.indexOf(',');
			if (dotIdx < commaIdx) {
				// 1.250,50 → LATAM
				num = Number(cleaned.replace('.', '').replace(',', '.'));
			} else {
				// 1,250.50 → US
				num = Number(cleaned.replace(',', ''));
			}
		} else if (commaCount === 1) {
			// Puede ser 1,50 (decimal) o 1,250 (miles LATAM)
			const afterComma = cleaned.split(',')[1];
			num = afterComma.length === 3
				? Number(cleaned.replace(',', ''))   // miles
				: Number(cleaned.replace(',', '.'));  // decimal
		} else {
			num = Number(cleaned.replace(',', '.'));
		}

		if (Number.isFinite(num) && num > 0) {
			if (best == null || num > best) best = num;
		}
	}

	return best;
}

export function parseReferenceFromText(text: string): string | null {
	if (!text) return null;

	const normalized = text.replace(/\s+/g, ' ');

	// Patrones comunes en Colombia (Bancolombia, Nequi, Daviplata)
	const patterns = [
		/Comprobante No\.?\s*(\d+)/i,
		/Referencia\s*([A-Z0-9]{4,})/i,
		/Ref\.\s*([A-Z0-9]{4,})/i,
		/Código\s*(?:de)?\s*(?:aprobación|referencia)?\s*([A-Z0-9]{4,})/i,
		/CUS\s*(\d+)/i, // Daviplata CUS
	];

	for (const pattern of patterns) {
		const match = normalized.match(pattern);
		if (match && match[1]) return match[1];
	}

	return null;
}



