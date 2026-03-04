import { Schema, model, Types } from 'mongoose';

export interface IRefreshToken {
	userId: Types.ObjectId;
	token: string;
	expiresAt: Date;
	createdAt: Date;
	revoked: boolean;
}

const RefreshTokenSchema = new Schema<IRefreshToken>({
	userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
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

export const RefreshTokenModel = model<IRefreshToken>('RefreshToken', RefreshTokenSchema);
