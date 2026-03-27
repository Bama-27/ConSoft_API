import { Model } from 'mongoose';
import { Request, Response } from 'express';

export function createCrudController<T>(model: Model<T>) {
  return {
    list: async (req: Request, res: Response) => {
      const page = Math.max(1, Number((req.query.page as string) ?? 1));
      const limit = Math.min(100, Math.max(1, Number((req.query.limit as string) ?? 20)));
      const skip = (page - 1) * limit;
      const sort = (req.query.sort as string) ?? '-_id';
      
      const filter: any = {};
      if (req.query.search) {
        const searchStr = String(req.query.search);
        const escapedSearch = searchStr.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const regex = new RegExp(escapedSearch, 'i');
        
        const orConditions: any[] = [
          { name: regex },
          { description: regex }
        ];
        
        // If it's a valid hex string, search by _id (partial or full)
        if (searchStr.match(/^[0-9a-fA-F]+$/)) {
          orConditions.push({
            $expr: {
              $gt: [
                { $indexOfCP: [{ $toLower: { $toString: '$_id' } }, searchStr.toLowerCase()] },
                -1
              ]
            }
          });
        }
        
        filter.$or = orConditions;
      }

      const [items, total] = await Promise.all([
        model.find(filter).sort(sort).skip(skip).limit(limit).lean(),
        model.countDocuments(filter),
      ]);
      res.json({ ok: true, data: items, pagination: { page, limit, total, pages: Math.ceil(total / limit) } });
    },
    get: async (req: Request, res: Response) => {
      const item = await model.findById(req.params.id).lean();
      if (!item) return res.status(404).json({ message: 'Not found' });
      res.json({ ok: true, data: item });
    },
    create: async (req: Request, res: Response) => {
      const item = await model.create(req.body);
      res.status(201).json({ ok: true, data: item });
    },
    update: async (req: Request, res: Response) => {
      const item = await model.findByIdAndUpdate(req.params.id, req.body, { new: true }).lean();
      if (!item) return res.status(404).json({ message: 'Not found' });
      res.json({ ok: true, data: item });
    },
    remove: async (req: Request, res: Response) => {
      const item = await model.findByIdAndDelete(req.params.id);
      if (!item) return res.status(404).json({ message: 'Not found' });
      res.status(204).send();
    },
  };
}





