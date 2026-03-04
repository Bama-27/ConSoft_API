# Documentación de Endpoints API

## 🛒 Carrito de Compras

### Obtener/Crear Carrito
```http
POST /api/quotations/cart
GET /api/quotations/cart
```
**Acceso**: Usuario autenticado  
**Respuesta**:
```json
{
  "ok": true,
  "cart": {
    "_id": "ObjectId",
    "user": "ObjectId",
    "status": "Carrito",
    "items": [],
    "totalEstimate": 0,
    "createdAt": "Date",
    "updatedAt": "Date"
  }
}
```

### Agregar Producto al Carrito
```http
POST /api/quotations/:id/items
POST /api/quotations/cart
```
**Body**:
```json
{
  "productId": "ObjectId",
  "quantity": 1,
  "color": "rojo",
  "size": "mediano"
}
```

### Agregar Producto Personalizado
```http
POST /api/quotations/cart/custom
```
**Content-Type**: `multipart/form-data`  
**Body**:
```json
{
  "name": "Mueble personalizado",
  "description": "Descripción del producto",
  "quantity": 1,
  "color": "caoba",
  "size": "2m x 1m",
  "woodType": "roble"
}
```
**Archivo**: `referenceImage` (opcional)

### Modificar Items del Carrito
```http
PUT /api/quotations/:id/items/:itemId
DELETE /api/quotations/:id/items/:itemId
```
**PUT Body**:
```json
{
  "quantity": 2,
  "color": "azul",
  "size": "grande",
  "price": 150000
}
```

---

## 📋 Cotizaciones

### Solicitar Cotización
```http
POST /api/quotations/:id/submit
POST /api/quotations/requestQuotation
```
**Acción**: Cambia status de `Carrito` → `Solicitada`

### Listar Mis Cotizaciones
```http
GET /api/quotations/mine
```
**Acceso**: Usuario autenticado  
**Respuesta**:
```json
{
  "ok": true,
  "quotations": [
    {
      "_id": "ObjectId",
      "user": {
        "_id": "ObjectId",
        "name": "Juan Pérez",
        "email": "juan@email.com"
      },
      "status": "Cotizada",
      "items": [...],
      "totalEstimate": 250000,
      "adminNotes": "Notas del admin",
      "createdAt": "Date"
    }
  ]
}
```

### Creación Rápida de Cotización
```http
POST /api/quotations/quick
```
**Body**:
```json
{
  "items": [
    {
      "productId": "ObjectId",
      "quantity": 2,
      "color": "rojo",
      "size": "mediano"
    }
  ],
  "adminNotes": "Notas adicionales"
}
```

### Admin - Establecer Cotización
```http
POST /api/quotations/:id/quote
```
**Acceso**: Admin con permiso `quotations.update`  
**Body**:
```json
{
  "items": [
    {
      "_id": "itemId",
      "price": 120000,
      "adminNotes": "Material premium"
    }
  ],
  "totalEstimate": 240000,
  "adminNotes": "Cotización actualizada"
}
```

### Decisión del Usuario
```http
POST /api/quotations/:id/decision
```
**Body**:
```json
{
  "decision": "accepted" | "rejected"
}
```

### Admin - Listar Todas las Cotizaciones
```http
GET /api/quotations?page=1&limit=20&status=Cotizada
```
**Acceso**: Admin con permiso `quotations.view`  
**Query Params**:
- `page`: Número de página (default: 1)
- `limit`: Resultados por página (default: 20)
- `status`: Filtrar por estado

---

## 📦 Productos

### Listar Productos (Público)
```http
GET /api/products
```
**Respuesta**:
```json
{
  "ok": true,
  "products": [
    {
      "_id": "ObjectId",
      "name": "Silla de madera",
      "description": "Silla tradicional de roble",
      "descriptionC": "Descripción en chino",
      "category": {
        "_id": "ObjectId",
        "name": "Muebles"
      },
      "status": true,
      "imageUrl": "https://url/imagen.jpg"
    }
  ]
}
```

