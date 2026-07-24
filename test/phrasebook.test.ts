// ClipMaru のコアロジック(純関数エンジン + 導出)のテスト。
// 【R5】engine/phrasebook は UI 非依存なので Node でそのまま検証できる。

import { describe, it, expect } from "vitest";
import {
  autoLabel,
  computeCategoryView,
  countPhrases,
} from "../src/core/phrasebook.js";
import { Engine } from "../src/core/engine.js";
import type { PhraseItem } from "../src/core/types.js";

// ───────────────────────── phrasebook: 見出し自動生成
describe("autoLabel", () => {
  it("短い内容はそのまま", () => {
    expect(autoLabel("短い見出し")).toBe("短い見出し");
  });
  it("長い内容でも文字数で切り詰めない(表示側のCSS省略に任せる)", () => {
    const long = "abcdefghijklmnopqrstuvwxyz0123456789abcdefghijklmnopqrstuvwxyz";
    expect(autoLabel(long)).toBe(long);
  });
  it("先頭行だけを使う(複数行は1行目)", () => {
    expect(autoLabel("1行目\n2行目\n3行目")).toBe("1行目");
  });
  it("前後の空白はトリムする", () => {
    expect(autoLabel("  こんにちは  ")).toBe("こんにちは");
  });
});

// ───────────────────────── phrasebook: グループ採番 / 見た目連番
describe("computeCategoryView", () => {
  const phrase = (id: string, label: string): PhraseItem => ({
    type: "phrase",
    id,
    label,
    labelIsAuto: false,
    content: label + "の中身",
  });
  const divider = (
    id: string,
    opts: { label?: string; auto?: boolean; numbered?: boolean } = {}
  ): PhraseItem => ({
    type: "divider",
    id,
    label: opts.label ?? "",
    labelIsAuto: opts.auto ?? true,
    numbered: opts.numbered ?? false,
  });

  it("自動採番の区切り線は「グループN」で詰めて番号が振られる", () => {
    const view = computeCategoryView([
      divider("d1"),
      phrase("p1", "A"),
      divider("d2"),
      phrase("p2", "B"),
    ]);
    expect(view[0]).toMatchObject({ kind: "divider", displayLabel: "グループ1" });
    expect(view[2]).toMatchObject({ kind: "divider", displayLabel: "グループ2" });
  });

  it("手動ラベルの区切り線は採番から除外され、自動側は詰めて振り直される", () => {
    const view = computeCategoryView([
      divider("d1"), // グループ1
      divider("d2", { label: "重要", auto: false }), // 手動: 採番外
      divider("d3"), // グループ2(詰めて振り直し)
    ]);
    expect(view[0]).toMatchObject({ displayLabel: "グループ1" });
    expect(view[1]).toMatchObject({ displayLabel: "重要" });
    expect(view[2]).toMatchObject({ displayLabel: "グループ2" });
  });

  it("numbered な区切り線の配下だけ見た目連番が付く(データは不変)", () => {
    const items: PhraseItem[] = [
      phrase("p0", "見出しX"), // 区切り線前 → 連番なし
      divider("d1", { numbered: true }),
      phrase("p1", "見出しA"),
      phrase("p2", "見出しB"),
      divider("d2", { numbered: false }),
      phrase("p3", "見出しC"), // numbered off → 連番なし
    ];
    const view = computeCategoryView(items);
    const texts = view
      .filter((r) => r.kind === "phrase")
      .map((r) => (r as { displayText: string }).displayText);
    expect(texts).toEqual(["見出しX", "1. 見出しA", "2. 見出しB", "見出しC"]);
    // 元データの label は連番で汚染されない
    expect((items[2] as { label: string }).label).toBe("見出しA");
  });
});

describe("countPhrases", () => {
  it("divider は数えず phrase だけ数える", () => {
    const items: PhraseItem[] = [
      { type: "phrase", id: "a", label: "a", labelIsAuto: true, content: "a" },
      { type: "divider", id: "d", label: "", labelIsAuto: true, numbered: false },
      { type: "phrase", id: "b", label: "b", labelIsAuto: true, content: "b" },
    ];
    expect(countPhrases(items)).toBe(2);
  });
});

