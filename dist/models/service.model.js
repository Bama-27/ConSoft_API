"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ServiceModel = void 0;
const mongoose_1 = require("mongoose");
const ServiceSchema = new mongoose_1.Schema({
    name: { type: String, required: true, trim: true },
    description: { type: String, trim: true },
    imageUrl: { type: String, trim: true },
    status: { type: Boolean, default: true },
});
// Índices sugeridos para búsquedas
ServiceSchema.index({ name: 1 });
ServiceSchema.index({ status: 1 });
exports.ServiceModel = (0, mongoose_1.model)('Servicio', ServiceSchema);
