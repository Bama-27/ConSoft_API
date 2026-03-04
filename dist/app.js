"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.createApp = createApp;
const express_1 = __importDefault(require("express"));
const api_1 = __importDefault(require("./routes/api"));
const cors_1 = __importDefault(require("cors"));
const cookieParser = require("cookie-parser");
const helmet_1 = __importDefault(require("helmet"));
const express_rate_limit_1 = __importDefault(require("express-rate-limit"));
const env_1 = require("./config/env");
function createApp() {
    const app = (0, express_1.default)();
    app.set('trust proxy', 1);
    app.use((0, helmet_1.default)());
    app.use(express_1.default.json());
    app.use((0, cors_1.default)({
        origin: (origin, cb) => {
            if (!origin)
                return cb(null, true);
            if (env_1.env.frontendOrigins.includes(origin))
                return cb(null, true);
            return cb(new Error('Not allowed by CORS'));
        },
        credentials: true
    }));
    app.use(cookieParser());
    if (env_1.env.rateLimitEnabled) {
        const limiter = (0, express_rate_limit_1.default)({
            windowMs: env_1.env.rateLimitWindowMs,
            max: env_1.env.rateLimitMax,
            standardHeaders: true,
            legacyHeaders: false,
            skip: (req) => env_1.env.rateLimitSkipPaths.some((prefix) => req.path.startsWith(prefix)),
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
    app.use('/api', api_1.default);
    // Global error handler
    app.use((err, _req, res, _next) => {
        console.error(err);
        const status = err.status || 500;
        res.status(status).json({ error: status === 500 ? 'Internal server error' : err.message });
    });
    return app;
}
