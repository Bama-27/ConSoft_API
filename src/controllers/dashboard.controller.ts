import { Request, Response } from 'express';
import { OrderModel } from '../models/order.model';
import { UserModel } from '../models/user.model';

function parseDate(value: unknown): Date | null {
	if (value == null) return null;
	const d = new Date(String(value));
	return Number.isNaN(d.getTime()) ? null : d;
}

function startOfDay(d: Date): Date {
	return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0, 0, 0);
}

function addDays(d: Date, days: number): Date {
	const out = new Date(d);
	out.setDate(out.getDate() + days);
	return out;
}

function formatMonthKey(year: number, month1to12: number): string {
	return `${year}-${String(month1to12).padStart(2, '0')}`;
}

function monthKeyFromDate(d: Date): string {
	return formatMonthKey(d.getFullYear(), d.getMonth() + 1);
}

function monthKeysBetween(from: Date, to: Date): string[] {
	const keys: string[] = [];
	let cur = new Date(from.getFullYear(), from.getMonth(), 1);
	const end = new Date(to.getFullYear(), to.getMonth(), 1);
	while (cur <= end) {
		keys.push(monthKeyFromDate(cur));
		cur = new Date(cur.getFullYear(), cur.getMonth() + 1, 1);
	}
	return keys;
}

function toQuarterKey(monthKey: string): string {
	const [y, m] = monthKey.split('-');
	const month = Number(m);
	const q = Math.floor((month - 1) / 3) + 1;
	return `${y}-Q${q}`;
}

function toSemesterKey(monthKey: string): string {
	const [y, m] = monthKey.split('-');
	const month = Number(m);
	const s = month <= 6 ? 1 : 2;
	return `${y}-S${s}`;
}

