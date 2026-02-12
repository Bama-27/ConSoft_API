import { Request, Response } from 'express';
import { ChatMessageModel } from '../models/chatMessage.model';
import { QuotationModel } from '../models/quotation.model';
import { AuthRequest } from '../middlewares/auth.middleware';
import { DmMessageModel, buildParticipantsPair } from '../models/dmMessage.model';

export const ChatController = {
	listMessages: async (req: AuthRequest, res: Response) => {
		try {
			const userId = req.user?.id;
			if (!userId) return res.status(401).json({ message: 'Unauthorized' });
			const quotationId = req.params.quotationId;

			const quotation = await QuotationModel.findById(quotationId).select('user');
			if (!quotation) return res.status(404).json({ message: 'Quotation not found' });

			// Permitir al dueño; para admin, se puede proteger la ruta con verifyRole
			if (String(quotation.user) !== String(userId)) {
				// No es dueño; la ruta debería aplicar verifyRole aguas arriba si es admin
			}

			const messages = await ChatMessageModel.find({ quotation: quotationId })
				.sort({ sentAt: 1 })
				.populate('sender', 'name email');
			return res.json({ ok: true, messages });
		} catch (err) {
			return res.status(500).json({ error: 'Error getting messages' });
		}
	},
	// Listar mensajes directos (DM) entre el usuario autenticado y otro usuario
	listDmWithUser: async (req: AuthRequest, res: Response) => {
		try {
			const userId = req.user?.id;
			if (!userId) return res.status(401).json({ message: 'Unauthorized' });
			const otherUserId = String(req.params.userId || '').trim();
			if (!otherUserId) return res.status(400).json({ message: 'userId is required' });
			const participants = buildParticipantsPair(userId, otherUserId);
			const messages = await DmMessageModel.find({ participants })
				.sort({ sentAt: 1 })
				.populate('sender', 'name email');
			return res.json({ ok: true, messages });
		} catch (err) {
			return res.status(500).json({ error: 'Error getting direct messages' });
		}
	},
};


