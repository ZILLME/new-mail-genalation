const SENT_STATUS_STORAGE_KEY = 'mail_sent_status';

/**
 * 送信済みメールアドレスのセットを取得
 */
export function getSentEmails(): Set<string> {
  if (typeof window !== 'undefined') {
    const stored = localStorage.getItem(SENT_STATUS_STORAGE_KEY);
    if (stored) {
      try {
        const emails = JSON.parse(stored) as string[];
        return new Set(emails.map((e: string) => e.toLowerCase()));
      } catch {
        return new Set<string>();
      }
    }
  }
  return new Set<string>();
}

/**
 * メールアドレスを送信済みとしてマーク
 */
export function markAsSent(email: string): void {
  if (typeof window !== 'undefined') {
    const sent = getSentEmails();
    sent.add(email.toLowerCase());
    localStorage.setItem(SENT_STATUS_STORAGE_KEY, JSON.stringify(Array.from(sent)));
  }
}

/**
 * メールアドレスの送信済み状態を解除
 */
export function markAsUnsent(email: string): void {
  if (typeof window !== 'undefined') {
    const sent = getSentEmails();
    sent.delete(email.toLowerCase());
    localStorage.setItem(SENT_STATUS_STORAGE_KEY, JSON.stringify(Array.from(sent)));
  }
}

/**
 * メールアドレスが送信済みかどうかを確認
 */
export function isSent(email: string): boolean {
  const sent = getSentEmails();
  return sent.has(email.toLowerCase());
}
