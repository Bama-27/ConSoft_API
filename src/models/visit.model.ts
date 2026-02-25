// models/Visit.ts
import { Schema, model, Types } from 'mongoose';
import type { IUser } from '../types/interfaces';
interface IGuestInfo {
	name: string;
	email: string;
	phone: string;
}

export interface IVisit {
	user?: Types.ObjectId | IUser; 
	visitDate: Date;
	visitTime?: string; 
	address: string;
	status: string;
	services: Types.ObjectId[];
	description?: string; 
	isGuest?: boolean; 
	guestInfo?: IGuestInfo;
	createdAt: Date;
	updatedAt: Date;
}

const guestInfoSchema = new Schema(
	{
		name: String,
		email: String,
		phone: String,
	},
	{ _id: false },
);



const visitSchema = new Schema<IVisit>(
	{
		user: {
			type: Schema.Types.ObjectId,
			ref: 'User',
			required: false, // ✅ Ya no es obligatorio
		},
		visitDate: {
			type: Date,
			required: true,
		},
		visitTime: {
			type: String,
			required: false,
		},
		address: {
			type: String,
			required: true,
			trim: true,
		},
		status: {
			type: String,
			enum: ['pendiente', 'confirmada', 'en_progreso', 'completada', 'cancelada'],
			default: 'pendiente',
		},
		description: {
			type: String,
			trim: true,
		},
		isGuest: {
			type: Boolean,
			default: false,
		},
		guestInfo: {
			type: guestInfoSchema,
			required: false,
		},
	},
	{
		timestamps: true,
	},
);

visitSchema.pre('validate', function (next) {
	const visit = this as IVisit;

	// caso invitado
	if (visit.isGuest) {
		if (!visit.guestInfo?.name || !visit.guestInfo?.email || !visit.guestInfo?.phone) {
			return next(new Error('Guest info is required when isGuest=true'));
		}
		visit.user = undefined;
	}
	// caso usuario logueado
	else {
		if (!visit.user) {
			return next(new Error('User is required when isGuest=false'));
		}
		visit.guestInfo = undefined;
	}

	next();
});

// ✅ Índices para optimizar búsquedas
visitSchema.index({ visitDate: 1 });
visitSchema.index({ user: 1 });
visitSchema.index({ 'guestInfo.email': 1 });
visitSchema.index({ status: 1 });

export const VisitModel = model<IVisit>('Visit', visitSchema);
