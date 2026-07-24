// core/phrasebook.ts
// 【R5】定型文まわりの純関数。React/Tauri/ストレージを import しない。
// プロトタイプが render 内にインラインで持っていた導出ロジック
// (見出し自動生成・「グループN」採番・見た目連番)をここへ抽出し、
// vitest でそのままテストできるようにする。

import type { PhraseItem } from "./types.js";

/**
 * 見出しの自動生成: 中身の先頭行を見出しにする(複数行の場合は1行目のみ)。
 * 文字数での切り詰めはしない。表示上の省略(…)は一覧行のCSS
 * (overflow:hidden + text-overflow:ellipsis)が実際の行幅に応じて動的に行う。
 * 固定文字数で切ると行幅が余っても短いままになる/逆に長すぎて溢れるため、
 * どちらのケースにも対応できるCSS側に一本化した(2026-07-24 ユーザー確認)。
 */
export function autoLabel(content: string): string {
  return (content ?? "").trim().split("\n")[0];
}

/** 新しいエンティティID。衝突しない一意値であればよい(内容はテスト非依存) */
export function newId(): string {
  const c = (globalThis as { crypto?: Crypto }).crypto;
  if (c && typeof c.randomUUID === "function") return c.randomUUID();
  // randomUUID が無い環境向けのフォールバック(通常は到達しない)
  return `id-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

/** 描画用に解決済みの区切り線行 */
export interface DividerViewRow {
  kind: "divider";
  id: string;
  /** 表示ラベル(自動採番なら「グループN」、手動なら固定名) */
  displayLabel: string;
  numbered: boolean;
  labelIsAuto: boolean;
  /** phrasesData 内の元index(ドラッグ・右クリック挿入で使う) */
  index: number;
}

/** 描画用に解決済みの定型文行 */
export interface PhraseViewRow {
  kind: "phrase";
  id: string;
  /** 表示テキスト(numbered グループなら「1. 」等の見た目連番付き) */
  displayText: string;
  /** 実際にコピーされる中身(表示テキストとは別物) */
  content: string;
  /** 見出し(編集パネルの初期値。見た目連番は含まない) */
  label: string;
  labelIsAuto: boolean;
  index: number;
}

export type PhraseViewRowUnion = DividerViewRow | PhraseViewRow;

/**
 * カテゴリの items 配列を、描画に必要な表示情報付きの行列へ変換する(純関数)。
 * ・区切り線: labelIsAuto の分だけ「グループ1」「グループ2」…と詰めて採番。
 *   手動ラベルの区切り線は採番から除外され、以降の自動採番は詰めて振り直される。
 * ・定型文: 直前の numbered な区切り線の配下なら「n. 」の見た目連番を付ける。
 *   ※ 連番・グループ名は保存データに一切書き戻さない(見た目だけ)。
 */
export function computeCategoryView(items: PhraseItem[]): PhraseViewRowUnion[] {
  const rows: PhraseViewRowUnion[] = [];
  let autoGroupCounter = 0; // 自動採番の区切り線だけを数える
  let groupNumbered = false; // 現在のグループが見た目連番ONか
  let phraseCounterInGroup = 0; // 現在のグループ内の定型文連番

  items.forEach((item, index) => {
    if (item.type === "divider") {
      let displayLabel: string;
      if (item.labelIsAuto) {
        autoGroupCounter += 1;
        displayLabel = `グループ${autoGroupCounter}`;
      } else {
        displayLabel = item.label;
      }
      groupNumbered = item.numbered;
      phraseCounterInGroup = 0;
      rows.push({
        kind: "divider",
        id: item.id,
        displayLabel,
        numbered: item.numbered,
        labelIsAuto: item.labelIsAuto,
        index,
      });
    } else {
      let displayText = item.label;
      if (groupNumbered) {
        phraseCounterInGroup += 1;
        displayText = `${phraseCounterInGroup}. ${item.label}`;
      }
      rows.push({
        kind: "phrase",
        id: item.id,
        displayText,
        content: item.content,
        label: item.label,
        labelIsAuto: item.labelIsAuto,
        index,
      });
    }
  });

  return rows;
}

/** カテゴリ内の定型文(divider除く)の件数。カテゴリ削除の確認ダイアログ用 */
export function countPhrases(items: PhraseItem[]): number {
  return items.reduce((n, it) => (it.type === "phrase" ? n + 1 : n), 0);
}
