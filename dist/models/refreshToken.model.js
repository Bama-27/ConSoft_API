"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.RefreshTokenModel = void 0;
const mongoose_1 = require("mongoose");
const RefreshTokenSchema = new mongoose_1.Schema({
    userId: { type: mongoose_1.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    token: { type: String, required: true, unique: true },
    expiresAt: { type: Date, required: true, index: true },
    createdAt: { type: Date, default: () => new Date() },
    revoked: { type: Boolean, default: false, index: true },
});
// Índice compuesto para búsquedas eficientes
RefreshTokenSchema.index({ userId: 1, revoked: 1 });
RefreshTokenSchema.index({ token: 1, revoked: 1 });
// TTL index para auto-eliminar tokens expirados después de 30 días
RefreshTokenSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 30 * 24 * 60 * 60 });
exports.RefreshTokenModel = (0, mongoose_1.model)('RefreshToken', RefreshTokenSchema);
