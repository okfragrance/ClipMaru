// app/hooks/usePhrasebook.ts
// engine(純関数・R5)と React の橋渡し。UI は engine を直接触らず、この hook の
// actions 経由で状態を変える。各 action は「engine を変更 → スナップショットで再描画
// → Persistence.saveAll(engine.toSave()) で保存」を1経路で行う(R2: schema をループ)。
//
// engine はミューテーションを in-place で行うため、React 用に categories を毎回
// クローンして新しい参照にする(編集はユーザーペースなのでコストは問題にならない)。

import { useCallback, useEffect, useState } from "react";
import type { Engine, PhraseInput } from "../../core/engine";
import type { Persistence } from "../../storage/persistence";
import type { Category } from "../../core/types";

function clone(cats: readonly Category[]): Category[] {
  return structuredClone(cats as Category[]);
}

export interface PhrasebookActions {
  /** ダイヤル/一覧からカテゴリを選ぶ */
  setActiveCategory: (id: string) => void;
  /** ダイヤルを1つ進める(+1)/戻す(-1) */
  cycleCategory: (delta: number) => void;
  /** カテゴリ追加(その場でそのカテゴリへ移動)。作成 id を返す */
  addCategory: (name: string) => string | null;
  renameCategory: (id: string, name: string) => void;
  /** カテゴリ削除(最後の1つは不可)。成功可否 */
  deleteCategory: (id: string) => boolean;

  addPhrase: (input: PhraseInput, insertIndex?: number) => void;
  updatePhrase: (itemId: string, input: PhraseInput) => void;
  addDivider: (insertIndex?: number) => void;
  setDividerLabel: (itemId: string, label: string) => void;
  toggleDividerNumbered: (itemId: string) => void;
  deleteItem: (itemId: string) => void;
  /** 選択モードでの一括削除。削除できた件数を返す */
  deleteItems: (itemIds: string[]) => number;
  reorderItem: (fromIndex: number, toIndex: number) => void;
  moveItemsToCategory: (itemIds: string[], toCategoryId: string) => number;
}

export interface Phrasebook {
  categories: Category[];
  activeCategoryId: string;
  activeIndex: number;
  activeCategory: Category | null;
  actions: PhrasebookActions;
}

