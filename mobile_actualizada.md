# Guía de Integración Móvil (React Native) — **ALINEADA 100% al Backend actual (ConSoft_API)**

Este documento refleja **exactamente** lo que hoy está implementado en el backend (rutas en `src/routes/api.ts`, auth en `AuthController`, sockets en `src/realtime/socket.ts`, pedidos/pagos/cotizaciones en sus controllers). Incluye lo que faltaba: **refresh token en BD + rotación**, payloads reales (especialmente **quotations/quick**), y flujo real de **Socket.IO**.

---

## 0) Base URL, prefijo y Health
- **API base**: `https://<HOST>/api`
- **Health** (fuera del prefijo API):
  - `GET /health` → `{ ok: true }`

---

## 1) CORS + Cookies (crítico para mobile)
El backend está configurado para:
- `cors({ credentials: true, origin: ... })`
- `cookie-parser`
- Cookies:
  - `secure: env.nodeEnv === 'production'`
  - `sameSite: production ? 'none' : 'lax'`

### React Native: enviar/recibir cookies
- **fetch**: `credentials: 'include'`
- **axios**: `withCredentials: true`

> En producción necesitas **HTTPS real** (por `Secure`) si esperas que se guarden cookies.

---

## 2) Autenticación (cookies HttpOnly) — IMPLEMENTACIÓN ACTUAL
### Cookies usadas
- **`token`**: Access token **JWT**, expira **30m**
- **`refreshToken`**: Token **random** (hex) guardado en **BD**, expira **30 días** (cookie) y se **rota**

### Reglas importantes
- El backend **NO** devuelve el token en el body.
- El backend **NO** hace refresh automático en middlewares.
- Cuando `token` expira, el cliente debe llamar explícitamente:
  - `POST /api/auth/refresh`

---

## 3) Endpoints de Auth (según backend)

### `POST /api/auth/login`
**Body**
```json
{ "email": "string", "password": "string" }
```
**Efecto**
- Set-Cookie `token` (30m)
- Set-Cookie `refreshToken` (30d)
- Guarda refresh token en BD (`RefreshTokenModel`)

**Resp 200**
```json
{ "message": "Login successful" }
```

---

### `POST /api/auth/register`
**Body**
```json
{ "name": "string", "email": "string", "password": "string" }
```
**Reglas password**
- 1 mayúscula
- 1 número
- 1 caracter especial

**Efecto**
- Igual que login: cookies + refresh en BD

**Resp 201**
```json
{ "ok": true, "message": "User registered successfully" }
```

---

### `POST /api/auth/google`
**Body**
```json
{ "idToken": "string" }
```
**Efecto**
- Si no existe usuario, lo crea (password temporal)
- Set cookies `token` + `refreshToken`
- Guarda refresh token en BD

**Resp 200**
```json
{ "message": "Login successful" }
```

---

### `POST /api/auth/refresh`  ✅ (NUEVO / CLAVE)
**Requiere**
- Cookie `refreshToken`

**Lógica real**
1) Busca en BD: `{ token: refreshTokenCookie, revoked: false }`
2) Si expira: lo revoca y responde error
3) Revoca el token viejo
4) Genera:
   - nuevo access JWT → cookie `token`
   - nuevo refresh random → cookie `refreshToken` + BD

**Resp 200**
```json
{ "ok": true }
```

**Errores**
- 401: `{ "message": "Refresh token required" }`
- 403: `{ "message": "Invalid or revoked refresh token" }`
- 403: `{ "message": "Refresh token expired" }`

---

### `POST /api/auth/logout`
**Efecto real**
- Revoca en BD el refresh token (si existe cookie)
- Limpia cookies `token` y `refreshToken`

**Resp**
```json
{ "message": "Logout successful" }
```

---

### `GET /api/auth/me` (protegido)
**Auth**: requiere cookie `token` (o Bearer, pero mobile hoy usa cookies)

**Resp 200**
Retorna `req.user` (payload del middleware).

---

### Password
- `POST /api/auth/forgot-password` (público)
- `POST /api/auth/reset-password` (público)
- `POST /api/auth/change-password` (protegido por `verifyToken`)

---

## 4) Middleware de Auth (cómo decide el backend)
### `verifyToken`
- Lee access token desde:
  - cookie `token` **o**
  - `Authorization: Bearer <token>`
