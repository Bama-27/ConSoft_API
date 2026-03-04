"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.VisitModel = void 0;
// models/Visit.ts
const mongoose_1 = require("mongoose");
const guestInfoSchema = new mongoose_1.Schema({
    name: String,
    email: String,
    phone: String,
}, { _id: false });
const visitSchema = new mongoose_1.Schema({
    user: {
        type: mongoose_1.Schema.Types.ObjectId,
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
}, {
    timestamps: true,
});
visitSchema.pre('validate', function (next) {
    const visit = this;
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
exports.VisitModel = (0, mongoose_1.model)('Visit', visitSchema);