export const DashboardController = {
	get: async (req: Request, res: Response) => {
		try {
			const rawFrom = parseDate((req.query as any).from ?? (req.query as any).startDate);
			const rawTo = parseDate((req.query as any).to ?? (req.query as any).endDate);

			const now = new Date();
			const from = startOfDay(rawFrom ?? new Date(now.getFullYear(), now.getMonth() - 11, 1));
			const to = startOfDay(rawTo ?? now);
			if (from > to) {
				return res.status(400).json({ message: 'Invalid range: from must be <= to' });
			}
			const toExclusive = addDays(to, 1);

			const APPROVED = ['aprobado', 'confirmado'];
			const paidOrdersMatch: any = {
				startedAt: { $gte: from, $lt: toExclusive },
			};

			const monthlyAgg = await OrderModel.aggregate([
				{ $match: paidOrdersMatch },
				{
					$addFields: {
						total: {
							$sum: {
								$map: {
									input: '$items',
									as: 'it',
									in: { $ifNull: ['$$it.valor', 0] },
								},
							},
						},
						paid: {
							$sum: {
								$map: {
									input: {
										$filter: {
											input: '$payments',
											as: 'p',
											cond: {
												$in: [
													{ $toLower: { $ifNull: ['$$p.status', ''] } },
													APPROVED,
												],
											},
										},
									},
									as: 'ap',
									in: { $ifNull: ['$$ap.amount', 0] },
								},
							},
						},
					},
				},
				{ $match: { $expr: { $gte: ['$paid', '$total'] } } },
				{
					$group: {
						_id: {
							year: { $year: '$startedAt' },
							month: { $month: '$startedAt' },
						},
						revenue: { $sum: '$total' },
						sales: { $sum: 1 },
					},
				},
				{ $sort: { '_id.year': 1, '_id.month': 1 } },
			]);

			const monthlyMap = new Map<string, { revenue: number; sales: number }>();
			for (const row of monthlyAgg as any[]) {
				const key = formatMonthKey(row._id.year, row._id.month);
				monthlyMap.set(key, {
					revenue: Number(row.revenue ?? 0),
					sales: Number(row.sales ?? 0),
				});
			}

			const months = monthKeysBetween(from, to);
			const monthly = months.map((key) => {
				const v = monthlyMap.get(key) ?? { revenue: 0, sales: 0 };
				return { period: key, revenue: v.revenue, sales: v.sales };
			});

			const quarterlyMap = new Map<string, { revenue: number; sales: number }>();
			const semiMap = new Map<string, { revenue: number; sales: number }>();
			for (const m of monthly) {
				const q = toQuarterKey(m.period);
				const s = toSemesterKey(m.period);
				quarterlyMap.set(q, {
					revenue: (quarterlyMap.get(q)?.revenue ?? 0) + m.revenue,
					sales: (quarterlyMap.get(q)?.sales ?? 0) + m.sales,
				});
				semiMap.set(s, {
					revenue: (semiMap.get(s)?.revenue ?? 0) + m.revenue,
					sales: (semiMap.get(s)?.sales ?? 0) + m.sales,
				});
			}

			const quarterly = Array.from(quarterlyMap.entries())
				.sort(([a], [b]) => a.localeCompare(b))
				.map(([period, v]) => ({ period, revenue: v.revenue, sales: v.sales }));

			const semiannual = Array.from(semiMap.entries())
				.sort(([a], [b]) => a.localeCompare(b))
				.map(([period, v]) => ({ period, revenue: v.revenue, sales: v.sales }));

			const usersCount = await UserModel.countDocuments({
				registeredAt: { $gte: from, $lt: toExclusive },
			});

			const totalsAgg = await OrderModel.aggregate([
				{ $match: paidOrdersMatch },
				{
					$addFields: {
						total: {
							$sum: {
								$map: {
									input: '$items',
									as: 'it',
									in: { $ifNull: ['$$it.valor', 0] },
								},
							},
						},
						paid: {
							$sum: {
								$map: {
									input: {
										$filter: {
											input: '$payments',
											as: 'p',
											cond: {
												$in: [
													{ $toLower: { $ifNull: ['$$p.status', ''] } },
													APPROVED,
												],
											},
										},
									},
									as: 'ap',
									in: { $ifNull: ['$$ap.amount', 0] },
								},
							},
						},
					},
				},
				{ $match: { $expr: { $gte: ['$paid', '$total'] } } },
				{
					$group: {
						_id: null,
						totalRevenue: { $sum: '$total' },
						totalSales: { $sum: 1 },
					},
				},
			]);
			const totals = (totalsAgg?.[0] as any) ?? { totalRevenue: 0, totalSales: 0 };

			const limit = Math.min(Math.max(Number((req.query as any).limit ?? 10) || 10, 1), 50);

			const topProductsAgg = await OrderModel.aggregate([
				{ $match: paidOrdersMatch },
				{ $unwind: '$items' },
				{ $match: { 'items.tipo': 'producto', 'items.id_producto': { $ne: null } } },
				{
					$group: {
						_id: '$items.id_producto',
						quantity: { $sum: { $ifNull: ['$items.cantidad', 1] } },
					},
				},
				{ $sort: { quantity: -1 } },
				{ $limit: limit },
				{
					$lookup: {
						from: 'productos',
						localField: '_id',
						foreignField: '_id',
						as: 'product',
					},
				},
				{ $unwind: { path: '$product', preserveNullAndEmptyArrays: true } },
				{
					$project: {
						_id: 0,
						id: '$_id',
						name: '$product.name',
						quantity: 1,
					},
				},
			]);

			const topServicesAgg = await OrderModel.aggregate([
				{ $match: paidOrdersMatch },
				{ $unwind: '$items' },
				{ $match: { 'items.tipo': 'servicio', 'items.id_servicio': { $ne: null } } },
				{
					$group: {
						_id: '$items.id_servicio',
						quantity: { $sum: { $ifNull: ['$items.cantidad', 1] } },
					},
				},
				{ $sort: { quantity: -1 } },
				{ $limit: limit },
				{
					$lookup: {
						from: 'servicios',
						localField: '_id',
						foreignField: '_id',
						as: 'service',
					},
				},
				{ $unwind: { path: '$service', preserveNullAndEmptyArrays: true } },
				{
					$project: {
						_id: 0,
						id: '$_id',
						name: '$service.name',
						quantity: 1,
					},
				},
			]);

			return res.json({
				ok: true,
				range: { from: from.toISOString(), to: to.toISOString() },
				summary: {
					totalRevenue: Number(totals.totalRevenue ?? 0),
					totalSales: Number(totals.totalSales ?? 0),
					totalUsers: Number(usersCount ?? 0),
				},
				series: {
					monthly,
					quarterly,
					semiannual,
				},
				topItems: {
					products: topProductsAgg,
					services: topServicesAgg,
				},
			});
		} catch (error) {
			console.error(error);
			return res.status(500).json({ message: 'Internal server error' });
		}
	},
};