- Si no hay token → **401**
- Si token inválido/expirado → **403**
- **No refresca** automáticamente.

### `optionalAuth`
- Si no hay cookie `token`, deja `req.user = undefined` y sigue.
- No refresca.

---

## 5) Recomendación RN: estrategia de reintento con refresh
Pseudoflujo (fetch):
1) Llamas endpoint protegido
2) Si da `401/403`:
   - `await fetch('/api/auth/refresh', { method:'POST', credentials:'include' })`
   - reintentas la request original

---

## 6) Perfil (Usuarios)
### Público
- `POST /api/users` (registro "simple" usado por tests / sign-up)
  - Ojo: este endpoint setea solo `token` (2h) y **no** refresh; el flujo recomendado es `/auth/register`.

### Protegido (requiere `verifyToken`)
- `GET /api/users/me` → `{ ok: true, user }`
- `PUT /api/users/me` (multipart)
  - Archivo: `profile_picture`
  - Campos permitidos: `name`, `phone`, `address`, `email` (valida único)
  - Bloquea: `password`, `role`

---

## 7) Catálogo público
- `GET /api/categories`
- `GET /api/categories/:id`
- `GET /api/products`
- `GET /api/products/:id`
- `GET /api/services`
- `GET /api/services/:id`

---

## 8) Cotizaciones (Quotations) — payloads reales del backend

> Nota: tu doc anterior tenía `quotations/quick` con `{ productId }`, pero el backend **NO** funciona así hoy.

### Protegido (requiere `verifyToken`)
- `GET /api/quotations/mine`

### Carrito
- `POST /api/quotations/cart`
  - Crea o retorna el carrito del usuario con `status: 'Carrito'`

### Quick create (real)
- `POST /api/quotations/quick`
**Body real**
```json
{
  "items": [],
  "adminNotes": "string opcional"
}
```
- Si `items` no es array o está vacío → 400

### Manejo de items
- `POST /api/quotations/:id/items`
  - Body real soporta:
    - `isCustom` (boolean)
    - si `isCustom=true`: `customDetails` con `name`, `description`, etc.
    - si `isCustom=false`: `productId` válido
    - opcional: `quantity`, `color`, `size`
- `PUT /api/quotations/:id/items/:itemId`
- `DELETE /api/quotations/:id/items/:itemId`
- `POST /api/quotations/:id/submit`

### Admin / decisión
- `POST /api/quotations/:id/quote` (requiere `verifyRole('quotations','update')`)
- `POST /api/quotations/:id/decision`

### Listados admin
- `GET /api/quotations` (requiere `verifyRole('quotations','view')`)
- `GET /api/quotations/:id` (controlado por controller)

### Chat historial (cotización)
- `GET /api/quotations/:quotationId/messages`

---

## 9) Pedidos (Orders)
### Público (reviews)
- `GET /api/orders/reviews`
- `GET /api/orders/:id/reviews`

### Protegido
- `GET /api/orders/mine`
- `POST /api/orders/mine` (multipart, `product_images[]` hasta 10)
  - Body **requiere** `items` (array no vacío)
  - Normaliza items:
    - `tipo`: `producto` o `servicio`
    - `id_producto` / `id_servicio`
    - `cantidad`: si viene inválida → 1
    - `valor`: solo si es number
  - Enriquecimiento:
    - `imageUrl` se completa desde catálogo (`ProductModel/ServiceModel`)

Adjuntos:
- `POST /api/orders/:id/attachments` (multipart `product_images[]`, opcional `item_id`)
  - Permite dueño o admin con permiso `orders.update`

Crear review:
- `POST /api/orders/:id/reviews` (rating 1..5, 1 review por user)

---

## 10) Pagos (Payments) + OCR (real)
CRUD:
- `mountCrud('payments', PaymentController)` (rutas estándar CRUD con permisos)

### OCR preview (NO crea pago)
- `POST /api/orders/:id/payments/ocr` (multipart `payment_image`)
**Resp 200 (estructura real)**
```json
{
  "ok": true,
  "orderId": "...",
  "current": { "total": 0, "paid": 0, "restante": 0 },
  "detectedAmount": 150,
  "projected": { "amountToPay": 150, "restanteAfter": 0 },
  "receipt": { "receiptUrl": "...", "ocrText": "..." }
}
```

