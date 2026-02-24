## Endpoints de la API

Esta guía resume los endpoints expuestos por el backend. Todos los paths están bajo el prefijo `/api`, salvo `GET /health`.

Notas generales
- Autenticación: cookie `token` (JWT). Para la mayoría de endpoints se requiere sesión iniciada.
- Autorización: `verifyRole(module, action)` en recursos protegidos por permisos (módulos: roles, users, categories, products, services, visits, orders, payments, sales, permissions, quotations).
- Errores: convenciones HTTP 4xx/5xx y mensajes `{ message | error }`.

### Health
- GET `/health` → { ok: true } (sin auth)

### Autenticación
- POST `/api/auth/login` → body: { email, password } → set-cookie `token` y devuelve `{ token }` para apps móviles
- POST `/api/auth/logout` → clear-cookie `token`
- GET `/api/auth/me` → requiere cookie `token` → devuelve claims del usuario
- POST `/api/auth/google` → body: { idToken }

Autenticación para móviles (React Native)
- Puedes usar el token JWT en el header: `Authorization: Bearer <token>`
- Socket.IO: enviar `auth: { token }` en el handshake (o dejar que lo lea de la cookie si navegas en Web)

### Roles (permiso: roles.view/create/update/delete)
- GET `/api/roles` → lista roles
- GET `/api/roles/:id` → obtener rol
- POST `/api/roles` → crear rol
- PUT `/api/roles/:id` → actualizar rol
- DELETE `/api/roles/:id` → eliminar rol

### Permisos (permiso: permissions.view/create/update/delete)
- GET `/api/permissions` → lista agrupada por módulo
- GET `/api/permissions/:id`
- POST `/api/permissions`
- PUT `/api/permissions/:id`
- DELETE `/api/permissions/:id`

### Usuarios (permiso: users.view/create/update/delete)
- GET `/api/users` → lista (sin password), con `role`
- GET `/api/users/:id`
- POST `/api/users` → { name, email, password } (asigna rol por defecto)
- PUT `/api/users/:id` → actualiza campos (no permite escalar `role`)
- DELETE `/api/users/:id`

### Categorías (permiso: categories.view/create/update/delete)
- GET `/api/categories` → lista con `products` (virtual populate)
- GET `/api/categories/:id`
- POST `/api/categories`
- PUT `/api/categories/:id`
- DELETE `/api/categories/:id`

### Productos (permiso: products.view/create/update/delete)
- GET `/api/products` → lista con `category`
- GET `/api/products/:id`
- POST `/api/products` → requiere `name` y `category`
- PUT `/api/products/:id`
- DELETE `/api/products/:id`

### Servicios (permiso: services.view/create/update/delete)
- GET `/api/services`
- GET `/api/services/:id`
- POST `/api/services` → requiere `name`
- PUT `/api/services/:id`
- DELETE `/api/services/:id`

### Visitas (permiso: visits.view/create/update/delete)
- GET `/api/visits` → lista con `user` y `services`
- GET `/api/visits/:id`
- POST `/api/visits`
- PUT `/api/visits/:id`
- DELETE `/api/visits/:id`

Notas de agendamiento
- Al crear una visita (`POST /api/visits` y `POST /api/visits/mine`), el backend aplica un bloqueo automático:
  - Una visita ocupa un bloque de 3 horas desde `visitDate` (la hora elegida + las próximas 2 horas).
  - Si intentas agendar otra visita que se solape con ese bloque, la API responde `409` con `{ message: 'Time slot not available' }`.

### Pedidos (permiso: orders.view/create/update/delete)
- GET `/api/orders` → lista con totales calculados (sin “pagados”)
- GET `/api/orders/:id` → detalle con totales y `restante`
- POST `/api/orders`
- PUT `/api/orders/:id`
- DELETE `/api/orders/:id`

Reseñas de pedidos
- POST `/api/orders/:id/reviews` → crea una reseña embebida en el pedido (auth requerido)
  - Body: `{ rating: 1..5, comment? }`
  - Restricción: 1 reseña por usuario por pedido. Si ya existe, responde `409`.
