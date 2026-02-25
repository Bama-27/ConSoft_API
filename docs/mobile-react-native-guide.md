## ConSoft – Guía completa de integración móvil (React Native)

Esta guía explica desde cero cómo conectar una app móvil (React Native) a este backend: autenticación con cookies httpOnly, catálogo público, cotizaciones (carrito y rápida), chat en tiempo real (Socket.IO), recuperación/cambio de contraseña y permisos.

---

### 1) Requisitos de entorno
- Backend corriendo con:
  - `MONGO_URI` apuntando a tu base (Atlas recomendado).
  - SMTP configurado si quieres correos (opcional para dev): `MAIL_SMTP_HOST`, `MAIL_SMTP_USER`, `MAIL_SMTP_PASS`, `MAIL_FROM`, opcional `MAIL_SMTP_PORT=587`, `ADMIN_NOTIFY_EMAIL`.
  - CORS: variable `FRONTEND_ORIGINS` debe incluir la(s) URL(s) del cliente (`http://localhost:3000` o dominio).
- React Native (Expo o bare) y librerías recomendadas:
  - Fetch o Axios (con `withCredentials` o manejo de cookies).
  - `socket.io-client` para chat.
  - Manejo de cookies (si tu runtime no las gestiona automáticamente), por ejemplo `react-native-cookies` o usar WebView si prefieres.

---

