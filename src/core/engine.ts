// core/engine.ts
// 【House Rule R5】アプリ本体ロジックの置き場所(純関数の世界)。
// React / Tauri API / タイマー / ストレージを一切 import しない。
// ClipMaru では「カテゴリ・定型文の編集」がここに集約される。
//
// 契約:
// ・toSave() は PERSIST_SCHEMA のキーに一致した形の状態を返す(保存は storage の仕事)
// ・fromSave() は deep-merge 済みの状態を受け取る(復元経路は1つ)
// ・履歴は relational(historyStore)で扱い、engine には載せない
// ・ClipMaru は経済・日次リセット・放置進行を持たないため、ライフサイクル系
//   (pauseTimers / applyElapsed / checkDailyRollover)は「見ていない時間の保存」
//   契約を満たすだけの no-op。lastSeen を刻むのは SessionClock のまま(R4)。

import type { FastForwardResult, SessionState } from "./session.js";
import type { Category, FolderEntry, PhraseItem, Settings } from "./types.js";
import { autoLabel, countPhrases, newId } from "./phrasebook.js";
import { defaultState } from "./schema.js";
import { deepMerge } from "./merge.js";

export interface EngineState {
  settings: Settings;
  categories: Category[];
  folders: FolderEntry[];
  session: SessionState;
}

/** 定型文の新規作成/更新に渡す入力(見出しは空欄可) */
export interface PhraseInput {
  label: string;
  content: string;
}

export class Engine {
  private constructor(private state: EngineState) {}

  /** 新規開始(schema の default から) */
  static fresh(): Engine {
    return new Engine(defaultState() as unknown as EngineState);
  }

  /**
   * 復元(deep-merge 済みの状態を受ける)。
   * Persistence.loadAll() の結果をそのまま渡すのが唯一の復元経路。
   */
  static fromSave(saved: Record<string, unknown>): Engine {
    const merged = deepMerge(
      defaultState() as unknown as EngineState,
      saved
    );
    return new Engine(merged);
  }

  /** 保存用の状態(schema のキーと同じ形)。保存自体は storage の仕事 */
  toSave(): Record<string, unknown> {
    return { ...this.state };
  }

  /** UI 表示用の読み取り専用ビュー */
  get view(): Readonly<EngineState> {
    return this.state;
  }

  // ── ライフサイクル(R4 の配線契約を満たすだけの no-op)──────────────
  // ClipMaru は放置進行も日次リセットも持たない。useLifecycle が blur 時に
  // markSeen()→save() する導線だけを活かす(編集内容のフォーカス喪失時保存)。

  /** 進行中タイマーは無い。契約順序(pause→markSeen→save)のためだけに存在 */
  pauseTimers(): void {
    // ClipMaru に内部タイマーは無い
  }

  /** 「見ていない時間」の反映は不要(放置進行なし) */
  applyElapsed(ff: FastForwardResult): void {
    if (ff.firstRun) return;
    // ClipMaru は経過時間に応じて進める状態を持たない
  }

  /** 日次リセットは無い。契約上 boolean を返す(useLifecycle が呼ぶ) */
  checkDailyRollover(): boolean {
    return false;
  }

  // ── カテゴリ操作 ─────────────────────────────────────────────

  private find(categoryId: string): Category | undefined {
    return this.state.categories.find((c) => c.id === categoryId);
  }

  /** 初回起動などでカテゴリが空なら1つ用意する(最後の1つは削除不可の前提を満たす) */
  ensureSeeded(defaultName = "よく使う"): void {
    if (this.state.categories.length === 0) {
      this.addCategory(defaultName);
    }
  }

  /** カテゴリを追加し、その id を返す */
  addCategory(name: string): string {
    const cat: Category = { id: newId(), name: name.trim(), items: [] };
    this.state.categories.push(cat);
    return cat.id;
  }

  renameCategory(categoryId: string, name: string): boolean {
    const cat = this.find(categoryId);
    if (!cat) return false;
    cat.name = name.trim();
    return true;
  }

  /**
   * カテゴリ削除。最後の1つは削除不可(仕様)→ false を返す。
   * 【R7】配下の定型文・区切り線も同時に消える(items 内包なので自動)。
   */
  deleteCategory(categoryId: string): boolean {
    if (this.state.categories.length <= 1) return false;
    const idx = this.state.categories.findIndex((c) => c.id === categoryId);
    if (idx === -1) return false;
    this.state.categories.splice(idx, 1);
    return true;
  }

  /** カテゴリ内の定型文件数(削除確認ダイアログ用) */
  phraseCount(categoryId: string): number {
    const cat = this.find(categoryId);
    return cat ? countPhrases(cat.items) : 0;
  }

  // ── 定型文・区切り線操作 ─────────────────────────────────────

  private makePhrase(input: PhraseInput): PhraseItem {
    const label = input.label.trim();
    return {
      type: "phrase",
      id: newId(),
      content: input.content,
      label: label === "" ? autoLabel(input.content) : label,
      labelIsAuto: label === "",
    };
  }

  private makeDivider(): PhraseItem {
    return {
      type: "divider",
      id: newId(),
      label: "",
      labelIsAuto: true,
      numbered: false,
    };
  }

  private insert(cat: Category, item: PhraseItem, insertIndex?: number): void {
    if (insertIndex === undefined || insertIndex >= cat.items.length) {
      cat.items.push(item);
    } else {
      cat.items.splice(Math.max(0, insertIndex), 0, item);
    }
  }

  /** 定型文を追加。insertIndex 省略で末尾。作成した id を返す(失敗時 null) */
  addPhrase(
    categoryId: string,
    input: PhraseInput,
    insertIndex?: number
  ): string | null {
    const cat = this.find(categoryId);
    if (!cat) return null;
    const item = this.makePhrase(input);
    this.insert(cat, item, insertIndex);
    return item.id;
  }

