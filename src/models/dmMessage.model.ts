import { Schema, model, Types } from 'mongoose';

const DmMessageSchema = new Schema(
	{
		participants: {
			type: [{ type: Types.ObjectId, ref: 'User', required: true }],
			validate: {
				validator: (arr: any[]) => Array.isArray(arr) && arr.length === 2,
				message: 'participants must contain exactly two user ids',
			},
			index: true,
		},
		sender: { type: Types.ObjectId, ref: 'User', required: true, index: true },
		message: { type: String, required: true, trim: true },
		sentAt: { type: Date, default: () => new Date(), index: true },
	},
	{ timestamps: false, collection: 'dm_messages' }
);

// Index to speed up conversation queries by participants pair and time
DmMessageSchema.index({ 'participants.0': 1, 'participants.1': 1, sentAt: 1 });

export const DmMessageModel = model('DmMessage', DmMessageSchema);

export function buildParticipantsPair(a: string | Types.ObjectId, b: string | Types.ObjectId): [Types.ObjectId, Types.ObjectId] {
	const aId = new Types.ObjectId(String(a));
	const bId = new Types.ObjectId(String(b));
	return String(aId) < String(bId) ? [aId, bId] : [bId, aId];
}