### 2) Base URL y cookies httpOnly
- El backend autentica vía cookie httpOnly `token`. No se devuelve token en el body.
- En React Native debes enviar/recibir la cookie en cada request:
  - Fetch:
    ```ts
    await fetch(`${API}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ email, password }),
    });
    const me = await fetch(`${API}/api/auth/me`, { credentials: 'include' });
    ```
  - Axios:
    ```ts
    const api = axios.create({ baseURL: API, withCredentials: true });
    await api.post('/api/auth/login', { email, password });
    const me = await api.get('/api/auth/me');
    ```
- En producción usa HTTPS y asegúrate de que la cookie se setea con `SameSite=None; Secure` (el backend ya lo hace según entorno).

---

### 3) Pantallas sugeridas (UI móvil)
- Auth
  - Login (email/password)
  - Forgot Password (envía email)
  - Reset Password (abre link con token → pantalla para nuevo password)
  - Change Password (desde perfil, autenticado)
- Catálogo público
  - Categorías (listado) → Productos por categoría (opcional)
  - Productos (listado y detalle)
  - Servicios (listado y detalle)
- Cotizaciones
  - Quick quotation (desde Producto detalle)
  - Carrito de cotización (crear/obtener)
    - Agregar/editar/eliminar items
    - Enviar (submit)
  - Mis cotizaciones (lista y detalle)
  - Chat por cotización (tiempo real)
- Perfil
  - Ver/editar datos básicos (no contraseña; esa va por Change Password)

---

### 4) Endpoints (qué enviar y qué esperar)

Autenticación:
- POST `/api/auth/login`
  - Body: `{ email, password }`
  - Respuesta: `200 { message }` y set-cookie `token` (httpOnly).
- GET `/api/auth/me` (autenticado)
  - Respuesta: `200` con info básica del usuario (id, email, role).
- POST `/api/auth/logout` (opcional en móvil; basta descartar cookie si no compartes store)
- POST `/api/auth/forgot-password` (público)
  - Body: `{ email }`
  - Respuesta: `200 { ok: true }`. Llega correo con link: `/reset-password?token=...`.
- POST `/api/auth/reset-password` (público)
  - Body: `{ token, newPassword }` (complejidad: mayúscula, número, especial).
- POST `/api/auth/change-password` (autenticado)
  - Body: `{ currentPassword, newPassword }` (misma complejidad).

Usuarios:
- POST `/api/users` (registro público) – si tu app lo requiere
  - Body: `{ name, email, password }` (misma complejidad).

Catálogo público (no requiere login):
- GET `/api/categories`, `/api/categories/:id`
- GET `/api/products`, `/api/products/:id`
- GET `/api/services`, `/api/services/:id`

Cotizaciones (requiere login):
- POST `/api/quotations/quick`
  - Body: `{ productId, quantity?, color?, size?, notes? }`
  - Crea cotización con estado `solicitada`. Respuesta: `201 { ok, quotation }`.
- POST `/api/quotations/cart`
  - Crea/obtiene carrito activo (estado `carrito`). Respuesta: `{ ok, cart }`.
- POST `/api/quotations/:id/items`
  - Body: `{ productId, quantity?, color?, size?, notes? }`
- PUT `/api/quotations/:id/items/:itemId`
  - Body parcial con campos a modificar (valida `quantity > 0` si se envía).
- DELETE `/api/quotations/:id/items/:itemId`
- POST `/api/quotations/:id/submit`
  - Cambia status del carrito a `solicitada`.
- GET `/api/quotations/mine`
  - Lista cotizaciones del usuario autenticado.
- GET `/api/quotations/:id`
  - Detalle de cotización (dueño o admin).

Admin (panel interno; sólo si tu app móvil lo necesita):
- POST `/api/quotations/:id/quote` (permiso `quotations.update`)
  - Body: `{ totalEstimate, adminNotes? }`
- GET `/api/quotations` (permiso `quotations.view`)

Chat (REST historial):
- GET `/api/quotations/:quotationId/messages` (dueño o admin)

---

### 5) Realtime (Socket.IO) – chat por cotización
- Conexión (mismo host que el backend):
  ```ts
  import { io } from 'socket.io-client';
  const socket = io(API, {
    transports: ['websocket'],
    withCredentials: true, // para cookies httpOnly si RN lo soporta
  });
  ```
- Eventos:
  - Unirse a una cotización:
    ```ts
    socket.emit('quotation:join', { quotationId });
    ```
  - Enviar mensaje:
    ```ts
    socket.emit('chat:message', { quotationId, message });
    ```
  - Recibir mensaje:
    ```ts
    socket.on('chat:message', (msg) => {
      // { _id, quotation, sender, message, sentAt }
    });
    ```
- Notificaciones por correo (backend):
  - Si el equipo envía un mensaje y el cliente está offline, el backend envía email “Tienes un nuevo mensaje” con link a la cotización.

---

### 6) Helpers recomendados (código de ejemplo)

Cliente Fetch (envía cookies):
```ts
export async function apiFetch<T = unknown>(baseUrl: string, path: string, init: RequestInit = {}): Promise<T> {
  const url = path.startsWith('/') ? `${baseUrl}${path}` : `${baseUrl}/api/${path}`;
  const res = await fetch(url, {
    ...init,
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      ...(init.headers || {}),
    },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const message = (data && (data.message || data.error)) || 'Request failed';
    throw new Error(message);
  }
  return data as T;
}
```

API auth:
```ts
export const AuthApi = (API: string) => ({
  login: (email: string, password: string) =>
    apiFetch(API, '/api/auth/login', { method: 'POST', body: JSON.stringify({ email, password }) }),
  me:   () => apiFetch(API, '/api/auth/me'),
  logout: () => apiFetch(API, '/api/auth/logout', { method: 'POST' }),
  changePassword: (currentPassword: string, newPassword: string) =>
    apiFetch(API, '/api/auth/change-password', { method: 'POST', body: JSON.stringify({ currentPassword, newPassword }) }),
  forgotPassword: (email: string) =>
    apiFetch(API, '/api/auth/forgot-password', { method: 'POST', body: JSON.stringify({ email }) }),
  resetPassword: (token: string, newPassword: string) =>
    apiFetch(API, '/api/auth/reset-password', { method: 'POST', body: JSON.stringify({ token, newPassword }) }),
});
```

Quotations API:
```ts
export const QuotationsApi = (API: string) => ({
  quick: (productId: string, opts: any = {}) =>
    apiFetch(API, '/api/quotations/quick', { method: 'POST', body: JSON.stringify({ productId, ...opts }) }),
  getCart: () => apiFetch(API, '/api/quotations/cart', { method: 'POST' }),
  addItem: (id: string, payload: any) =>
    apiFetch(API, `/api/quotations/${id}/items`, { method: 'POST', body: JSON.stringify(payload) }),
  updateItem: (id: string, itemId: string, payload: any) =>
    apiFetch(API, `/api/quotations/${id}/items/${itemId}`, { method: 'PUT', body: JSON.stringify(payload) }),
  removeItem: (id: string, itemId: string) =>
    apiFetch(API, `/api/quotations/${id}/items/${itemId}`, { method: 'DELETE' }),
  submit: (id: string) => apiFetch(API, `/api/quotations/${id}/submit`, { method: 'POST' }),
  mine: () => apiFetch(API, '/api/quotations/mine'),
  get: (id: string) => apiFetch(API, `/api/quotations/${id}`),
});
```

Socket helper:
```ts
import { io, Socket } from 'socket.io-client';
export function createSocket(API: string): Socket {
  return io(API, { withCredentials: true, transports: ['websocket'] });
}
```

---

### 7) Flujo sugerido de navegación
1. Splash → Chequea `/api/auth/me`. Si 200 → Home, si 401 → Login.
2. Login → POST `/api/auth/login` → set-cookie → `/api/auth/me` → Home.
3. Home → Catálogo (GET productos/categorías/servicios).
4. Producto → Quick quotation (POST `/api/quotations/quick`) o agregar al carrito.
5. Carrito → Items CRUD → Submit.
6. Mis cotizaciones → Detalle → Chat (join socket y mensajes).
7. Perfil → Change Password.
8. Forgot/Reset → formulario → correo con link → nueva contraseña.

---

### 8) Errores y seguridad
- No se expone el token en respuestas; se usa cookie httpOnly.
- Respuestas de error: `{ message | error }` + status estándar.
- Validación de contraseña: 1 mayúscula, 1 número y 1 caracter especial.
- Permisos (admin): ver `docs/permissions.md` (matriz de 25 permisos).

---

### 9) Checklist de conexión (RN)
- Definir `API` (base URL del backend).
- En cada fetch/axios: incluir cookies (`credentials: 'include'` o `withCredentials: true`).
- Probar: `/api/products` (público), login y `/api/auth/me` (autenticado).
- Conectar socket después de login (misma base URL); join a `quotation:join` y enviar `chat:message`.
- Validar recuperación/cambio de contraseña si tu flujo lo requiere.

---

### 10) Notas de despliegue
- Producción debe usar HTTPS para cookies Secure.
- Ajustar `FRONTEND_ORIGINS` en el backend para incluir la URL del móvil (si RN WebView) o del front web.
- SMTP con dominio verificado recomendado (SendGrid/Mailgun/SES o Gmail con App Password).