### OCR submit (SÍ crea pago pendiente)
- `POST /api/orders/:id/payments/ocr/submit`
**Body**
```json
{ "amount": 150, "paidAt": "ISO opcional", "method": "string", "receiptUrl": "string", "ocrText": "string" }
```
**Efecto**
- Agrega pago a la orden con `status: 'pendiente'`
- Devuelve `{ ok: true, payment }`

---

## 11) Visitas (Visits)
- `GET /api/visits/available-slots` (público)
- `POST /api/visits/mine` aparece como público con `optionalAuth`, pero **si el controller requiere usuario**, necesitas sesión real.
- Protegidas:
  - `GET /api/visits/mine`

---

## 12) Socket.IO (real) — `src/realtime/socket.ts`
### Cómo autentica el backend socket
El backend lee **access token** (JWT) desde:
- `socket.handshake.auth.token`
- o `socket.handshake.query.token`
- o header cookie `token=<jwt>`

Luego hace `jwt.verify(token, JWT_SECRET)`.

### Eventos implementados
- **Cotizaciones**
  - `quotation:join` → `{ quotationId }` (join room `q:<quotationId>`)
  - `chat:message` → `{ quotationId, message }` (broadcast a room)
  - Email al dueño si está offline y el mensaje viene de admin (según permisos)
- **DM**
  - `dm:join` → `{ userId }` (room `dm:a:b`)
  - `dm:message` → `{ toUserId, message }`

### Implicación RN
- Si no puedes leer cookie httpOnly `token`, no podrás enviarlo por `auth.token`.
- Pero Socket.IO puede funcionar si el transporte incluye cookies (depende del stack y dominio).

---

## 13) Lista completa de endpoints (según `src/routes/api.ts`)
### Públicos
- `POST /auth/login`
- `POST /auth/logout`
- `POST /auth/refresh`
- `GET /auth/me` (usa `verifyToken`)
- `POST /auth/google`
- `POST /auth/profile` (usa `verifyToken`)
- `POST /auth/forgot-password`
- `POST /auth/reset-password`
- `POST /auth/register`
- `POST /users`
- `GET /categories`, `GET /categories/:id`
- `GET /products`, `GET /products/:id`
- `GET /services`, `GET /services/:id`
- `GET /visits/available-slots`
- `POST /visits/mine` (optionalAuth)
- `GET /orders/reviews`
- `GET /orders/:id/reviews`

### Protegidos (`router.use(verifyToken)`)
- `POST /auth/change-password`
- `GET /users/me`
- `PUT /users/me` (multipart `profile_picture`)
- `GET /chat/dm/:userId`
- `GET /visits/mine`
- `POST /products` (multipart `image`)
- `POST /services` (multipart `image`)
- `PUT /users/:id` (multipart `profile_picture`)
- `POST /orders/:id/reviews`
- `POST /orders/:id/attachments` (multipart `product_images[]`)
- `GET /dashboard` (con `verifyRole`)
- CRUD: `/roles`, `/users`, `/categories`, `/products`, `/services`, `/visits`, `/orders`, `/payments`, `/sales`, `/permissions` (con `verifyRole`)
- `GET /orders/mine`
- `POST /orders/mine` (multipart `product_images[]`)
- `POST /orders/:id/payments/ocr` (multipart `payment_image`)
- `POST /orders/:id/payments/ocr/submit`
- Quotations:
  - `GET /quotations/mine`
  - `POST /quotations/cart/custom` (multipart `referenceImage`)
  - `POST /quotations/cart`
  - `POST /quotations/quick`
  - `POST /quotations/:id/items`
  - `PUT /quotations/:id/items/:itemId`
  - `DELETE /quotations/:id/items/:itemId`
  - `POST /quotations/:id/submit`
  - `POST /quotations/:id/quote` (verifyRole)
  - `POST /quotations/:id/decision`
  - `GET /quotations` (verifyRole)
  - `GET /quotations/:id`
  - `GET /quotations/:quotationId/messages`
  - `POST /quotations/admin/create` (verifyRole)

## 14) Endpoints faltantes en mobile_actualizada.md (añadir)

### Dashboard (solo admin)
- `GET /api/dashboard`
  - **Query params**: `from`, `to`, `period` (month|quarter|semester|year), `compare` (boolean), `limit` (1-50)
  - **Resp**: `{ ok: true, range, summary, series, topItems }`
  - **Series**: `monthly`, `quarterly`, `semiannual`
  - **Top items**: `products`, `services`