// ───────────────────────── engine: カテゴリ操作
describe("Engine categories", () => {
  it("ensureSeeded は空のときだけ1カテゴリ用意する", () => {
    const e = Engine.fresh();
    expect(e.view.categories.length).toBe(0);
    e.ensureSeeded();
    expect(e.view.categories.length).toBe(1);
    e.ensureSeeded(); // 既にあるなら増やさない
    expect(e.view.categories.length).toBe(1);
  });

  it("最後の1カテゴリは削除できない(仕様)", () => {
    const e = Engine.fresh();
    const c1 = e.addCategory("A");
    expect(e.deleteCategory(c1)).toBe(false); // 最後の1つ
    const c2 = e.addCategory("B");
    expect(e.deleteCategory(c2)).toBe(true);
    expect(e.view.categories).toHaveLength(1);
  });
});

// ───────────────────────── engine: 定型文・区切り線
describe("Engine phrases", () => {
  it("見出し空で追加すると本文から自動生成し labelIsAuto=true", () => {
    const e = Engine.fresh();
    const cat = e.addCategory("A");
    const id = e.addPhrase(cat, { label: "", content: "自動見出しになる本文" });
    const item = e.view.categories[0].items.find((i) => i.id === id)!;
    expect(item).toMatchObject({
      type: "phrase",
      label: "自動見出しになる本文",
      labelIsAuto: true,
    });
  });

  it("見出しを空にして更新すると自動生成へ戻る", () => {
    const e = Engine.fresh();
    const cat = e.addCategory("A");
    const id = e.addPhrase(cat, { label: "手動見出し", content: "本文ABC" })!;
    e.updatePhrase(cat, id, { label: "", content: "新しい本文DEF" });
    const item = e.view.categories[0].items[0];
    expect(item).toMatchObject({ label: "新しい本文DEF", labelIsAuto: true });
  });

  it("区切り線ラベル: 手動編集で labelIsAuto=false、空に戻すと自動へ", () => {
    const e = Engine.fresh();
    const cat = e.addCategory("A");
    const id = e.addDivider(cat)!;
    e.setDividerLabel(cat, id, "重要グループ");
    expect(e.view.categories[0].items[0]).toMatchObject({
      label: "重要グループ",
      labelIsAuto: false,
    });
    e.setDividerLabel(cat, id, "   ");
    expect(e.view.categories[0].items[0]).toMatchObject({
      label: "",
      labelIsAuto: true,
    });
  });

  it("区切り線を削除しても配下の定型文は消えない(仕様)", () => {
    const e = Engine.fresh();
    const cat = e.addCategory("A");
    e.addPhrase(cat, { label: "p1", content: "x" });
    const divId = e.addDivider(cat)!;
    e.addPhrase(cat, { label: "p2", content: "y" });
    e.deleteItem(cat, divId);
    const items = e.view.categories[0].items;
    expect(items.map((i) => i.type)).toEqual(["phrase", "phrase"]);
  });

  it("reorderItem は fromIndex を抜いて toIndex へ挿し直す", () => {
    const e = Engine.fresh();
    const cat = e.addCategory("A");
    e.addPhrase(cat, { label: "1", content: "1" });
    e.addPhrase(cat, { label: "2", content: "2" });
    e.addPhrase(cat, { label: "3", content: "3" });
    e.reorderItem(cat, 0, 2); // 1を末尾へ
    expect(e.view.categories[0].items.map((i) => (i as { label: string }).label)).toEqual([
      "2",
      "3",
      "1",
    ]);
  });

  it("moveItemsToCategory は選択分を移動し件数を返す。同一カテゴリは0", () => {
    const e = Engine.fresh();
    const a = e.addCategory("A");
    const b = e.addCategory("B");
    const p1 = e.addPhrase(a, { label: "p1", content: "1" })!;
    const p2 = e.addPhrase(a, { label: "p2", content: "2" })!;
    expect(e.moveItemsToCategory(a, [p1, p2], a)).toBe(0); // 同一カテゴリ
    expect(e.moveItemsToCategory(a, [p1], b)).toBe(1);
    expect(e.view.categories[0].items).toHaveLength(1); // A に p2 だけ
    expect(e.view.categories[1].items).toHaveLength(1); // B に p1
  });

  it("【選択モード】deleteItems は選択分だけ一括削除し件数を返す。存在しないidは無視", () => {
    const e = Engine.fresh();
    const cat = e.addCategory("A");
    const p1 = e.addPhrase(cat, { label: "1", content: "1" })!;
    const p2 = e.addPhrase(cat, { label: "2", content: "2" })!;
    e.addPhrase(cat, { label: "3", content: "3" });
    expect(e.deleteItems(cat, [p1, p2, "存在しないid"])).toBe(2);
    expect(e.view.categories[0].items).toHaveLength(1);
    expect((e.view.categories[0].items[0] as { label: string }).label).toBe("3");
  });
});

