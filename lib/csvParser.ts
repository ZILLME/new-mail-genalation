import Papa from 'papaparse';

export interface ParsedRow {
  [key: string]: string;
}

export interface EmailExtractionResult {
  emails: string[];
  detectedColumn: string | null;
  stats: {
    total: number;
    valid: number;
    invalid: number;
    duplicates: number;
    empty: number;
  };
}

/**
 * メールアドレスの正規表現
 */
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * メールアドレスかどうかを判定
 */
function isValidEmail(email: string): boolean {
  return EMAIL_REGEX.test(email.trim());
}

/**
 * 列内のメール形式の値の数をカウント
 */
function countEmailLikeValues(column: string, data: ParsedRow[]): number {
  let count = 0;
  for (const row of data) {
    const rawValue = row[column];
    const value = typeof rawValue === 'string' ? rawValue.trim() : '';
    if (value && isValidEmail(value)) {
      count++;
    }
  }
  return count;
}

/**
 * CSVからメール列を検出
 */
function detectEmailColumn(headers: string[], data: ParsedRow[]): string | null {
  // 優先順位1: "E-mail 1 - Value"
  const exactMatch = headers.find(h => h === 'E-mail 1 - Value');
  if (exactMatch) {
    return exactMatch;
  }

  // 優先順位2: "E-mail" かつ "Value" を含む列
  const emailValueMatch = headers.find(h => 
    h.toLowerCase().includes('e-mail') && h.toLowerCase().includes('value')
  );
  if (emailValueMatch) {
    return emailValueMatch;
  }

  // 優先順位3: 全セルを走査してメール形式が最も多い列
  let bestColumn: string | null = null;
  let maxEmailCount = 0;

  for (const header of headers) {
    const emailCount = countEmailLikeValues(header, data);
    if (emailCount > maxEmailCount) {
      maxEmailCount = emailCount;
      bestColumn = header;
    }
  }

  if (bestColumn && maxEmailCount > 0) {
    return bestColumn;
  }

  return null;
}

/**
 * 列からメールアドレスを抽出（バリデーション済み）
 */
function extractEmailsFromColumn(column: string | null, data: ParsedRow[]): string[] {
  if (!column) {
    return [];
  }

  const emails: string[] = [];
  for (const row of data) {
    const rawValue = row[column];
    const value = typeof rawValue === 'string' ? rawValue.trim() : '';
    if (value && isValidEmail(value)) {
      emails.push(value.toLowerCase());
    }
  }
  return emails;
}

/**
 * 列から生の値を取得（統計計算用）
 */
function extractRawValuesFromColumn(column: string | null, data: ParsedRow[]): string[] {
  if (!column) {
    return [];
  }

  const values: string[] = [];
  for (const row of data) {
    const rawValue = row[column];
    const value = typeof rawValue === 'string' ? rawValue.trim() : '';
    if (value) {
      values.push(value);
    }
  }
  return values;
}

/**
 * 全セルからメールアドレスを抽出（フォールバック）
 */
function extractEmailsFromAllCells(data: ParsedRow[]): string[] {
  const emails: string[] = [];
  const seen = new Set<string>();

  for (const row of data) {
    for (const value of Object.values(row)) {
      const trimmed = typeof value === 'string' ? value.trim() : '';
      if (trimmed && isValidEmail(trimmed)) {
        const lower = trimmed.toLowerCase();
        if (!seen.has(lower)) {
          seen.add(lower);
          emails.push(lower);
        }
      }
    }
  }

  return emails;
}

/**
 * CSVファイルをパースしてメールアドレスを抽出
 */
