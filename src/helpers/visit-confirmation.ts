import { readFile } from 'fs/promises';
import path from 'path';

export async function buildVisitConfirmationEmail(data: {
	userName: string;
	visitDate: string;
	visitTime?: string;
	address: string;
	services: string[];
	description?: string;
	status: string;
}) {
	const filePath = path.join(process.cwd(), 'src', 'templates', 'visit-confirmation.html');

	let html = await readFile(filePath, 'utf-8');

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
