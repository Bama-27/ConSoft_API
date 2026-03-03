# Endpoints Completos del Backend - ConSoft_API

## Base URL
- **API**: `http://localhost:3000/api` (desarrollo)
- **Health**: `GET /health` → `{ ok: true }`

---

## Autenticación (Auth)

### Públicos
- `POST /auth/login`
  - Body: `{ email, password }`
  - Set-Cookie: `token` (JWT, 30m), `refreshToken` (random, 30d)
  - Resp: `{ message: "Login successful" }`

- `POST /auth/register`
  - Body: `{ name, email, password }`
  - Password: 1 mayúscula, 1 número, 1 caracter especial
  - Set-Cookie: `token`, `refreshToken`
  - Resp: `{ ok: true, message: "User registered successfully" }`

- `POST /auth/google`
  - Body: `{ idToken }`
  - Crea usuario si no existe, set cookies
  - Resp: `{ message: "Login successful" }`

- `POST /auth/refresh`
  - Requiere: Cookie `refreshToken`
  - Revoca token viejo, genera nuevos tokens
  - Resp: `{ ok: true }`

- `POST /auth/logout`
  - Revoca refresh token en BD, limpia cookies
  - Resp: `{ message: "Logout successful" }`

- `POST /auth/forgot-password`
  - Body: `{ email }`
  - Envía email de recuperación

- `POST /auth/reset-password`
  - Body: `{ token, newPassword }`
  - Restablece contraseña

### Protegidos
- `GET /auth/me`
  - Requiere: Cookie `token` o Bearer
  - Resp: Payload del usuario (`req.user`)

- `POST /auth/change-password`
  - Body: `{ currentPassword, newPassword }`
  - Requiere autenticación

- `POST /auth/profile`
  - Body: Datos de perfil (depende de implementación)
  - Requiere autenticación

---

## Usuarios (Users)

### Públicos
- `POST /users`
  - Registro simple (usado por tests)
  - Setea solo `token` (2h), no refresh

### Protegidos
- `GET /users/me`
  - Perfil del usuario autenticado
  - Resp: `{ ok: true, user }`

- `PUT /users/me`
  - Multipart: `profile_picture` (file)
  - Campos: `name`, `phone`, `address`, `email`
  - Bloquea: `password`, `role`

- `PUT /users/:id`
  - Multipart: `profile_picture`
  - Requiere permisos de admin

---

## Catálogo (Categories, Products, Services)

### Públicos
- `GET /categories`
  - Lista categorías con `products` populated

- `GET /categories/:id`
  - Detalle de categoría

- `GET /products`
  - Lista productos con `category` populated

- `GET /products/:id`
  - Detalle de producto

- `GET /services`
  - Lista servicios

- `GET /services/:id`
  - Detalle de servicio

### Protegidos (Admin)
- `POST /products`
  - Multipart: `image`
  - Body: `{ name, category, description, descriptionC, status }`
  - Requiere: `category`

- `POST /services`
  - Multipart: `image`
  - Body: `{ name, description, status }`

---

## Visitas (Visits)

### Públicos
- `GET /visits/available-slots`
  - Query: `date` (YYYY-MM-DD)
  - Resp: `{ ok: true, availableSlots: ["08:00", "09:00", ...] }`
  - Slots: 08:00-20:00, bloquea 3h por visita

- `POST /visits/mine`
  - `optionalAuth` - permite guest o usuario
  - Body: `{ visitDate, visitTime, address, description, userName?, userEmail?, userPhone? }`
  - Guest: requiere `userName`, `userEmail`, `userPhone`
  - Resp: `{ ok: true, visit, message }`

### Protegidos
- `GET /visits/mine`
  - Lista visitas del usuario autenticado
  - Resp: `{ ok: true, visits }`

---

## Pedidos (Orders)

### Públicos
- `GET /orders/reviews`
  - Lista todas las reseñas

- `GET /orders/:id/reviews`
  - Reseñas de un pedido específico

### Protegidos
- `GET /orders/mine`
  - Lista pedidos del usuario autenticado

- `POST /orders/mine`
  - Multipart: `product_images[]` (máx 10)
  - Body: `{ items, address }`
  - `items`: Array no vacío, normaliza `{ tipo, id_producto|id_servicio, cantidad, valor }`
  - Enriquece con `imageUrl` desde catálogo

- `POST /orders/:id/attachments`
  - Multipart: `product_images[]`, opcional `item_id`
  - Permite dueño o admin con permiso

- `POST /orders/:id/reviews`
  - Body: `{ rating (1-5), comment? }`
  - 1 review por usuario por pedido

---

## Pagos (Payments)

### CRUD (Admin)
- `GET /payments`
- `GET /payments/:id`
- `POST /payments`
- `PUT /payments/:id`
- `DELETE /payments/:id`

### OCR
- `POST /orders/:id/payments/ocr`
  - Multipart: `payment_image`
  - **NO crea pago** - solo preview
  - Resp: `{ ok: true, orderId, current, detectedAmount, projected, receipt }`