### Visitas - endpoints adicionales
- `POST /api/visits/mine` (optionalAuth) - ya existe
- `GET /api/visits/mine` (protegido) - ya existe
- **Payload para crear visita**:
  ```json
  {
    "visitDate": "2024-12-25",
    "visitTime": "14:00",
    "address": "Dirección completa",
    "description": "Descripción opcional",
    "userName": "Nombre (solo si guest)",
    "userEmail": "email@ejemplo.com (solo si guest)",
    "userPhone": "+1234567890 (solo si guest)"
  }
  ```
- **Reglas**: Bloquea 3 horas antes y después de cada visita existente

### Chat - endpoints adicionales
- `GET /api/chat/dm/:userId` - mensajes directos entre usuarios
- **Resp**: `{ ok: true, messages }` con `sender` populated

### Sales (CRUD con lógica especial)
- `GET /api/sales` - lista órdenes completamente pagadas
- **Resp**: `{ ok: true, sales }` donde cada sale incluye `total`, `paid`, `restante`

### Permissions (CRUD con estructura por módulos)
- `GET /api/permissions` - lista permisos agrupados por módulo
- **Resp**: `{ ok: true, permisos: [{ module, permissions }] }`

### Roles (CRUD con usuarios y permisos)
- `GET /api/roles` - lista roles con `usersCount` y `permissions` populated
- **Create/Update**: acepta array de `permissions` (ObjectIds)

### Categories, Products, Services - detalles adicionales
- **Categories**: `list` popula `products`
- **Products**: `list` popula `category`, `create` requiere `category`
- **Services**: `create` acepta `name`, `description`, `status`, `imageUrl` (de upload)

## 15) Qué necesita el móvil (añadir)

### Para visits
- **Obtener slots disponibles**: `GET /api/visits/available-slots?date=2024-12-25`
- **Crear visita**: `POST /api/visits/mine` con payload completo
- **Mis visitas**: `GET /api/visits/mine`

### Para chat directo
- **Mensajes con usuario**: `GET /api/chat/dm/:userId`
- **Socket.IO events**: `dm:join`, `dm:message`

### Para dashboard (admin mobile)
- **Datos dashboard**: `GET /api/dashboard` con filtros por período

### Para quotations - carrito mejorado
- **Obtener carrito**: `GET /api/quotations/mine` con `status: 'Carrito'`
- **Agregar item normal**: `POST /api/quotations/:id/items` con `productId`, `quantity`, `color`, `size`
- **Agregar item custom**: `POST /api/quotations/:id/items` con `isCustom: true`, `customDetails`
- **Actualizar cantidad**: `PUT /api/quotations/:id/items/:itemId` con `quantity`
- **Eliminar item**: `DELETE /api/quotations/:id/items/:itemId`
- **Submit cotización**: `POST /api/quotations/:id/submit`

### Para quotations - custom items con imagen
- **POST /api/quotations/cart/custom** (multipart)
  - **Form fields**: `quantity`, `color`, `size`, `name`, `description`, `woodType`, `quotationId` (opcional)
  - **File**: `referenceImage`
  - **Nota**: Si `quotationId` se omite, usa el carrito del usuario

### Para quotations - decisión final
- **Aceptar/Rechazar**: `POST /api/quotations/:id/decision` con `{ decision: 'accepted'|'rejected' }`
- **Efecto**: Si acepta, crea automáticamente una orden y elimina la cotización

---

## 14) Ejemplos de código React Native (alineados al backend)

