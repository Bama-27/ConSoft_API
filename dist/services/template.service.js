"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.templateService = void 0;
const promises_1 = require("fs/promises");
const path_1 = __importDefault(require("path"));
class TemplateService {
    constructor() {
        this.cache = new Map();
    }
    async loadTemplate(templateName) {
        if (this.cache.has(templateName)) {
            return this.cache.get(templateName);
        }
        const filePath = path_1.default.join(process.cwd(), 'src', 'templates', `${templateName}.html`);
        const content = await (0, promises_1.readFile)(filePath, 'utf-8');
        this.cache.set(templateName, content);
        return content;
    }
    compile(template, variables) {
        let compiled = template;
        for (const key in variables) {
            const value = variables[key] ?? '';
            const regex = new RegExp(`{{${key}}}`, 'g');
            compiled = compiled.replace(regex, String(value));
        }
        return compiled;
    }
    async render(templateName, variables) {
        const template = await this.loadTemplate(templateName);
        return this.compile(template, variables);
    }
}
exports.templateService = new TemplateService();
