"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.generateToken = generateToken;
exports.generateRefreshToken = generateRefreshToken;
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const env_1 = require("../config/env");
function generateToken(payload, expiresIn = '30m') {
    return jsonwebtoken_1.default.sign(payload, env_1.env.jwt_secret, { expiresIn });
}
function generateRefreshToken(payload, expiresIn = '1d') {
    return jsonwebtoken_1.default.sign({ ...payload, purpose: 'refresh' }, env_1.env.jwt_secret, { expiresIn });
}