// ───────────────────────── engine: フォルダ/ショートカット(ピン留め一覧)
describe("Engine folders", () => {
  it("追加・更新・削除・並べ替え", () => {
    const e = Engine.fresh();
    const id = e.addFolder("資料", "C:/docs");
    expect(e.view.folders).toHaveLength(1);
    expect(e.view.folders[0]).toMatchObject({ label: "資料", path: "C:/docs" });

    expect(e.updateFolder(id, { label: "資料フォルダ" })).toBe(true);
    expect(e.view.folders[0]).toMatchObject({ label: "資料フォルダ", path: "C:/docs" });

    const id2 = e.addFolder("サイト", "https://example.com");
    expect(e.reorderFolder(0, 1)).toBe(true);
    expect(e.view.folders.map((f) => f.id)).toEqual([id2, id]);

    expect(e.deleteFolder(id)).toBe(true);
    expect(e.deleteFolder("存在しないid")).toBe(false);
    expect(e.view.folders).toHaveLength(1);
  });
});

// ───────────────────────── engine: 永続化ラウンドトリップ(deepMerge の要)
describe("Engine persistence round-trip", () => {
  it("【最重要】ネストした items が deepMerge 復元で無傷(配列内包の効能)", () => {
    const e = Engine.fresh();
    const cat = e.addCategory("寒中見舞い");
    e.addPhrase(cat, { label: "見出し", content: "コピーされる中身" });
    e.addDivider(cat);

    // 保存 → JSON 往復 → 復元(Persistence.loadAll と同じ経路 = Engine.fromSave)
    const saved = JSON.parse(JSON.stringify(e.toSave()));
    const restored = Engine.fromSave(saved);

    expect(restored.view.categories).toHaveLength(1);
    expect(restored.view.categories[0].name).toBe("寒中見舞い");
    expect(restored.view.categories[0].items).toHaveLength(2);
    expect(restored.view.categories[0].items[0]).toMatchObject({
      type: "phrase",
      content: "コピーされる中身",
    });
  });

  it("folders も配列フィールドとして deepMerge 復元で無傷", () => {
    const e = Engine.fresh();
    e.addFolder("資料", "C:/docs");
    e.addFolder("サイト", "https://example.com");
    const restored = Engine.fromSave(JSON.parse(JSON.stringify(e.toSave())));
    expect(restored.view.folders).toHaveLength(2);
    expect(restored.view.folders[1]).toMatchObject({ path: "https://example.com" });
  });

  it("settings は既知キーを上書きしつつ default 形を保つ", () => {
    const e = Engine.fresh();
    e.updateSettings({ theme: "dark", alwaysOnTop: true });
    const restored = Engine.fromSave(JSON.parse(JSON.stringify(e.toSave())));
    expect(restored.view.settings).toMatchObject({
      theme: "dark",
      alwaysOnTop: true,
      activeTab: "history", // 触っていないキーは default 維持
    });
  });
});
