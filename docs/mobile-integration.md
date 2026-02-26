## Guía de Integración Móvil (React Native)

Esta guía explica cómo autenticar, consumir endpoints, subir imágenes, usar chat en tiempo real, manejar recuperación de contraseña y pagos con OCR. Incluye ejemplos prácticos en React Native.

### Base URL y CORS
- Backend sirve bajo `/api`: `http://<HOST>:<PORT>/api`
- Configura `FRONTEND_ORIGINS` con URLs que consumirán el backend (p. ej. `http://localhost:3000,http://10.0.2.2:3000`).
- Para apps nativas, recomendamos cookies httpOnly; usa una librería de cookies para RN.

### Autenticación (cookies httpOnly)
- El backend NO devuelve el token en el body; lo setea en una cookie httpOnly `token`.
- Endpoints:
  - POST `/api/auth/login` → `{ email, password }` → Set-Cookie `token`; body: `{ message }`.
  - POST `/api/auth/register` → `{ name, email, password }` → Set-Cookie `token`; body: `{ ok, message }`.
  - GET `/api/auth/me` → retorna usuario autenticado.
  - POST `/api/auth/logout` → limpia cookie.

React Native (usando cookies)
```javascript
import { Cookies } from '@react-native-cookies/cookies'; // o '@react-native-cookies/cookies'
const API = 'http://<HOST>:<PORT>';

export async function login(email, password) {
  const res = await fetch(`${API}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
    credentials: 'include',
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data?.error || data?.message || 'Login failed');
  // La cookie httpOnly queda almacenada por el stack nativo
  return true;
}

export async function me() {
  const res = await fetch(`${API}/api/auth/me`, { credentials: 'include' });
  return await res.json();
}
```

### Gestión de contraseña
- POST `/api/auth/forgot-password` (público): `{ email }` → siempre responde `{ ok: true }`. Envía correo si el usuario existe.
- POST `/api/auth/reset-password` (público): `{ token, newPassword }` (token recibido por correo).
- POST `/api/auth/change-password` (autenticado): `{ currentPassword, newPassword }`.
- Reglas: `newPassword` debe tener 1 mayúscula, 1 número y 1 caracter especial.

### Perfil del usuario
- GET `/api/users/me` → perfil autenticado (sin datos sensibles).
- PUT `/api/users/me` → multipart/form-data para actualizar perfil.
  - Campos soportados: `name`, `email`, `phone`, `address`
  - Archivo: `profile_picture` (imagen)
  - Respuesta: `{ ok: true, user }`

Ejemplo RN (actualizar perfil con imagen)
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
  const res = await fetch(`${API}/api/users/me`, {
    method: 'PUT',
    body: form,
    credentials: 'include',
    headers: { 'Content-Type': 'multipart/form-data' },
  });
  return await res.json();
}
```

### Catálogo público
- Categorías: GET `/api/categories`, GET `/api/categories/:id`
- Productos: GET `/api/products`, GET `/api/products/:id`
- Servicios: GET `/api/services`, GET `/api/services/:id`

### Cotizaciones
- Flujo rápido (1 producto):
  - POST `/api/quotations/quick` → `{ productId, quantity?, color?, size?, notes? }` → crea con `status: 'solicitada'`.
- Carrito (varios productos):
  - POST `/api/quotations/cart` → crea/obtiene carrito (atómico; 1 carrito activo por usuario).
  - POST `/api/quotations/:id/items` → `{ productId, quantity?, color?, size?, notes? }` (validación `quantity > 0`).
  - PUT `/api/quotations/:id/items/:itemId` → actualiza (valida `quantity > 0` si se envía).
  - DELETE `/api/quotations/:id/items/:itemId`
  - POST `/api/quotations/:id/submit` → cambia a `solicitada`.
- Revisión admin y decisión usuario:
  - POST `/api/quotations/:id/quote` (admin) → `{ totalEstimate, adminNotes?, items? }`
  - POST `/api/quotations/:id/decision` (usuario) → `{ decision: 'accept' | 'reject' }`
    - El backend elimina la cotización y sus mensajes de chat y opcionalmente crea un Pedido si se acepta.
    - Respuesta: `{ ok: true, deleted: true, quotationId }`
- Listados:
  - GET `/api/quotations/mine` (usuario)
  - GET `/api/quotations` (admin)
  - GET `/api/quotations/:id` (dueño o admin)
  - GET `/api/quotations/:quotationId/messages` (historial de chat)

### Chat en tiempo real
- Cliente: `socket.io-client`
- Acceso: dueño de la cotización o admin con permisos `quotations.view|write|update`.
- Eventos:
  - `quotation:join` → `{ quotationId }`
  - `chat:message` → `{ quotationId, message }` (broadcast a sala `q:<quotationId>`)
- Correo al cliente sólo si está offline: al recibir `chat:message` desde admin y el dueño no está conectado, se envía email con asunto “Tienes un nuevo mensaje”.