export async function parseCSVAndExtractEmails(
  file: File,
  options: {
    removeDuplicates?: boolean;
    removeInvalid?: boolean;
  } = {}
): Promise<EmailExtractionResult> {
  const { removeDuplicates = true, removeInvalid = true } = options;

  return new Promise((resolve, reject) => {
    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: (results) => {
        try {
          const data = results.data as ParsedRow[];
          const headers = results.meta.fields || [];

          if (data.length === 0) {
            reject(new Error('CSVファイルが空です'));
            return;
          }

          // メール列を検出
          let detectedColumn = detectEmailColumn(headers, data);
          let rawValues: string[] = [];
          let emails: string[] = [];

          if (detectedColumn) {
            // 統計計算用に生の値を取得
            rawValues = extractRawValuesFromColumn(detectedColumn, data);
            // 処理用にバリデーション済みメールを取得
            emails = extractEmailsFromColumn(detectedColumn, data);
          } else {
            // フォールバック: 全セルから抽出
            emails = extractEmailsFromAllCells(data);
            // フォールバックの場合、統計はemailsから計算
            rawValues = emails.map(e => e);
          }

          // 統計情報を計算（処理前の状態を保持）
          const totalBeforeProcessing = rawValues.length;
          let validCount = 0;
          let invalidCount = 0;
          let duplicatesCount = 0;
          let emptyCount = 0;

          // 重複除去とバリデーション
          const seen = new Set<string>();
          const processed: string[] = [];

          // 生の値から統計を計算
          for (const rawValue of rawValues) {
            const trimmed = rawValue.trim().toLowerCase();
            
            if (!trimmed) {
              emptyCount++;
              continue;
            }

            if (!isValidEmail(trimmed)) {
              invalidCount++;
              if (!removeInvalid) {
                if (!removeDuplicates || !seen.has(trimmed)) {
                  seen.add(trimmed);
                  processed.push(trimmed);
                  validCount++;
                } else {
                  duplicatesCount++;
                }
              }
              continue;
            }

            if (removeDuplicates && seen.has(trimmed)) {
              duplicatesCount++;
              continue;
            }

            seen.add(trimmed);
            processed.push(trimmed);
            validCount++;
          }

          const stats = {
            total: totalBeforeProcessing,
            valid: processed.length,
            invalid: invalidCount,
            duplicates: duplicatesCount,
            empty: emptyCount,
          };

          resolve({
            emails: processed,
            detectedColumn,
            stats: {
              ...stats,
              valid: processed.length,
            },
          });
        } catch (error) {
          reject(error);
        }
      },
      error: (error) => {
        reject(error);
      },
    });
  });
}

/**
 * TSVファイルをパース（CSVパーサーでタブ区切りとして処理）
 */
export async function parseTSVAndExtractEmails(
  file: File,
  options: {
    removeDuplicates?: boolean;
    removeInvalid?: boolean;
  } = {}
): Promise<EmailExtractionResult> {
  return new Promise((resolve, reject) => {
    Papa.parse(file, {
      header: true,
      delimiter: '\t',
      skipEmptyLines: true,
      complete: (results) => {
        try {
          const data = results.data as ParsedRow[];
          const headers = results.meta.fields || [];

          if (data.length === 0) {
            reject(new Error('TSVファイルが空です'));
            return;
          }

          let detectedColumn = detectEmailColumn(headers, data);
          let rawValues: string[] = [];
          let emails: string[] = [];

          if (detectedColumn) {
            // 統計計算用に生の値を取得
            rawValues = extractRawValuesFromColumn(detectedColumn, data);
            // 処理用にバリデーション済みメールを取得
            emails = extractEmailsFromColumn(detectedColumn, data);
          } else {
            // フォールバック: 全セルから抽出
            emails = extractEmailsFromAllCells(data);
            rawValues = emails.map(e => e);
          }

          // 統計情報を計算（処理前の状態を保持）
          const totalBeforeProcessing = rawValues.length;
          let validCount = 0;
          let invalidCount = 0;
          let duplicatesCount = 0;
          let emptyCount = 0;

          const seen = new Set<string>();
          const processed: string[] = [];

          // 生の値から統計を計算
          for (const rawValue of rawValues) {
            const trimmed = rawValue.trim().toLowerCase();
            
            if (!trimmed) {
              emptyCount++;
              continue;
            }

            if (!isValidEmail(trimmed)) {
              invalidCount++;
              if (!options.removeInvalid) {
                if (!options.removeDuplicates || !seen.has(trimmed)) {
                  seen.add(trimmed);
                  processed.push(trimmed);
                  validCount++;
                } else {
                  duplicatesCount++;
                }
              }
              continue;
            }

            if (options.removeDuplicates && seen.has(trimmed)) {
              duplicatesCount++;
              continue;
            }

            seen.add(trimmed);
            processed.push(trimmed);
            validCount++;
          }

          const stats = {
            total: totalBeforeProcessing,
            valid: processed.length,
            invalid: invalidCount,
            duplicates: duplicatesCount,
            empty: emptyCount,
          };

          resolve({
            emails: processed,
            detectedColumn,
            stats,
          });
        } catch (error) {
          reject(error);
        }
      },
      error: (error) => {
        reject(error);
      },
    });
  });
}
