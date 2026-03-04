"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ensureCoreData = ensureCoreData;
const role_model_1 = require("../models/role.model");
const permission_model_1 = require("../models/permission.model");
const env_1 = require("./env");
async function ensureCoreData() {
    const ADMIN_NAME = 'Administrador';
    const USER_NAME = 'Usuario';
    // Ensure Admin role
    let adminRole = await role_model_1.RoleModel.findOne({ name: ADMIN_NAME });
    if (!adminRole) {
        adminRole = await role_model_1.RoleModel.create({ name: ADMIN_NAME, description: 'Administrador del sistema' });
    }
    // Ensure User role
    let userRole = await role_model_1.RoleModel.findOne({ name: USER_NAME });
    if (!userRole) {
        userRole = await role_model_1.RoleModel.create({ name: USER_NAME, description: 'Usuario estándar' });
    }
    // Populate runtime defaults if not provided via env
    if (!env_1.env.adminRoleId) {
        env_1.env.adminRoleId = String(adminRole._id);
    }
    if (!env_1.env.defaultUserRoleId) {
        env_1.env.defaultUserRoleId = String(userRole._id);
    }
    const moduleActions = {
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
    const permIds = [];
    for (const [module, actions] of Object.entries(moduleActions)) {
        for (const action of actions) {
            let perm = await permission_model_1.PermissionModel.findOne({ module, action });
            if (!perm)
                perm = await permission_model_1.PermissionModel.create({ module, action });
            permIds.push(String(perm._id));
        }
    }
    // Attach to Admin role if not present
    const current = new Set(adminRole.permissions.map((p) => String(p)));
    const toAdd = permIds.filter((id) => !current.has(id));
    if (toAdd.length > 0) {
        adminRole.permissions.push(...toAdd);
        await adminRole.save();
    }
}
