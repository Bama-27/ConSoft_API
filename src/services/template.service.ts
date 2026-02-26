import { readFile } from 'fs/promises';
import path from 'path';

type TemplateVariables = Record<string, string | number | undefined>;

class TemplateService {
  private cache = new Map<string, string>();

  private async loadTemplate(templateName: string): Promise<string> {
    if (this.cache.has(templateName)) {
      return this.cache.get(templateName)!;
    }

    const filePath = path.join(
      process.cwd(),
      'src',
      'templates',
      `${templateName}.html`
    );

    const content = await readFile(filePath, 'utf-8');

    this.cache.set(templateName, content);

    return content;
  }

  private compile(template: string, variables: TemplateVariables): string {
    let compiled = template;

    for (const key in variables) {
      const value = variables[key] ?? '';
      const regex = new RegExp(`{{${key}}}`, 'g');
      compiled = compiled.replace(regex, String(value));
    }

    return compiled;
  }

  async render(
    templateName: string,
    variables: TemplateVariables
  ): Promise<string> {
    const template = await this.loadTemplate(templateName);
    return this.compile(template, variables);
  }
}

export const templateService = new TemplateService();