- GET `/api/orders/:id/reviews` → lista reseñas del pedido (auth requerido)
  - Acceso: dueño del pedido o usuarios con permiso `orders.view`.

### Pagos (permiso: payments.view/create/update/delete)
- GET `/api/payments` → pagos por pedido con cálculo de `restante` (acepta status 'aprobado' o 'confirmado' como aprobados)
- GET `/api/payments/:id` → pagos de un pedido
- POST `/api/payments` → { orderId, amount, paidAt, method, status }
- PUT `/api/payments/:id` → actualizar pago embebido: { paymentId, ... }
- DELETE `/api/payments/:id` → body: { paymentId } (elimina pago del pedido)

OCR de comprobantes (flujo en 2 pasos)
- POST `/api/orders/:id/payments/ocr` → **preview**: lee el comprobante y detecta monto (NO crea pagos)
  - Form-data: `payment_image` (archivo)
  - Devuelve: `current` (total/paid/restante), `detectedAmount`, `projected` (restanteAfter) y `receipt` (ocrText/receiptUrl)
- POST `/api/orders/:id/payments/ocr/submit` → **submit**: crea el pago en estado `pendiente` para aprobación del admin
  - Body: `{ amount, method?, paidAt?, receiptUrl?, ocrText? }`
  - Nota: el admin posteriormente aprueba/actualiza el `status` del pago.

### Ventas (permiso: sales.view)
- GET `/api/sales` → pedidos con `restante <= 0` (pagados)

### Dashboard (permiso: dashboard.view)
- GET `/api/dashboard` → métricas para Medición y Desempeño (solo admin)
  - Query params (opcionales):
    - `from`: fecha inicio (ej. `2026-01-01`)
    - `to`: fecha fin (ej. `2026-12-31`)
    - `period`: filtro estándar por periodo (ignora `from/to` si se envía)
      - Valores: `month` | `quarter` | `semester` | `year`
      - Devuelve datos del **periodo anterior completo** en `previous` (ej. mes pasado, trimestre pasado, etc.)
      - Si `compare=true`, también devuelve `current` (periodo actual en curso) para comparativas
    - `compare`: `true|false` (default `true`, solo aplica cuando envías `period`)
    - `limit`: top de productos/servicios (default 10, max 50)
  - Devuelve:
    - `summary`: { totalRevenue, totalSales, totalUsers }
    - `series`: { monthly, quarterly, semiannual }
    - `topItems`: { products, services } (ranking por cantidad)

### Cotizaciones
Autenticado por cookie. Permisos finos para admin en listAll/quote.

Flujo 1: Cotizar un solo producto (desde su ficha)
- POST `/api/quotations/quick` → { productId, quantity?, color?, size?, notes? } → crea cotización `solicitada` (valida quantity > 0)
- POST `/api/quotations/:id/quote` (permiso quotations.update) → { totalEstimate, adminNotes? } → estado `cotizada` + email al cliente
- POST `/api/quotations/:id/decision` → { decision: 'accept' | 'reject' } → `en_proceso` | `cerrada` + email al admin

Flujo 2: Carrito de cotización (varios productos)
- POST `/api/quotations/cart` → crea/obtiene `carrito`
- POST `/api/quotations/:id/items` → agrega ítem { productId, quantity?, color?, size?, notes? } (valida quantity > 0)
- PUT `/api/quotations/:id/items/:itemId` → edita ítem (valida quantity > 0)
- DELETE `/api/quotations/:id/items/:itemId` → elimina ítem
- POST `/api/quotations/:id/submit` → cambia a `solicitada`

Consultas
- GET `/api/quotations/mine` → mis cotizaciones
- GET `/api/quotations` (permiso quotations.view) → todas
- GET `/api/quotations/:id` → detalle
- GET `/api/quotations/:quotationId/messages` → historial chat

### Chat en tiempo real (Socket.IO)
Conexión
- URL del servidor WebSocket: mismo host del backend
- Handshake: `auth: { token: <JWT> }`

Eventos
- `quotation:join` → payload: { quotationId } (valida dueño o admin)
- `chat:message` → payload: { quotationId, message }
  - Emite a sala `q:<quotationId>`
  - Si quien envía no es el dueño, se envía email al dueño con link