export function usePhrasebook(
  engine: Engine | null,
  persist: Persistence | null
): Phrasebook {
  const [categories, setCategories] = useState<Category[]>([]);
  const [activeCategoryId, setActiveCategoryId] = useState<string>("");

  // engine が用意できたら初期同期(activeCategoryId は保存値→無効なら先頭)
  useEffect(() => {
    if (!engine) return;
    const cats = clone(engine.view.categories);
    setCategories(cats);
    const saved = engine.view.settings.activeCategoryId;
    const valid = cats.some((c) => c.id === saved);
    setActiveCategoryId(valid ? saved : cats[0]?.id ?? "");
  }, [engine]);

  /** engine 変更後の共通処理: スナップショット再描画 + 保存 */
  const sync = useCallback(() => {
    if (!engine || !persist) return;
    setCategories(clone(engine.view.categories));
    void persist.saveAll(engine.toSave());
  }, [engine, persist]);

  const setActiveCategory = useCallback(
    (id: string) => {
      if (!engine) return;
      engine.updateSettings({ activeCategoryId: id });
      setActiveCategoryId(id);
      void persist?.saveAll(engine.toSave());
    },
    [engine, persist]
  );

  const cycleCategory = useCallback(
    (delta: number) => {
      if (categories.length === 0) return;
      const idx = categories.findIndex((c) => c.id === activeCategoryId);
      const base = idx === -1 ? 0 : idx;
      const next =
        (base + delta + categories.length) % categories.length;
      setActiveCategory(categories[next].id);
    },
    [categories, activeCategoryId, setActiveCategory]
  );

  const addCategory = useCallback(
    (name: string): string | null => {
      if (!engine || name.trim() === "") return null;
      const id = engine.addCategory(name);
      engine.updateSettings({ activeCategoryId: id }); // 作成後そのカテゴリへ移動
      setActiveCategoryId(id);
      sync();
      return id;
    },
    [engine, sync]
  );

  const renameCategory = useCallback(
    (id: string, name: string) => {
      if (!engine) return;
      engine.renameCategory(id, name);
      sync();
    },
    [engine, sync]
  );

  const deleteCategory = useCallback(
    (id: string): boolean => {
      if (!engine) return false;
      const wasActive = id === activeCategoryId;
      if (!engine.deleteCategory(id)) return false;
      const cats = clone(engine.view.categories);
      setCategories(cats);
      if (wasActive) {
        const newId = cats[0]?.id ?? "";
        engine.updateSettings({ activeCategoryId: newId });
        setActiveCategoryId(newId);
      }
      void persist?.saveAll(engine.toSave());
      return true;
    },
    [engine, persist, activeCategoryId]
  );

  const addPhrase = useCallback(
    (input: PhraseInput, insertIndex?: number) => {
      if (!engine) return;
      engine.addPhrase(activeCategoryId, input, insertIndex);
      sync();
    },
    [engine, sync, activeCategoryId]
  );

  const updatePhrase = useCallback(
    (itemId: string, input: PhraseInput) => {
      if (!engine) return;
      engine.updatePhrase(activeCategoryId, itemId, input);
      sync();
    },
    [engine, sync, activeCategoryId]
  );

  const addDivider = useCallback(
    (insertIndex?: number) => {
      if (!engine) return;
      engine.addDivider(activeCategoryId, insertIndex);
      sync();
    },
    [engine, sync, activeCategoryId]
  );

  const setDividerLabel = useCallback(
    (itemId: string, label: string) => {
      if (!engine) return;
      engine.setDividerLabel(activeCategoryId, itemId, label);
      sync();
    },
    [engine, sync, activeCategoryId]
  );

  const toggleDividerNumbered = useCallback(
    (itemId: string) => {
      if (!engine) return;
      engine.toggleDividerNumbered(activeCategoryId, itemId);
      sync();
    },
    [engine, sync, activeCategoryId]
  );

  const deleteItem = useCallback(
    (itemId: string) => {
      if (!engine) return;
      engine.deleteItem(activeCategoryId, itemId);
      sync();
    },
    [engine, sync, activeCategoryId]
  );

  const deleteItems = useCallback(
    (itemIds: string[]): number => {
      if (!engine) return 0;
      const n = engine.deleteItems(activeCategoryId, itemIds);
      sync();
      return n;
    },
    [engine, sync, activeCategoryId]
  );

  const reorderItem = useCallback(
    (fromIndex: number, toIndex: number) => {
      if (!engine) return;
      engine.reorderItem(activeCategoryId, fromIndex, toIndex);
      sync();
    },
    [engine, sync, activeCategoryId]
  );

  const moveItemsToCategory = useCallback(
    (itemIds: string[], toCategoryId: string): number => {
      if (!engine) return 0;
      const n = engine.moveItemsToCategory(
        activeCategoryId,
        itemIds,
        toCategoryId
      );
      sync();
      return n;
    },
    [engine, sync, activeCategoryId]
  );

  const activeIndex = categories.findIndex((c) => c.id === activeCategoryId);
  const activeCategory = activeIndex === -1 ? null : categories[activeIndex];

  return {
    categories,
    activeCategoryId,
    activeIndex,
    activeCategory,
    actions: {
      setActiveCategory,
      cycleCategory,
      addCategory,
      renameCategory,
      deleteCategory,
      addPhrase,
      updatePhrase,
      addDivider,
      setDividerLabel,
      toggleDividerNumbered,
      deleteItem,
      deleteItems,
      reorderItem,
      moveItemsToCategory,
    },
  };
}
