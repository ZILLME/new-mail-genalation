'use client';

import { useState, useEffect, useCallback } from 'react';
import { parseCSVAndExtractEmails, parseTSVAndExtractEmails, EmailExtractionResult } from '@/lib/csvParser';
import { saveTemplate, loadTemplate, applyTemplate, Template } from '@/lib/template';
import { getSentEmails, markAsSent, markAsUnsent, isSent } from '@/lib/sentStatus';

export default function Home() {
  const [emails, setEmails] = useState<string[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [detectedColumn, setDetectedColumn] = useState<string | null>(null);
  const [stats, setStats] = useState<EmailExtractionResult['stats'] | null>(null);
  
  const [subjectTemplate, setSubjectTemplate] = useState('');
  const [bodyTemplate, setBodyTemplate] = useState('');
  
  const [removeDuplicates, setRemoveDuplicates] = useState(true);
  const [removeInvalid, setRemoveInvalid] = useState(true);
  const [showUnsentOnly, setShowUnsentOnly] = useState(false);
  
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [sentEmails, setSentEmails] = useState<Set<string>>(new Set());

  // テンプレートを読み込み
  useEffect(() => {
    const saved = loadTemplate();
    if (saved) {
      setSubjectTemplate(saved.subject);
      setBodyTemplate(saved.body);
    }
  }, []);

  // 送信済み状態を読み込み
  useEffect(() => {
    setSentEmails(getSentEmails());
  }, []);

  // ファイルアップロード処理
  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    try {
      let result: EmailExtractionResult;
      
      if (file.name.endsWith('.tsv')) {
        result = await parseTSVAndExtractEmails(file, {
          removeDuplicates,
          removeInvalid,
        });
      } else if (file.name.endsWith('.csv')) {
        result = await parseCSVAndExtractEmails(file, {
          removeDuplicates,
          removeInvalid,
        });
      } else {
        alert('CSVまたはTSVファイルを選択してください');
        return;
      }

      setEmails(result.emails);
      setDetectedColumn(result.detectedColumn);
      setStats(result.stats);
      setCurrentIndex(0);
    } catch (error) {
      alert(`エラー: ${error instanceof Error ? error.message : 'ファイルの読み込みに失敗しました'}`);
    }
  };

  // テンプレート保存
  const handleSaveTemplate = () => {
    saveTemplate({
      subject: subjectTemplate,
      body: bodyTemplate,
    });
    showToast('テンプレートを保存しました');
  };

  // トースト表示
  const showToast = useCallback((message: string) => {
    setToastMessage(message);
    setTimeout(() => setToastMessage(null), 2000);
  }, []);

  // コピー機能
  const copyToClipboard = async (text: string, label: string) => {
    try {
      await navigator.clipboard.writeText(text);
      showToast(`${label}をコピーしました`);
    } catch (error) {
      alert('コピーに失敗しました');
    }
  };

  const copyAll = useCallback(async () => {
    const currentEmail = emails[currentIndex];
    if (!currentEmail) return;

    const applied = applyTemplate(
      { subject: subjectTemplate, body: bodyTemplate },
      { email: currentEmail }
    );

    const allText = `To: ${currentEmail}\nSubject: ${applied.subject}\n\n${applied.body}`;
    await copyToClipboard(allText, 'すべて');
  }, [emails, currentIndex, subjectTemplate, bodyTemplate]);

  // 送信済みトグル
  const toggleSent = (email: string) => {
    if (isSent(email)) {
      markAsUnsent(email);
    } else {
      markAsSent(email);
    }
    setSentEmails(getSentEmails());
  };

  // 次の未送信メールに移動
  const findNextUnsent = useCallback((startIndex: number, direction: 'next' | 'prev'): number | null => {
    const sent = getSentEmails();
    let index = startIndex;
    const maxIterations = emails.length;
    let iterations = 0;

    while (iterations < maxIterations) {
      if (direction === 'next') {
        index = (index + 1) % emails.length;
      } else {
        index = (index - 1 + emails.length) % emails.length;
      }

      if (!sent.has(emails[index].toLowerCase())) {
        return index;
      }

      iterations++;
    }

    return null;
  }, [emails]);

  // ページ移動
  const goToPage = useCallback((direction: 'next' | 'prev') => {
    if (emails.length === 0) return;

    if (showUnsentOnly) {
      const nextIndex = findNextUnsent(currentIndex, direction);
      if (nextIndex !== null) {
        setCurrentIndex(nextIndex);
      } else {
        showToast('未送信のメールがありません');
      }
    } else {
      if (direction === 'next') {
        setCurrentIndex((prev) => (prev + 1) % emails.length);
      } else {
        setCurrentIndex((prev) => (prev - 1 + emails.length) % emails.length);
      }
    }
  }, [emails.length, showUnsentOnly, currentIndex, findNextUnsent, showToast]);

  // キーボードショートカット
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Cmd/Ctrl + Shift + C: 全部コピー
      if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key === 'C') {
        e.preventDefault();
        copyAll();
        return;
      }

      // Enter: 次へ
      if (e.key === 'Enter' && !e.shiftKey && !e.metaKey && !e.ctrlKey) {
        e.preventDefault();
        goToPage('next');
        return;
      }

      // ←: 前へ
      if (e.key === 'ArrowLeft') {
        e.preventDefault();
        goToPage('prev');
        return;
      }

      // →: 次へ
      if (e.key === 'ArrowRight') {
        e.preventDefault();
        goToPage('next');
        return;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [goToPage, copyAll]);

  // 現在のメール情報
  const currentEmail = emails[currentIndex] || '';
  const appliedTemplate = currentEmail
    ? applyTemplate(
        { subject: subjectTemplate, body: bodyTemplate },
        { email: currentEmail }
      )
    : { subject: '', body: '' };

  const currentIsSent = currentEmail ? isSent(currentEmail) : false;
  const sentCount = Array.from(sentEmails).filter(e => emails.includes(e)).length;

  return (
    <div className="min-h-screen p-4 max-w-6xl mx-auto">
      {/* トースト通知 */}
      {toastMessage && (
        <div className="fixed top-4 right-4 bg-green-500 text-white px-4 py-2 rounded shadow-lg z-50">
          {toastMessage}
        </div>
      )}

      {/* 設定パネル */}
      <div className="bg-white rounded-lg shadow-md p-6 mb-6">
        <h1 className="text-2xl font-bold mb-4">メール生成アプリ</h1>
        
        <div className="space-y-4">
          {/* CSVアップロード */}
          <div>
            <label className="block text-sm font-medium mb-2">
              CSV/TSVファイルをアップロード
            </label>
            <input
              type="file"
              accept=".csv,.tsv"
              onChange={handleFileUpload}
              className="block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded file:border-0 file:text-sm file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100"
            />
            <p className="text-xs text-gray-500 mt-1">
              ※ .numbers ファイルは非対応です。CSV/TSVでエクスポートしてください。
            </p>
          </div>

          {/* 検出結果表示 */}
          {detectedColumn && (
            <div className="bg-blue-50 p-3 rounded">
              <p className="text-sm">
                <span className="font-semibold">検出されたメール列:</span> {detectedColumn}
              </p>
            </div>
          )}

          {stats && (
            <div className="bg-gray-50 p-3 rounded text-sm">
              <p>総件数: {stats.total} / 有効: {stats.valid} / 無効: {stats.invalid} / 重複: {stats.duplicates}</p>
            </div>
          )}

          {/* 件名テンプレート */}
          <div>
            <label className="block text-sm font-medium mb-2">
              件名テンプレート
            </label>
            <input
              type="text"
              value={subjectTemplate}
              onChange={(e) => setSubjectTemplate(e.target.value)}
              placeholder="例: お問い合わせありがとうございます"
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          {/* 本文テンプレート */}
          <div>
            <label className="block text-sm font-medium mb-2">
              本文テンプレート
            </label>
            <textarea
              value={bodyTemplate}
              onChange={(e) => setBodyTemplate(e.target.value)}
              placeholder="例: {{email}} 様&#10;&#10;いつもお世話になっております。"
              rows={6}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <p className="text-xs text-gray-500 mt-1">
              差し込み: {'{{email}}'} はメールアドレスに置換されます
            </p>
          </div>

          {/* オプション */}
          <div className="flex flex-wrap gap-4">
            <label className="flex items-center">
              <input
                type="checkbox"
                checked={removeDuplicates}
                onChange={(e) => setRemoveDuplicates(e.target.checked)}
                className="mr-2"
              />
              <span className="text-sm">重複除去</span>
            </label>
            <label className="flex items-center">
              <input
                type="checkbox"
                checked={removeInvalid}
                onChange={(e) => setRemoveInvalid(e.target.checked)}
                className="mr-2"
              />
              <span className="text-sm">無効メール除外</span>
            </label>
            <label className="flex items-center">
              <input
                type="checkbox"
                checked={showUnsentOnly}
                onChange={(e) => setShowUnsentOnly(e.target.checked)}
                className="mr-2"
              />
              <span className="text-sm">未送信のみ表示</span>
            </label>
          </div>

          {/* 保存ボタン */}
          <button
            onClick={handleSaveTemplate}
            className="px-4 py-2 bg-blue-500 text-white rounded-md hover:bg-blue-600"
          >
            テンプレートを保存
          </button>
        </div>
      </div>

      {/* ページ表示カード */}
      {emails.length > 0 && (
        <div className="bg-white rounded-lg shadow-md p-6 mb-6">
          {/* ヘッダー */}
          <div className="flex justify-between items-center mb-6">
            <div className="text-lg font-semibold">
              {currentIndex + 1} / {emails.length}
              {showUnsentOnly && ` (未送信: ${emails.length - sentCount})`}
            </div>
            <label className="flex items-center">
              <input
                type="checkbox"
                checked={currentIsSent}
                onChange={() => toggleSent(currentEmail)}
                className="mr-2"
              />
              <span className="text-sm">送信済み</span>
            </label>
          </div>

          {/* 宛先 */}
          <div className="mb-4">
            <div className="flex justify-between items-center mb-2">
              <label className="text-sm font-medium">宛先 (To)</label>
              <button
                onClick={() => copyToClipboard(currentEmail, '宛先')}
                className="px-3 py-1 bg-gray-200 text-gray-700 rounded text-sm hover:bg-gray-300"
              >
                コピー
              </button>
            </div>
            <div className="p-3 bg-gray-50 rounded border border-gray-200">
              <p className="text-sm break-all">{currentEmail}</p>
            </div>
          </div>

          {/* 件名 */}
          <div className="mb-4">
            <div className="flex justify-between items-center mb-2">
              <label className="text-sm font-medium">件名 (Subject)</label>
              <button
                onClick={() => copyToClipboard(appliedTemplate.subject, '件名')}
                className="px-3 py-1 bg-gray-200 text-gray-700 rounded text-sm hover:bg-gray-300"
              >
                コピー
              </button>
            </div>
            <div className="p-3 bg-gray-50 rounded border border-gray-200">
              <p className="text-sm">{appliedTemplate.subject}</p>
            </div>
          </div>

          {/* 本文 */}
          <div className="mb-4">
            <div className="flex justify-between items-center mb-2">
              <label className="text-sm font-medium">本文 (Body)</label>
              <button
                onClick={() => copyToClipboard(appliedTemplate.body, '本文')}
                className="px-3 py-1 bg-gray-200 text-gray-700 rounded text-sm hover:bg-gray-300"
              >
                コピー
              </button>
            </div>
            <div className="p-3 bg-gray-50 rounded border border-gray-200">
              <pre className="text-sm whitespace-pre-wrap font-sans">{appliedTemplate.body}</pre>
            </div>
          </div>

          {/* 全部コピーボタン */}
          <div className="mb-6">
            <button
              onClick={copyAll}
              className="w-full px-4 py-2 bg-green-500 text-white rounded-md hover:bg-green-600"
            >
              全部コピー (Cmd/Ctrl+Shift+C)
            </button>
          </div>

          {/* ナビゲーション */}
          <div className="flex justify-between items-center">
            <button
              onClick={() => goToPage('prev')}
              className="px-6 py-2 bg-blue-500 text-white rounded-md hover:bg-blue-600"
            >
              ← 前へ
            </button>
            <div className="text-sm text-gray-500">
              ← → キーで移動 / Enterで次へ
            </div>
            <button
              onClick={() => goToPage('next')}
              className="px-6 py-2 bg-blue-500 text-white rounded-md hover:bg-blue-600"
            >
              次へ →
            </button>
          </div>
        </div>
      )}

      {/* 空状態 */}
      {emails.length === 0 && (
        <div className="bg-white rounded-lg shadow-md p-12 text-center text-gray-500">
          CSVファイルをアップロードしてメールアドレスを読み込んでください
        </div>
      )}
    </div>
  );
}
