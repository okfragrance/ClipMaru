// core/schema.ts
// 【House Rule R2/R9】永続化キーの唯一の定義。
// save / load / snapshot / export / プロフィール切替 の全員がここだけを見る。
// 状態を1つ追加するとき、触るのはこのファイル1箇所。
// 手書きの collect/apply 列挙を書いた時点でルール違反。

export type PersistScope = "profile" | "shared"; // R9: 分離/共有を必ず宣言

export interface FieldDef<T = unknown> {
  key: string;
  scope: PersistScope;
  /** 毎回新しいインスタンスを返す(共有参照事故の防止) */
  makeDefault: () => T;
  /** エクスポートに含めるか(購入情報などはfalseにできる) */
  exportable: boolean;
}

export function field<T>(
  key: string,
  scope: PersistScope,
  makeDefault: () => T,
  opts: { exportable?: boolean } = {}
): FieldDef<T> {
  return { key, scope, makeDefault, exportable: opts.exportable ?? true };
}

// ─────────────────────────────────────────────
// ↓ アプリごとにここを書き換える(テンプレートのサンプル定義)
// ─────────────────────────────────────────────
export const PERSIST_SCHEMA: readonly FieldDef[] = [
  field("settings", "shared", () => ({ theme: "macaron", soundOn: true })),
  field("progress", "profile", () => ({ totalXp: 0, unlockedIds: [] as string[] })),
  field("dailyState", "profile", () => ({
    lastRolloverKey: "",
    tasksDone: [] as string[],
  })),
  field("session", "profile", () => ({ lastSeenMs: 0 })),
] as const;

/** 全キーのデフォルト状態(deep-merge復元の土台)。呼ぶたびに新インスタンス。 */
export function defaultState(
  schema: readonly FieldDef[] = PERSIST_SCHEMA
): Record<string, unknown> {
  return Object.fromEntries(schema.map((f) => [f.key, f.makeDefault()]));
}

/** スキーマの健全性チェック(キー重複・_プレフィックス混入を起動時/テストで検出) */
export function validateSchema(schema: readonly FieldDef[]): string[] {
  const problems: string[] = [];
  const seen = new Set<string>();
  for (const f of schema) {
    if (seen.has(f.key)) problems.push(`キー重複: ${f.key}`);
    seen.add(f.key);
    if (f.key.startsWith("_"))
      problems.push(`_プレフィックスは永続化キーに使用不可: ${f.key}`);
  }
  return problems;
}
