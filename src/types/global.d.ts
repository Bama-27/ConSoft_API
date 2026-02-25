declare namespace NodeJS {
  interface ProcessEnv {
    NODE_ENV?: 'development' | 'test' | 'production';
    PORT?: string;
    MONGO_URI?: string;
    JWT_SECRET?: string;
    MAIL_SMTP_HOST?: string;
    MAIL_SMTP_PORT?: string;
    MAIL_SMTP_USER?: string;
    MAIL_SMTP_PASS?: string;
    MAIL_FROM?: string;
    FRONTEND_ORIGINS?: string;
    ADMIN_NOTIFY_EMAIL?: string;
  }
}

declare module 'multer';