### Login con cookies
```javascript
import { CookieManager } from '@react-native-cookies/cookies';
const API = 'https://<HOST>/api';

export async function login(email, password) {
  const res = await fetch(`${API}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
    credentials: 'include',
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data?.error || data?.message || 'Login failed');
  return true;
}
```

### Obtener perfil autenticado
```javascript
export async function me() {
  const res = await fetch(`${API}/auth/me`, { credentials: 'include' });
  return await res.json();
}
```

### Actualizar perfil con imagen
```javascript
export async function updateMyProfile({ name, email, phone, address, imageUri }) {
  const form = new FormData();
  if (name) form.append('name', name);
  if (email) form.append('email', email);
  if (phone) form.append('phone', phone);
  if (address) form.append('address', address);
  if (imageUri) {
    form.append('profile_picture', {
      uri: imageUri,
      name: 'profile.jpg',
      type: 'image/jpeg',
    });
  }
  const res = await fetch(`${API}/users/me`, {
    method: 'PUT',
    body: form,
    credentials: 'include',
    headers: { 'Content-Type': 'multipart/form-data' },
  });
  return await res.json();
}
```

### Crear pedido con imágenes
```javascript
export async function createMyOrder({ items, address, images = [] }) {
  const form = new FormData();
  form.append('items', JSON.stringify(items));
  images.slice(0, 10).forEach((uri, idx) => {
    form.append('product_images', { uri, name: `img_${idx}.jpg`, type: 'image/jpeg' });
  });
  if (address) form.append('address', address);
  const res = await fetch(`${API}/orders/mine`, {
    method: 'POST',
    body: form,
    credentials: 'include',
    headers: { 'Content-Type': 'multipart/form-data' },
  });
  return await res.json();
}
```

### Crear cotización quick
```javascript
export async function createQuotationQuick({ items, adminNotes }) {
  const res = await fetch(`${API}/quotations/quick`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ items, adminNotes }),
    credentials: 'include',
  });
  return await res.json();
}
```

### OCR preview (no crea pago)
```javascript
export async function previewPaymentOCR(orderId, imageUri) {
  const form = new FormData();
  form.append('payment_image', {
    uri: imageUri,
    name: 'receipt.jpg',
    type: 'image/jpeg',
  });
  const res = await fetch(`${API}/orders/${orderId}/payments/ocr`, {
    method: 'POST',
    body: form,
    credentials: 'include',
    headers: { 'Content-Type': 'multipart/form-data' },
  });
  return await res.json();
}
```

### Enviar pago OCR pendiente
```javascript
export async function submitPaymentOCR(orderId, { amount, method, receiptUrl, ocrText }) {
  const res = await fetch(`${API}/orders/${orderId}/payments/ocr/submit`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ amount, method, receiptUrl, ocrText }),
    credentials: 'include',
  });
  return await res.json();
}
```

### Interceptor con refresh automático (fetch)
```javascript
async function fetchWithRefresh(url, options = {}) {
  const res = await fetch(url, { ...options, credentials: 'include' });
  if (res.status === 401 || res.status === 403) {
    // Intentar refresh
    const refreshRes = await fetch(`${API}/auth/refresh`, {
      method: 'POST',
      credentials: 'include',
    });
    if (!refreshRes.ok) throw new Error('Session expired');
    // Reintentar request original
    return fetch(url, { ...options, credentials: 'include' });
  }
  return res;
}
```

### Socket.IO (opción 1: si puedes leer cookie token)
```javascript
import { io } from 'socket.io-client';
import CookieManager from '@react-native-cookies/cookies';

