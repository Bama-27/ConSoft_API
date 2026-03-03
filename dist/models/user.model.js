"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.UserModel = void 0;
const mongoose_1 = require("mongoose");
const UserSchema = new mongoose_1.Schema({
    name: { type: String, required: true, trim: true },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    profile_picture: { type: String },
    password: { type: String, required: true },
    document: { type: String, trim: true },
    address: { type: String, trim: true },
    phone: { type: String, trim: true },
    role: { type: mongoose_1.Types.ObjectId, ref: 'Role', required: true },
    status: { type: Boolean, default: true },
    registeredAt: { type: Date, default: () => new Date() },
    favorites: [{ type: mongoose_1.Types.ObjectId, ref: 'Producto' }],
});
// Índices útiles
UserSchema.index({ role: 1 });
exports.UserModel = (0, mongoose_1.model)('User', UserSchema);