- `POST /orders/:id/payments/ocr/submit`
  - Body: `{ amount, paidAt?, method, receiptUrl, ocrText }`
  - **SÍ crea pago** con `status: 'pendiente'`
  - Resp: `{ ok: true, payment }`

---

## Ventas (Sales)

- `GET /sales`
  - Lista órdenes completamente pagadas (`restante <= 0`)
  - Resp: `{ ok: true, sales }` con `total`, `paid`, `restante`

- CRUD estándar (admin)

---

## Permisos (Permissions)

- `GET /permissions`
  - Lista permisos agrupados por módulo
  - Resp: `{ ok: true, permisos: [{ module, permissions }] }`

- `POST /permissions`
  - Body: `{ module, action }`

- CRUD estándar (admin)

---

## Roles (Roles)

- `GET /roles`
  - Lista roles con `usersCount` y `permissions` populated

- `POST /roles`
  - Body: `{ name, description, permissions: [ObjectIds] }`

- `PUT /roles/:id`
  - Body: `{ name?, description?, permissions?: [ObjectIds] }`

- CRUD estándar (admin)

---

## Cotizaciones (Quotations)

### Protegidos (Usuario)
- `GET /quotations/mine`
  - Lista cotizaciones del usuario

- `POST /quotations/cart`
  - Crea o retorna carrito con `status: 'Carrito'`

- `POST /quotations/quick`
  - Body: `{ items: [], adminNotes? }`
  - Crea cotización directa con `status: 'Solicitada'`

- `POST /quotations/:id/items`
  - Body: 
    - **Normal**: `{ productId, quantity?, color?, size? }`
    - **Custom**: `{ isCustom: true, customDetails: { name, description, woodType?, referenceImage? }, quantity?, color?, size? }`

- `PUT /quotations/:id/items/:itemId`
  - Body: `{ quantity?, color?, size?, price?, adminNotes? }`

- `DELETE /quotations/:id/items/:itemId`
  - Elimina item específico

- `POST /quotations/:id/submit`
  - Cambia status a `'Solicitada'`

- `POST /quotations/:id/decision`
  - Body: `{ decision: 'accepted'|'rejected' }`
  - **Accepted**: Crea orden automáticamente, elimina cotización
  - **Rejected**: Cierra cotización, elimina

### Custom Items con Imagen
- `POST /quotations/cart/custom`
  - Multipart: `referenceImage`
  - Form fields: `{ name, description, woodType?, quantity, color, size, quotationId? }`
  - Si `quotationId` omitido, usa carrito del usuario

### Admin
- `POST /quotations/admin/create`
  - Body: `{ userId, adminNotes? }`
  - Requiere permiso `quotations.create`

- `POST /quotations/:id/quote`
  - Body: `{ items?, totalEstimate?, adminNotes? }`
  - Cambia status a `'Cotizada'`

- `GET /quotations`
  - Lista todas las cotizaciones (admin)
  - Query: `status?, page?, limit?`

- `GET /quotations/:id`
  - Detalle de cotización específica

---

## Chat

### Protegidos
- `GET /chat/dm/:userId`
  - Mensajes directos entre usuarios
  - Resp: `{ ok: true, messages }` con `sender` populated

- `GET /quotations/:quotationId/messages`
  - Historial de chat de cotización

---

## Dashboard (Admin)

- `GET /dashboard`
  - Query params: `from?, to?, period? (month|quarter|semester|year), compare? (boolean), limit? (1-50)`
  - Resp: `{ ok: true, range, summary, series, topItems }`
  - **Series**: `monthly`, `quarterly`, `semiannual`
  - **Top items**: `products`, `services`
  - **Summary**: `totalRevenue`, `totalSales`, `totalUsers`

---

## Socket.IO Events

### Autenticación
- Token JWT desde: `socket.handshake.auth.token` o `socket.handshake.query.token` o cookie `token`

### Eventos
- **Cotizaciones**:
  - `quotation:join` → `{ quotationId }`
  - `chat:message` → `{ quotationId, message }`

- **DM (Mensajes Directos)**:
  - `dm:join` → `{ userId }`
  - `dm:message` → `{ toUserId, message }`

---

## Convenciones

### Content-Type
- JSON: `application/json`
- Archivos: `multipart/form-data`

### Errores
- `400`: Validación
- `401`: No autenticado
- `403`: Sin permisos
- `404`: No encontrado
- `500`: Error servidor

### Cookies
- `token`: JWT access (30m, httpOnly)
- `refreshToken`: Random hex (30d, httpOnly, BD)

### CORS
- `credentials: true`
- `origin`: según `FRONTEND_ORIGINS`

---

## Middleware de Autenticación

### verifyToken
- Lee token desde cookie `token` o `Authorization: Bearer`
- No refresca automáticamente
- 401 si no hay token, 403 si inválido/expirado

### optionalAuth
- Si no hay token, `req.user = undefined`
- No refresca

### verifyRole
- Verifica permisos: `verifyRole(resource, action)`
- Usado en endpoints admin y CRUD
