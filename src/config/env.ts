import dotenv from 'dotenv';

dotenv.config();

export const env = {
	nodeEnv: process.env.NODE_ENV ?? 'development',
	port: Number(process.env.PORT ?? 3000),
	mongoUri: process.env.MONGO_URI ?? 'mongodb://localhost:27017/consoft',
	jwt_secret: process.env.JWT_SECRET ?? 'alksdjklajlskd',
	googleClientId: process.env.GOOGLE_CLIENT_ID,
	defaultUserRoleId: process.env.DEFAULT_USER_ROLE_ID ?? '69b9d0f65523e48620ded81e',
	adminRoleId: process.env.ADMIN_ROLE_ID,
	frontendOrigins: (process.env.FRONTEND_ORIGINS ?? 'http://localhost:3000,http://192.168.1.8:3000,exp://192.168.1.8:8081')
		.split(',')
		.map((s) => s.trim()),
	// Rate limit
	rateLimitWindowMs: process.env.RATE_LIMIT_WINDOW_MS ? Number(process.env.RATE_LIMIT_WINDOW_MS) : 15 * 60 * 1000,
	rateLimitMax: process.env.RATE_LIMIT_MAX ? Number(process.env.RATE_LIMIT_MAX) : 1000,
	rateLimitEnabled: process.env.RATE_LIMIT_ENABLED ? String(process.env.RATE_LIMIT_ENABLED).toLowerCase() !== 'false' : true,
	rateLimitSkipPaths: (process.env.RATE_LIMIT_SKIP_PATHS ?? '/health,/api/quotations,/api/chat').split(',').map((s) => s.trim()).filter(Boolean),
	// Email (SMTP) – opcional; si no está configurado, sendEmail hará no-op
	mailSmtpHost: process.env.MAIL_SMTP_HOST,
	mailSmtpPort: process.env.MAIL_SMTP_PORT ? Number(process.env.MAIL_SMTP_PORT) : undefined,
	mailSmtpUser: process.env.MAIL_SMTP_USER,
	mailSmtpPass: process.env.MAIL_SMTP_PASS,
	mailFrom: process.env.MAIL_FROM ?? 'no-reply@consoft.local',
	// Notificaciones
	adminNotifyEmail: process.env.ADMIN_NOTIFY_EMAIL,
};
