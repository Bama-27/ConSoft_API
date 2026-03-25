import { Request, Response } from 'express';
import { OrderModel } from '../models/order.model';
import { createCrudController } from './crud.controller';
import { UserModel } from '../models/user.model';

const base = createCrudController(OrderModel);

export const SaleController = {
	...base,
	list: async (req: Request, res: Response) => {
		try {
			const page = Math.max(1, Number(req.query.page) || 1);
			const limit = Math.max(1, Number(req.query.limit) || 20);
			const skip = (page - 1) * limit;

			const filter: any = {};
			if (req.query.search) {
				const searchStr = String(req.query.search);
				const escapedSearch = searchStr.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
				const regex = new RegExp(escapedSearch, 'i');
				const userMatches = await UserModel.find({
					$or: [
						{ name: regex },
						{ document: regex },
						{ email: regex }
					]
				}).select('_id');
				const userIds = userMatches.map(u => u._id);
				filter.user = { $in: userIds };
			}

			// NOTA: Para filtrar por 'ventas' (restante == 0), necesitamos agregación 
			// o traer una cantidad mayor y filtrar. Dado que el usuario pidió endpoints paginados,
			// usaré una agregación simple para que sea eficiente.
			
			const aggregate = OrderModel.aggregate([
				{ $match: filter },
				{
					$addFields: {
						totalAmount: { $sum: "$items.valor" },
						totalPaid: { $sum: "$payments.amount" },
						// Sumar pago inicial si existe
						initialAmount: { $ifNull: ["$initialPayment.amount", 0] }
					}
				},
				{
					$addFields: {
						totalPaidSum: "$totalPaid"
					}
				},
				{
					$match: {
						$expr: { $gte: ["$totalPaidSum", "$totalAmount"] },
						totalAmount: { $gt: 0 } // Solo órdenes con items
					}
				}
			]);

			const [result, totalCountResult] = await Promise.all([
				OrderModel.aggregate([
					...aggregate.pipeline(),
					{ $sort: { createdAt: -1 } },
					{ $skip: skip },
					{ $limit: limit },
					{
						$lookup: {
							from: 'users',
							localField: 'user',
							foreignField: '_id',
							as: 'user'
						}
					},
					{ $unwind: "$user" },
					{ $project: { "user.password": 0, "user.__v": 0 } }
				]),
				OrderModel.aggregate([
					...aggregate.pipeline(),
					{ $count: "total" }
				])
			]);

			const total = totalCountResult[0]?.total || 0;
			const sales = result.map(order => {
				return {
					order,
					total: order.totalAmount,
					paid: order.totalPaidSum,
					restante: order.totalAmount - order.totalPaidSum,
					user: order.user
				};
			});

			return res.status(200).json({
				ok: true,
				sales,
				pagination: {
					page,
					limit,
					total,
					pages: Math.ceil(total / limit),
				},
			});
		} catch (error) {
			console.error('Error listing sales:', error);
			res.status(500).json({ error: 'Internal server error' });
		}
	},
};
