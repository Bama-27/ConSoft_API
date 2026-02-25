## Permisos del sistema (por módulo)

Descripción breve de acciones:
- **view**: listar/obtener recursos (GET).
- **create**: crear recursos (POST).
- **update**: modificar recursos (PUT/PATCH).
- **delete**: eliminar recursos (DELETE).

Cada permiso se expresa como `modulo.accion` (ej.: `users.view`).

### roles
- roles.view
- roles.create
- roles.update
- roles.delete

### users
- users.view
- users.create
- users.update
- users.delete

### categories
- categories.view
- categories.create
- categories.update
- categories.delete

### products
- products.view
- products.create
- products.update
- products.delete

### services
- services.view
- services.create
- services.update
- services.delete

### visits (solo lectura)
- visits.view

### sales (solo lectura)
- sales.view

### dashboard (solo lectura)
- dashboard.view

### quotations (parcial)
- quotations.view
- quotations.update

### permissions (solo lectura)
- permissions.view

Total esperado: 26 permisos




r