### Obtener Producto por ID (Público)
```http
GET /api/products/:id
```
**Respuesta**: Objeto individual igual al del listado

### Crear Producto (Admin)
```http
POST /api/products
```
**Content-Type**: `multipart/form-data`  
**Acceso**: Admin con permisos  
**Body**:
```json
{
  "name": "Nuevo producto",
  "category": "ObjectId",
  "description": "Descripción del producto",
  "descriptionC": "Descripción en chino",
  "status": true
}
```
**Archivo**: `image` (opcional)

### CRUD Completo (Admin)
```http
GET    /api/products/:id     # Obtener producto
PUT    /api/products/:id     # Actualizar producto
DELETE /api/products/:id     # Eliminar producto
GET    /api/products         # Listar todos (admin)
```

---

## 🏷️ Categorías

### Listar Categorías (Público)
```http
GET /api/categories
```
**Respuesta**:
```json
{
  "ok": true,
  "categories": [
    {
      "_id": "ObjectId",
      "name": "Muebles",
      "description": "Muebles de madera",
      "products": [
        {
          "_id": "ObjectId",
          "name": "Silla",
          "imageUrl": "url"
        }
      ]
    }
  ]
}
```

### CRUD Categorías (Admin)
```http
GET    /api/categories/:id
POST   /api/categories
PUT    /api/categories/:id
DELETE /api/categories/:id
```

---

## 📊 Estructura de Datos

### Carrito/Cotización
```typescript
{
  _id: ObjectId,
  user: ObjectId,
  status: "Carrito" | "Solicitada" | "Cotizada" | "En proceso" | "Cerrada",
  items: [{
    _id: ObjectId,
    product: ObjectId | null,           // null si es custom
    isCustom: boolean,
    customDetails?: {
      name: string,
      description: string,
      woodType?: string,
      referenceImage?: string
    },
    quantity: number,
    color: string,
    size: string,
    price: number,                      // 0 hasta que admin cotice
    adminNotes?: string,
    itemStatus: "normal" | "pending_quote" | "quoted" | "confirmed"
  }],
  totalEstimate: number,
  adminNotes?: string,
  createdAt: Date,
  updatedAt: Date
}
```

### Producto
```typescript
{
  _id: ObjectId,
  name: string,
  description?: string,
  descriptionC?: string,
  category: ObjectId,
  status: boolean,
  imageUrl?: string
}
```

### Categoría
```typescript
{
  _id: ObjectId,
  name: string,
  description?: string,
  products?: ObjectId[]
}
```

---

## 🔐 Permisos Requeridos

| Endpoint | Autenticación | Permisos Admin |
|----------|---------------|----------------|
| Carrito (GET/POST) | ✅ Usuario | ❌ |
| Agregar al carrito | ✅ Usuario | ❌ |
| Solicitar cotización | ✅ Usuario | ❌ |
| Listar mis cotizaciones | ✅ Usuario | ❌ |
| Decisión cotización | ✅ Usuario | ❌ |
| Crear producto | ✅ Admin | ✅ products.create |
| Actualizar producto | ✅ Admin | ✅ products.update |
| Eliminar producto | ✅ Admin | ✅ products.delete |
| Listar todas cotizaciones | ✅ Admin | ✅ quotations.view |
| Establecer cotización | ✅ Admin | ✅ quotations.update |
| Crear cotización admin | ✅ Admin | ✅ quotations.create |

---

## 🔄 Flujo Completo

1. **Cliente navega** productos (público)
2. **Agrega al carrito** (autenticado)
3. **Solicita cotización** (carrito → solicitada)
4. **Admin cotiza** (asigna precios)
5. **Cliente decide** (aceptar/rechazar)
6. **Si acepta** → se crea pedido automáticamente
7. **Notificaciones** por email automáticas

---

## 📝 Notas Importantes

- **Un carrito activo** por usuario (único)
- **Productos mixtos**: normales + personalizados
- **Conversión automática**: cotización → pedido
- **Índices únicos** garantizan consistencia
- **Populate automático** de productos en cotizaciones
- **Validación de archivos** para imágenes personalizadas
