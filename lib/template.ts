const TEMPLATE_STORAGE_KEY = 'mail_template';

export interface Template {
  subject: string;
  body: string;
}

/**
 * テンプレートをlocalStorageに保存
 */
export function saveTemplate(template: Template): void {
  if (typeof window !== 'undefined') {
    localStorage.setItem(TEMPLATE_STORAGE_KEY, JSON.stringify(template));
  }
}

/**
 * localStorageからテンプレートを読み込み
 */
export function loadTemplate(): Template | null {
  if (typeof window !== 'undefined') {
    const stored = localStorage.getItem(TEMPLATE_STORAGE_KEY);
    if (stored) {
      try {
        return JSON.parse(stored);
      } catch {
        return null;
      }
    }
  }
  return null;
}

/**
 * テンプレートに値を差し込む
 */
export function applyTemplate(
  template: Template,
  values: {
    email?: string;
    name?: string;
  }
): Template {
  let subject = template.subject;
  let body = template.body;

  // {{email}} を置換
  if (values.email) {
    subject = subject.replace(/\{\{email\}\}/g, values.email);
    body = body.replace(/\{\{email\}\}/g, values.email);
  }

  // {{name}} を置換（無ければ空文字）
  const name = values.name || '';
  subject = subject.replace(/\{\{name\}\}/g, name);
  body = body.replace(/\{\{name\}\}/g, name);

  return { subject, body };
}
