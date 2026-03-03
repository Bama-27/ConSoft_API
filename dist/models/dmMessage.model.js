"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.DmMessageModel = void 0;
exports.buildParticipantsPair = buildParticipantsPair;
const mongoose_1 = require("mongoose");
const DmMessageSchema = new mongoose_1.Schema({
    participants: {
        type: [{ type: mongoose_1.Types.ObjectId, ref: 'User', required: true }],
        validate: {
            validator: (arr) => Array.isArray(arr) && arr.length === 2,
            message: 'participants must contain exactly two user ids',
        },
        index: true,
    },
    sender: { type: mongoose_1.Types.ObjectId, ref: 'User', required: true, index: true },
    message: { type: String, required: true, trim: true },
    sentAt: { type: Date, default: () => new Date(), index: true },
}, { timestamps: false, collection: 'dm_messages' });
// Index to speed up conversation queries by participants pair and time
DmMessageSchema.index({ 'participants.0': 1, 'participants.1': 1, sentAt: 1 });
exports.DmMessageModel = (0, mongoose_1.model)('DmMessage', DmMessageSchema);
function buildParticipantsPair(a, b) {
    const aId = new mongoose_1.Types.ObjectId(String(a));
    const bId = new mongoose_1.Types.ObjectId(String(b));
    return String(aId) < String(bId) ? [aId, bId] : [bId, aId];
}
