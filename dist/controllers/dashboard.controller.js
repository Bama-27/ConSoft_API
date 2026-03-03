"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.DashboardController = void 0;
const order_model_1 = require("../models/order.model");
const user_model_1 = require("../models/user.model");
function parseDate(value) {
    if (value == null)
        return null;
    const d = new Date(String(value));
    return Number.isNaN(d.getTime()) ? null : d;
}
function startOfDay(d) {
    return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0, 0, 0);
}
function addDays(d, days) {
    const out = new Date(d);
    out.setDate(out.getDate() + days);
    return out;
}
function startOfMonth(d) {
    return new Date(d.getFullYear(), d.getMonth(), 1, 0, 0, 0, 0);
}
function addMonths(d, months) {
    return new Date(d.getFullYear(), d.getMonth() + months, 1, 0, 0, 0, 0);
}
function parsePeriod(value) {
    const v = String(value ?? '').toLowerCase().trim();
    if (v === 'month' || v === 'quarter' || v === 'semester' || v === 'year')
        return v;
    return null;
}
function getQuarterStart(d) {
    const qStartMonth = Math.floor(d.getMonth() / 3) * 3;
    return new Date(d.getFullYear(), qStartMonth, 1, 0, 0, 0, 0);
}
function getSemesterStart(d) {
    const sStartMonth = d.getMonth() < 6 ? 0 : 6;
    return new Date(d.getFullYear(), sStartMonth, 1, 0, 0, 0, 0);
}
function getYearStart(d) {
    return new Date(d.getFullYear(), 0, 1, 0, 0, 0, 0);
}
function getPeriodRanges(now, period) {
    // current: current period-to-date
    // previous: previous complete period
    if (period === 'month') {
        const currentFrom = startOfMonth(now);
        const previousFrom = addMonths(currentFrom, -1);
        const previousTo = addDays(currentFrom, -1);
        return {
            current: { from: startOfDay(currentFrom), to: startOfDay(now) },
            previous: { from: startOfDay(previousFrom), to: startOfDay(previousTo) },
        };
    }
    if (period === 'quarter') {
        const currentFrom = getQuarterStart(now);
        const previousFrom = addMonths(currentFrom, -3);
        const previousTo = addDays(currentFrom, -1);
        return {
            current: { from: startOfDay(currentFrom), to: startOfDay(now) },
            previous: { from: startOfDay(previousFrom), to: startOfDay(previousTo) },
        };
    }
    if (period === 'semester') {
        const currentFrom = getSemesterStart(now);
        const previousFrom = addMonths(currentFrom, -6);
        const previousTo = addDays(currentFrom, -1);
        return {
            current: { from: startOfDay(currentFrom), to: startOfDay(now) },
            previous: { from: startOfDay(previousFrom), to: startOfDay(previousTo) },
        };
    }
    // year
    const currentFrom = getYearStart(now);
    const previousFrom = new Date(now.getFullYear() - 1, 0, 1, 0, 0, 0, 0);
    const previousTo = new Date(now.getFullYear() - 1, 11, 31, 0, 0, 0, 0);
    return {
        current: { from: startOfDay(currentFrom), to: startOfDay(now) },
        previous: { from: startOfDay(previousFrom), to: startOfDay(previousTo) },
    };
}
function formatMonthKey(year, month1to12) {
    return `${year}-${String(month1to12).padStart(2, '0')}`;
}
function monthKeyFromDate(d) {
    return formatMonthKey(d.getFullYear(), d.getMonth() + 1);
}
function monthKeysBetween(from, to) {
    const keys = [];
    let cur = new Date(from.getFullYear(), from.getMonth(), 1);
    const end = new Date(to.getFullYear(), to.getMonth(), 1);
    while (cur <= end) {
        keys.push(monthKeyFromDate(cur));
        cur = new Date(cur.getFullYear(), cur.getMonth() + 1, 1);
    }
    return keys;
}
function toQuarterKey(monthKey) {
    const [y, m] = monthKey.split('-');
    const month = Number(m);
    const q = Math.floor((month - 1) / 3) + 1;
    return `${y}-Q${q}`;
}
function toSemesterKey(monthKey) {
    const [y, m] = monthKey.split('-');
    const month = Number(m);
    const s = month <= 6 ? 1 : 2;
    return `${y}-S${s}`;
}
exports.DashboardController = {
    get: async (req, res) => {
        try {
            const rawFrom = parseDate(req.query.from ?? req.query.startDate);
            const rawTo = parseDate(req.query.to ?? req.query.endDate);
            const period = parsePeriod(req.query.period);
            const compare = String(req.query.compare ?? 'true').toLowerCase() !== 'false';
            const now = new Date();
            const limit = Math.min(Math.max(Number(req.query.limit ?? 10) || 10, 1), 50);
            const compute = async (from, to) => {
                if (from > to) {
                    const err = new Error('Invalid range: from must be <= to');
                    err.status = 400;
                    throw err;
                }
                const toExclusive = addDays(to, 1);
                const APPROVED = ['aprobado', 'confirmado'];
                const paidOrdersMatch = {
                    startedAt: { $gte: from, $lt: toExclusive },
                };
                const monthlyAgg = await order_model_1.OrderModel.aggregate([
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
                    {
                        $group: {
                            _id: {
                                year: { $year: '$startedAt' },
                                month: { $month: '$startedAt' },
                            },
                            revenue: { $sum: '$paid' },
                            sales: {
                                $sum: {
                                    $cond: [{ $gte: ['$paid', '$total'] }, 1, 0]
                                }
                            },
                        },
                    },
                    { $sort: { '_id.year': 1, '_id.month': 1 } },
                ]);
                const monthlyMap = new Map();
                for (const row of monthlyAgg) {
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
                const quarterlyMap = new Map();
                const semiMap = new Map();
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
                const usersCount = await user_model_1.UserModel.countDocuments({
                    registeredAt: { $gte: from, $lt: toExclusive },
                });
                const totalsAgg = await order_model_1.OrderModel.aggregate([
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
                    {
                        $group: {
                            _id: null,
                            totalRevenue: { $sum: '$paid' },
                            totalSales: {
                                $sum: {
                                    $cond: [{ $gte: ['$paid', '$total'] }, 1, 0]
                                }
                            },
                        },
                    },
                ]);
                const totals = totalsAgg?.[0] ?? { totalRevenue: 0, totalSales: 0 };
                const topProductsAgg = await order_model_1.OrderModel.aggregate([
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
                const topServicesAgg = await order_model_1.OrderModel.aggregate([
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
                return {
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
                };
            };
            // Override manual range has priority
            if (rawFrom || rawTo) {
                const from = startOfDay(rawFrom ?? new Date(now.getFullYear(), now.getMonth() - 11, 1));
                const to = startOfDay(rawTo ?? now);
                const data = await compute(from, to);
                return res.json({ ok: true, ...data });
            }
            // Period mode: return standardized previous period and optional comparison
            if (period) {
                const ranges = getPeriodRanges(now, period);
                const previous = await compute(ranges.previous.from, ranges.previous.to);
                if (!compare) {
                    return res.json({ ok: true, mode: 'period', period, previous });
                }
                const current = await compute(ranges.current.from, ranges.current.to);
                return res.json({ ok: true, mode: 'period', period, previous, current });
            }
            // Default behavior (last 12 months)
            const from = startOfDay(new Date(now.getFullYear(), now.getMonth() - 11, 1));
            const to = startOfDay(now);
            const data = await compute(from, to);
            return res.json({ ok: true, ...data });
        }
        catch (error) {
            const err = error;
            if (err?.status === 400) {
                return res.status(400).json({ message: err.message });
            }
            console.error(error);
            return res.status(500).json({ message: 'Internal server error' });
        }
    },
};