React Native (Socket.IO con cookies)
```javascript
import { io } from 'socket.io-client';
import CookieManager from '@react-native-cookies/cookies';
const API = 'http://<HOST>:<PORT>';

export async function connectSocket() {
  // Lee cookie 'token' (si tu lib lo permite; muchas la exponen vía native)
  const cookies = await CookieManager.get(API);
  const tokenCookie = cookies?.token?.value; // puede estar disponible aun siendo httpOnly vía capa nativa
  const socket = io(API, {
    transports: ['websocket'],
    auth: tokenCookie ? { token: tokenCookie } : undefined,
    extraHeaders: tokenCookie ? { Cookie: `token=${encodeURIComponent(tokenCookie)}` } : undefined,
    withCredentials: true,
  });
  return socket;
}
```

### Pedidos y Visitas para el usuario autenticado
- Visitas:
  - POST `/api/visits/mine` → crea visita asignada al usuario autenticado.
  - GET `/api/visits/mine` → lista visitas del usuario.
- Pedidos:
  - POST `/api/orders/mine` → crea pedido para el usuario autenticado.
    - Body JSON: `{ items: Array<item>, address? }`
    - También acepta archivos `product_images` (hasta 10) vía multipart/form-data; se guardan en `attachments`.
  - GET `/api/orders/mine` → lista pedidos del usuario autenticado (incluye `total`, `paid`, `restante`).
  - POST `/api/orders/:id/attachments` → adjunta imágenes al pedido existente.
    - Archivos: `product_images` (array, máx 10)
    - Body opcional: `item_id` (para asociar adjunto a un ítem específico)
    - Autorización: dueño del pedido o admin con permiso `orders.update`.

Estructura de ítem de pedido
```json
{
  "tipo": "producto | servicio",
  "id_producto": "ObjectId (si tipo=producto)",
  "id_servicio": "ObjectId (si tipo=servicio)",
  "imageUrl": "string (snapshot del catálogo al crear)",
  "detalles": "string",
  "cantidad": 1,
  "valor": 10000
}
```

Ejemplo RN (crear pedido con imágenes)
```javascript
export async function createMyOrder({ items, address, images = [] }) {
  const form = new FormData();
  form.append('items', JSON.stringify(items)); // si envías JSON + files, maneja en servidor o envía todo como JSON sin archivos
  images.slice(0, 10).forEach((uri, idx) => {
    form.append('product_images', { uri, name: `img_${idx}.jpg`, type: 'image/jpeg' });
  });
  if (address) form.append('address', address);
  const res = await fetch(`${API}/api/orders/mine`, {
    method: 'POST',
    body: form,
    credentials: 'include',
    headers: { 'Content-Type': 'multipart/form-data' },
  });
  return await res.json();
}
```

### Pagos con OCR (comprobante)
- POST `/api/orders/:id/payments/ocr`
  - Archivo: `payment_image`
  - El backend extrae texto con OCR y parsea un monto; registra un pago con `receiptUrl` y `ocrText`. Sólo pagos con estado aprobado/confirmado cuentan para el total.

### Subida de imágenes (Cloudinary + Multer)
- Perfil: campo `profile_picture` (PUT `/api/users/me`)
- Pedido (nuevo): campo `product_images` (POST `/api/orders/mine`)
- Pedido (existente): campo `product_images` + opcional `item_id` (POST `/api/orders/:id/attachments`)
- Almacenamiento: Cloudinary, carpeta `ConSoft`

### Emails (SMTP)
- Requisitos mínimos: `MAIL_SMTP_HOST`, `MAIL_SMTP_USER`, `MAIL_SMTP_PASS`
- Opcional: `MAIL_SMTP_PORT` (por defecto 587), `MAIL_FROM` (p. ej. `no-reply@tudominio.com`)
- Si no hay configuración, se registra en logs: `[sendEmail noop] …` sin enviar correos.
- Casos:
  - Chat: se envía al dueño sólo si está offline cuando recibe mensaje.
  - Cotización lista: se notifica al cliente.
  - Decisión de cotización: se notifica al admin.

### Variables de entorno clave
- `PORT`, `MONGO_URI`, `JWT_SECRET`
- `FRONTEND_ORIGINS` (lista separada por comas)
- SMTP: `MAIL_SMTP_HOST`, `MAIL_SMTP_USER`, `MAIL_SMTP_PASS`, `MAIL_SMTP_PORT?`, `MAIL_FROM`
- Cloudinary: `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET`
- Opcional: `ADMIN_NOTIFY_EMAIL`, `DEFAULT_USER_ROLE_ID`, `GOOGLE_CLIENT_ID`

### Convenciones de API
- Content-Type:
  - JSON: `application/json`
  - Subida de archivos: `multipart/form-data`
- Errores: 400 validación, 401 no autenticado, 403 sin permisos, 404 no encontrado, 500 servidor.
- Seguridad: no se envían tokens en respuestas; se usa cookie httpOnly.

### Sugerencias para RN
- Usa `@react-native-cookies/cookies` para manejar cookies httpOnly.
- En WebView, comparte cookies con el contexto nativo si consumes API dentro del WebView.
- Para Socket.IO, intenta leer la cookie `token` desde la librería de cookies y pásala en `auth` o `extraHeaders`.

### Referencias
- Endpoints detallados: `docs/api-endpoints.md`
- OpenAPI: `docs/openapi.yaml`
- Flujo de cotizaciones: `docs/quotations.md`
