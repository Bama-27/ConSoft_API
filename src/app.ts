import express from 'express';
import api from './routes/api';
import cors from 'cors';
import cookieParser = require('cookie-parser');
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import { env } from './config/env';

export function createApp() {
	const app = express();
	app.set('trust proxy', 1);
	app.use(helmet());
	app.use(express.json());
    app.use(cors({
        origin: (origin, cb) => {
            if (!origin) return cb(null, true);
            if (env.frontendOrigins.includes(origin)) return cb(null, true);
            return cb(new Error('Not allowed by CORS'));
        },
        credentials: true
    }));
	app.use(cookieParser());
	if (env.rateLimitEnabled) {
		const limiter = rateLimit({
			windowMs: env.rateLimitWindowMs,
			max: env.rateLimitMax,
			standardHeaders: true,
			legacyHeaders: false,
			skip: (req) => env.rateLimitSkipPaths.some((prefix) => req.path.startsWith(prefix)),
			message: { error: 'Too many requests, please try again later.' },
		});
		app.use(limiter);
	}

	app.get('/health', (_req, res) => {
		res.json({ ok: true });
	});

	// Minimal reset-password page for environments without a frontend route
	app.get('/reset-password', (_req, res) => {
		res.setHeader('Content-Type', 'text/html; charset=utf-8');
		res.send(`<!doctype html>
<html lang="es">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Restablecer contraseña</title>
  <style>
    body { font-family: system-ui, -apple-system, Segoe UI, Roboto, sans-serif; padding: 24px; max-width: 520px; margin: 0 auto; }
    h1 { font-size: 20px; margin-bottom: 12px; }
    label { display:block; margin: 12px 0 6px; }
    input { width:100%; padding:10px; border:1px solid #ccc; border-radius:6px; }
    button { margin-top: 16px; padding:10px 14px; border:0; background:#6b4b3e; color:#fff; border-radius:6px; cursor:pointer; }
    .msg { margin-top:14px; }
  </style>
  </head>
<body>
  <h1>Restablecer contraseña</h1>
  <p>Ingresa tu nueva contraseña para tu cuenta.</p>
  <form id="form">
    <label>Nueva contraseña</label>
    <input id="pwd" type="password" required minlength="8" />
    <button type="submit">Actualizar contraseña</button>
  </form>
  <div id="msg" class="msg"></div>
  <script>
    const $ = (id) => document.getElementById(id);
    const params = new URLSearchParams(location.search);
    const token = params.get('token');
    if (!token) {
      $('msg').textContent = 'Token inválido o faltante.';
      $('form').style.display = 'none';
    }
    $('form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const newPassword = $('pwd').value;
      $('msg').textContent = 'Procesando...';
      try {
        const res = await fetch('/api/auth/reset-password', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ token, newPassword })
        });
        const data = await res.json().catch(() => ({}));
        if (res.ok) {
          $('msg').textContent = 'Contraseña actualizada correctamente. Ya puedes cerrar esta pestaña.';
          $('form').style.display = 'none';
        } else {
          $('msg').textContent = data?.message || data?.error || 'Error al restablecer la contraseña.';
        }
      } catch (err) {
        $('msg').textContent = 'Error de red. Inténtalo más tarde.';
      }
    });
  </script>
</body>
</html>`);
	});

	app.use('/api', api);

	// Global error handler
	app.use((err: any, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
		console.error(err);
		const status = err.status || 500;
		res.status(status).json({ error: status === 500 ? 'Internal server error' : err.message });
	});

	return app;
}
