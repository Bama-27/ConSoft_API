"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createCrudController = createCrudController;
function createCrudController(model) {
    return {
        list: async (req, res) => {
            const page = Math.max(1, Number(req.query.page ?? 1));
            const limit = Math.min(100, Math.max(1, Number(req.query.limit ?? 20)));
            const skip = (page - 1) * limit;
            const sort = req.query.sort ?? '-_id';
            const [items, total] = await Promise.all([
                model.find().sort(sort).skip(skip).limit(limit).lean(),
                model.countDocuments(),
            ]);
            res.json({ ok: true, data: items, pagination: { page, limit, total, pages: Math.ceil(total / limit) } });
        },
        get: async (req, res) => {
            const item = await model.findById(req.params.id).lean();
            if (!item)
                return res.status(404).json({ message: 'Not found' });
            res.json({ ok: true, data: item });
        },
        create: async (req, res) => {
            const item = await model.create(req.body);
            res.status(201).json({ ok: true, data: item });
        },
        update: async (req, res) => {
            const item = await model.findByIdAndUpdate(req.params.id, req.body, { new: true }).lean();
            if (!item)
                return res.status(404).json({ message: 'Not found' });
            res.json({ ok: true, data: item });
        },
        remove: async (req, res) => {
            const item = await model.findByIdAndDelete(req.params.id);
            if (!item)
                return res.status(404).json({ message: 'Not found' });
            res.status(204).send();
        },
    };
}