export async function connectSocket() {
  const cookies = await CookieManager.get(API);
  const token = cookies?.token?.value;
  const socket = io(API, {
    transports: ['websocket'],
    auth: token ? { token } : undefined,
    extraHeaders: token ? { Cookie: `token=${encodeURIComponent(token)}` } : undefined,
    withCredentials: true,
  });
  return socket;
}
```

### Socket.IO (opción 2: solo cookies, sin leer token)
```javascript
export function connectSocket() {
  const socket = io(API, {
    transports: ['websocket'],
    withCredentials: true, // deja que el stack envíe cookies
  });
  return socket;
}
```

### Visits - obtener slots disponibles
```javascript
export async function getAvailableSlots(date) {
  const res = await fetch(`${API}/visits/available-slots?date=${date}`, {
    credentials: 'include',
  });
  return await res.json();
}
```

### Visits - crear visita
```javascript
export async function createVisit({ visitDate, visitTime, address, description }) {
  const res = await fetch(`${API}/visits/mine`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ visitDate, visitTime, address, description }),
    credentials: 'include',
  });
  return await res.json();
}
```

### Quotations - agregar item con imagen (custom)
```javascript
export async function addCustomItemToCart({ name, description, woodType, quantity, color, size, imageUri }) {
  const form = new FormData();
  form.append('name', name);
  form.append('description', description);
  form.append('woodType', woodType || 'Por definir');
  form.append('quantity', String(quantity || 1));
  form.append('color', color);
  form.append('size', size || '');
  if (imageUri) {
    form.append('referenceImage', {
      uri: imageUri,
      name: 'custom_reference.jpg',
      type: 'image/jpeg',
    });
  }
  const res = await fetch(`${API}/quotations/cart/custom`, {
    method: 'POST',
    body: form,
    credentials: 'include',
    headers: { 'Content-Type': 'multipart/form-data' },
  });
  return await res.json();
}
```

### Quotations - agregar item normal
```javascript
export async function addItemToQuotation(quotationId, { productId, quantity, color, size }) {
  const res = await fetch(`${API}/quotations/${quotationId}/items`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ productId, quantity, color, size }),
    credentials: 'include',
  });
  return await res.json();
}
```

### Quotations - decisión final
```javascript
export async function makeQuotationDecision(quotationId, decision) {
  const res = await fetch(`${API}/quotations/${quotationId}/decision`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ decision }), // 'accepted' | 'rejected'
    credentials: 'include',
  });
  return await res.json();
}
```

### Chat DM - obtener mensajes con usuario
```javascript
export async function getDmMessages(userId) {
  const res = await fetch(`${API}/chat/dm/${userId}`, {
    credentials: 'include',
  });
  return await res.json();
}
```

### Dashboard (admin)
```javascript
export async function getDashboard({ period, compare = true, limit = 10 }) {
  const params = new URLSearchParams();
  if (period) params.append('period', period);
  params.append('compare', String(compare));
  params.append('limit', String(limit));
  
  const res = await fetch(`${API}/dashboard?${params}`, {
    credentials: 'include',
  });
  return await res.json();
}
```

---

## 16) Variables de entorno clave (backend)
- `PORT`, `MONGO_URI`, `JWT_SECRET`
- `FRONTEND_ORIGINS` (lista separada por comas)
- SMTP: `MAIL_SMTP_HOST`, `MAIL_SMTP_USER`, `MAIL_SMTP_PASS`, `MAIL_SMTP_PORT?`, `MAIL_FROM`
- Cloudinary: `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET`
- Opcional: `ADMIN_NOTIFY_EMAIL`, `DEFAULT_USER_ROLE_ID`, `GOOGLE_CLIENT_ID`

---

## 17) Decisión pendiente (para dejarlo perfecto para RN)
Confírmame esto:
- ¿En tu RN actual **sí puedes** leer la cookie `token` (access JWT) con `CookieManager.get(API)` aunque sea httpOnly?

Según eso te dejo **el snippet exacto recomendado** para Socket.IO en RN (con `auth.token` o solo cookies + reconexión con refresh).

---

## 18) Convenciones de API
- Content-Type:
  - JSON: `application/json`
  - Subida de archivos: `multipart/form-data`
- Errores: 400 validación, 401 no autenticado, 403 sin permisos, 404 no encontrado, 500 servidor.
- Seguridad: no se envían tokens en respuestas; se usa cookie httpOnly.

---

## 19) Sugerencias para RN
- Usa `@react-native-cookies/cookies` para manejar cookies httpOnly.
- En WebView, comparte cookies con el contexto nativo si consumes API dentro del WebView.
- Para Socket.IO, intenta leer la cookie `token` desde la librería de cookies y pásala en `auth` o `extraHeaders`.

---

## 20) Referencias internas (backend)
- Endpoints detallados: `src/routes/api.ts`
- Auth: `src/controllers/auth.controller.ts`
- Socket.IO: `src/realtime/socket.ts`
- Cotizaciones: `src/controllers/quotation.controller.ts`
- Pedidos: `src/controllers/order.Controller.ts`
- Pagos: `src/controllers/payment.controller.ts`
- Usuarios: `src/controllers/users.controller.ts`
- Visitas: `src/controllers/visit.controller.ts`
- Dashboard: `src/controllers/dashboard.controller.ts`
- Chat: `src/controllers/chat.controller.ts`

---

## Estado Final
- **Documento actualizado**: ✅ 100% alineado al backend actual
- **Endpoints faltantes añadidos**: Dashboard, Visits slots, Chat DM, Sales, Permissions, Roles
- **Ejemplos RN completos**: Login, perfil, pedidos, cotizaciones (incluyendo custom items), OCR, Socket.IO, visits, dashboard
- **Contenido crítico agregado**: refresh token en BD + rotación, payloads reales, reglas de negocio (bloqueo 3h visitas), decisión automática de cotizaciones
- **Listo para integración**: El equipo de mobile tiene todo lo necesario para conectar con el backend actual
