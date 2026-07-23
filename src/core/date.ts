// core/date.ts
// 【House Rule R3】日付キーは常にローカルタイムの YYYY-MM-DD。
// toISOString().slice(0,10) は全面禁止(JSTでは朝9時前に日付がズレる)。
// MM-DD 形式のキーも禁止(比較不能になる)。

/** ローカルタイムの YYYY-MM-DD キー。日付キーの生成手段はこれ一つだけ。 */
export function todayKey(d: Date = new Date()): string {
  const y = String(d.getFullYear()).padStart(4, "0");
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/**
 * 日次ロールオーバーが必要か。
 * 【R3-3】呼び出し箇所: 起動時・resume時・タイマー完了時・保存前。
 * lastRolloverKey の更新は「ロールオーバー処理を実行した瞬間だけ」
 * (PomoQuestの恒久スキップ対策: 保存のたびに上書きするのは禁止)。
 */
export function needsRollover(
  lastRolloverKey: string,
  now: Date = new Date()
): boolean {
  return lastRolloverKey !== todayKey(now);
}

/**
 * startMs〜endMs の間に「またいだ」日付キーを古い順に列挙する。
 * 同日なら []。0時またぎ・複数日放置(kill→数日後再起動)の両方に対応。
 * SessionClock.fastForward() が使用する。
 */
export function enumerateDayKeys(startMs: number, endMs: number): string[] {
  if (endMs <= startMs) return [];
  const start = new Date(startMs);
  const end = new Date(endMs);
  const keys: string[] = [];
  // startの翌日0:00(ローカル)から endの日まで1日ずつ進める
  let cursor = new Date(start.getFullYear(), start.getMonth(), start.getDate() + 1);
  const endKey = todayKey(end);
  while (todayKey(cursor) <= endKey) {
    keys.push(todayKey(cursor));
    cursor = new Date(cursor.getFullYear(), cursor.getMonth(), cursor.getDate() + 1);
  }
  return keys;
}
