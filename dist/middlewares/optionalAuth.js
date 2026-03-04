"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.optionalAuth = void 0;
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const env_1 = require("../config/env");
const optionalAuth = (req, res, next) => {
    try {
        const secret = env_1.env.jwt_secret;
        const token = req.cookies?.token;
        if (!token) {
            req.user = undefined;
            return next();
        }
        try {
            const decoded = jsonwebtoken_1.default.verify(token, secret);
            req.user = decoded;
            return next();
        }
        catch {
            req.user = undefined;
            return next();
        }
    }
    catch {
        req.user = undefined;
        next();
    }
};
exports.optionalAuth = optionalAuth;
