import { RoleModel } from '../models/role.model';
import { PermissionModel } from '../models/permission.model';
import { env } from './env';


export async function ensureCoreData(): Promise<void> {
  const ADMIN_NAME = 'Administrador';
  const USER_NAME = 'Usuario';

  // Ensure Admin role
  let adminRole = await RoleModel.findOne({ name: ADMIN_NAME });
  if (!adminRole) {
    adminRole = await RoleModel.create({ name: ADMIN_NAME, description: 'Administrador del sistema' });
  }

  // Ensure User role
  let userRole = await RoleModel.findOne({ name: USER_NAME });
  if (!userRole) {
    userRole = await RoleModel.create({ name: USER_NAME, description: 'Usuario estándar' });
  }

  // Populate runtime defaults if not provided via env
  if (!env.adminRoleId) {
    (env as any).adminRoleId = String(adminRole._id);
  }
  if (!env.defaultUserRoleId) {
    (env as any).defaultUserRoleId = String(userRole._id);
  }

  const moduleActions: Record<string, string[]> = {
    roles: ['view', 'create', 'update', 'delete'],
    users: ['view', 'create', 'update', 'delete'],
    categories: ['view', 'create', 'update', 'delete'],
    products: ['view', 'create', 'update', 'delete'],
    services: ['view', 'create', 'update', 'delete'],
    quotations: ['view', 'update'],
    sales: ['view'],
    dashboard: ['view'],
    permissions: ['view'],
    visits: ['view'],
  };

  const permIds: string[] = [];
  for (const [module, actions] of Object.entries(moduleActions)) {
    for (const action of actions) {
      let perm = await PermissionModel.findOne({ module, action });
      if (!perm) perm = await PermissionModel.create({ module, action });
      permIds.push(String(perm._id));
    }
  }

  // Attach to Admin role if not present
  const current = new Set((adminRole.permissions as any[]).map((p: any) => String(p)));
  const toAdd = permIds.filter((id) => !current.has(id));
  if (toAdd.length > 0) {
    (adminRole.permissions as any[]).push(...toAdd as any);
    await adminRole.save();
  }
}


