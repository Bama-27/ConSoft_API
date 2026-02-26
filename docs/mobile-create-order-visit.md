# Endpoints móviles para crear y consultar pedidos y visitas (asignados al usuario)

Requieren sesión (cookie httpOnly `token`). No necesitan permisos de admin.

## Pedidos (Orders)

### (Admin) POST `/api/orders` — Crear pedido para un usuario específico
Requiere permisos `orders.create`. Úsalo cuando un administrador/asesor crea el pedido para un cliente.

Body:
```json
{
  "user": "<userId>",
  "status": "en_proceso",
  "address": "Calle 123 #45-67, Ciudad",
  "items": [
    { "tipo": "servicio", "id_servicio": "<serviceId>", "detalles": "Texto", "cantidad": 1, "valor": 120000 },
    { "tipo": "producto", "id_producto": "<productId>", "detalles": "Producto adicional", "cantidad": 2, "valor": 35000 }
  ],
  "payments": []
}
```
Este pedido quedará visible para ese usuario en `GET /api/orders/mine` (web y móvil) al iniciar sesión.

### POST `/api/orders/mine` — Crear pedido para el usuario autenticado
Content-Type: `multipart/form-data`

Campos:
- `items` (string JSON): arreglo de ítems con soporte de productos y servicios
- `address` (texto)
- `product_images` (opcional, múltiples archivos): imágenes relacionadas a los productos del pedido

Ejemplo de `items`:
```json
{
  "items": [
    { "tipo": "servicio", "id_servicio": "<serviceId>", "detalles": "Texto", "cantidad": 1, "valor": 120000 },
    { "tipo": "producto", "id_producto": "<productId>", "detalles": "Producto adicional", "cantidad": 2, "valor": 35000 }
  ],
  "address": "Calle 123 #45-67, Ciudad"
}
```
Notas:
- Asigna automáticamente el `user` con el `id` del usuario autenticado.
- `status` se inicializa en `"en_proceso"` y `startedAt` en la fecha actual.
- Puedes adjuntar imágenes con el campo `product_images` (múltiples). Se guardan como `attachments` del pedido con `type = "product_image"`.
- Respuesta: `201 { "ok": true, "order": { ... } }` con `user`, `items.id_servicio` e `items.id_producto` populados.

### GET `/api/orders/mine` — Listar pedidos del usuario autenticado
Respuesta:
```json
{
  "ok": true,
  "orders": [
    {
      "_id": "...",
      "user": { "_id": "...", "name": "...", "email": "..." },
      "status": "en_proceso",
      "items": [
        { "id": "...", "tipo": "servicio", "id_servicio": { "_id": "...", "name": "..." }, "imageUrl": "https://...", "detalles": "...", "cantidad": 1, "valor": 120000 },
        { "id": "...", "tipo": "producto", "id_producto": { "_id": "...", "name": "..." }, "imageUrl": "https://...", "detalles": "Producto adicional", "cantidad": 2, "valor": 35000 }
      ],
      "attachments": [
        { "url": "https://res.cloudinary.com/.../image/upload/...", "type": "product_image", "uploadedBy": "...", "uploadedAt": "..." }
      ],
      "total": 120000,
      "paid": 0,
      "restante": 120000,
      "paymentStatus": "Pendiente"
    }
  ]
}
```

## Visitas (Visits)

### (Admin) POST `/api/visits` — Crear visita para un usuario específico
Requiere permisos `visits.create`. Úsalo cuando un administrador agenda la visita para un cliente.

Body:
```json
{
  "user": "<userId>",
  "visitDate": "2025-12-31T10:00:00.000Z",
  "address": "Calle 123 #45-67, Ciudad",
  "status": "pendiente",
  "services": ["<serviceId1>", "serviceId2"]
}
```
Esta visita quedará visible para ese usuario en `GET /api/visits/mine` (web y móvil) al iniciar sesión.

### POST `/api/visits/mine` — Crear visita para el usuario autenticado
Body:
```json
{
  "visitDate": "2025-12-31T10:00:00.000Z",
  "address": "Calle 123 #45-67, Ciudad",
  "status": "pendiente",
  "services": ["<serviceId1>", "<serviceId2>"]
}
```
Notas:
- `user` se asigna automáticamente al usuario autenticado.
- `status` por defecto `"pendiente"` si no se envía.
- Respuesta: `201 { "ok": true, "visit": { ... } }` con `user` y `services` populados.

### GET `/api/visits/mine` — Listar visitas del usuario autenticado
Respuesta:
```json
{
  "ok": true,
  "visits": [
    {
      "_id": "...",
      "user": { "_id": "...", "name": "...", "email": "..." },
      "visitDate": "2025-12-31T10:00:00.000Z",
      "address": "Calle 123 #45-67, Ciudad",
      "status": "pendiente",
      "services": [{ "_id": "...", "name": "...", "description": "..." }]
    }
  ]
}
```

## Consideraciones
- Todos los endpoints anteriores requieren autenticación por cookie httpOnly (`/api/auth/login` antes).
- Si tu app móvil no comparte cookies automáticamente, usa un wrapper que incluya `credentials: 'include'` en cada request.
- Para producción, asegúrate de exponer el mismo dominio o configurar correctamente `FRONTEND_ORIGINS` y usar HTTPS para `SameSite=None; Secure`.
- El cálculo de `paid` y `restante` usa únicamente pagos con estado `aprobado` o `confirmado`. Pagos `pendiente` no descuentan hasta ser aprobados.