  /**
   * 定型文を更新。見出しを空にして保存すると自動生成へ戻る(仕様)。
   */
  updatePhrase(
    categoryId: string,
    itemId: string,
    input: PhraseInput
  ): boolean {
    const cat = this.find(categoryId);
    const item = cat?.items.find((i) => i.id === itemId);
    if (!item || item.type !== "phrase") return false;
    const label = input.label.trim();
    item.content = input.content;
    item.label = label === "" ? autoLabel(input.content) : label;
    item.labelIsAuto = label === "";
    return true;
  }

  /** 区切り線を追加。insertIndex 省略で末尾。作成した id を返す(失敗時 null) */
  addDivider(categoryId: string, insertIndex?: number): string | null {
    const cat = this.find(categoryId);
    if (!cat) return null;
    const item = this.makeDivider();
    this.insert(cat, item, insertIndex);
    return item.id;
  }

  /**
   * 区切り線ラベルの手動編集。空文字なら自動採番へ戻す、非空なら固定名にする。
   */
  setDividerLabel(
    categoryId: string,
    itemId: string,
    newLabel: string
  ): boolean {
    const cat = this.find(categoryId);
    const item = cat?.items.find((i) => i.id === itemId);
    if (!item || item.type !== "divider") return false;
    const trimmed = newLabel.trim();
    if (trimmed === "") {
      item.labelIsAuto = true;
      item.label = "";
    } else {
      item.labelIsAuto = false;
      item.label = trimmed;
    }
    return true;
  }

  /** 区切り線の見た目連番 ON/OFF。切替後の値を返す(失敗時 null) */
  toggleDividerNumbered(categoryId: string, itemId: string): boolean | null {
    const cat = this.find(categoryId);
    const item = cat?.items.find((i) => i.id === itemId);
    if (!item || item.type !== "divider") return null;
    item.numbered = !item.numbered;
    return item.numbered;
  }

  /**
   * 定型文または区切り線を削除。
   * 【仕様】区切り線を消しても配下の定型文は消えない(items フラット配列なので自動)。
   */
  deleteItem(categoryId: string, itemId: string): boolean {
    const cat = this.find(categoryId);
    if (!cat) return false;
    const idx = cat.items.findIndex((i) => i.id === itemId);
    if (idx === -1) return false;
    cat.items.splice(idx, 1);
    return true;
  }

  /**
   * 選択モードでの一括削除。存在しない id は無視し、実際に削除できた件数を返す。
   * 【R7】確定(削除ボタン押下+確認ダイアログ)時にまとめて実行する呼び出し前提。
   */
  deleteItems(categoryId: string, itemIds: string[]): number {
    const cat = this.find(categoryId);
    if (!cat) return 0;
    const idset = new Set(itemIds);
    const before = cat.items.length;
    cat.items = cat.items.filter((i) => !idset.has(i.id));
    return before - cat.items.length;
  }

  /** ドラッグ&ドロップの並べ替え(fromIndex を抜いて toIndex へ挿し直す) */
  reorderItem(categoryId: string, fromIndex: number, toIndex: number): boolean {
    const cat = this.find(categoryId);
    if (!cat) return false;
    const len = cat.items.length;
    if (fromIndex < 0 || fromIndex >= len || toIndex < 0 || toIndex >= len) {
      return false;
    }
    const [moved] = cat.items.splice(fromIndex, 1);
    cat.items.splice(toIndex, 0, moved);
    return true;
  }

  /**
   * 選択した定型文をまとめて別カテゴリへ移動。移動した件数を返す。
   * 同一カテゴリ指定は何もしない(0を返す)。
   */
  moveItemsToCategory(
    fromCategoryId: string,
    itemIds: string[],
    toCategoryId: string
  ): number {
    if (fromCategoryId === toCategoryId) return 0;
    const from = this.find(fromCategoryId);
    const to = this.find(toCategoryId);
    if (!from || !to) return 0;
    const idset = new Set(itemIds);
    const moving = from.items.filter((i) => idset.has(i.id));
    if (moving.length === 0) return 0;
    from.items = from.items.filter((i) => !idset.has(i.id));
    to.items.push(...moving);
    return moving.length;
  }

  // ── フォルダ/ショートカット(ピン留め一覧)────────────────────────

  /** 追加。作成した id を返す */
  addFolder(label: string, path: string): string {
    const entry: FolderEntry = {
      id: newId(),
      label: label.trim(),
      path: path.trim(),
    };
    this.state.folders.push(entry);
    return entry.id;
  }

  updateFolder(
    id: string,
    patch: { label?: string; path?: string }
  ): boolean {
    const entry = this.state.folders.find((f) => f.id === id);
    if (!entry) return false;
    if (patch.label !== undefined) entry.label = patch.label.trim();
    if (patch.path !== undefined) entry.path = patch.path.trim();
    return true;
  }

  deleteFolder(id: string): boolean {
    const idx = this.state.folders.findIndex((f) => f.id === id);
    if (idx === -1) return false;
    this.state.folders.splice(idx, 1);
    return true;
  }

  /** ドラッグ&ドロップの並べ替え */
  reorderFolder(fromIndex: number, toIndex: number): boolean {
    const len = this.state.folders.length;
    if (fromIndex < 0 || fromIndex >= len || toIndex < 0 || toIndex >= len) {
      return false;
    }
    const [moved] = this.state.folders.splice(fromIndex, 1);
    this.state.folders.splice(toIndex, 0, moved);
    return true;
  }

  // ── 設定 ─────────────────────────────────────────────────────

  updateSettings(patch: Partial<Settings>): void {
    this.state.settings = { ...this.state.settings, ...patch };
  }
}
