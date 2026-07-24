// app/components/CategoryPanel.tsx
// カテゴリ一覧ポップアップ。
// ・jump モード(既定): クリックでジャンプ・削除(件数明示・確認)・新規追加。
//   ダイヤルと同じ「マウスホイールで1つずつ切替」もサポート(パネルを開いたまま
//   連続で切替できる。オーバーレイがダイヤルを覆うため、ここに個別で配線が必要)。
// ・move モード(選択モードの「移動」から): クリックで移動先に指定・削除ボタンは非表示。
//   新規カテゴリをその場で作成した場合はそこへ直接移動する(仕様通り)。
//   ホイール切替は「現在地」の概念がない(移動先を選ぶだけ)ため対象外。

import { useEffect, useRef, useState } from "react";
import type { Category } from "../../core/types";
import { countPhrases } from "../../core/phrasebook";
import { useToast } from "./Toast";

export interface CategoryPanelProps {
  categories: Category[];
  activeCategoryId: string;
  mode?: "jump" | "move";
  onJump?: (id: string) => void; // jump モードで使用
  onMoveTarget?: (id: string) => void; // move モードで使用
  onDelete?: (id: string) => boolean; // 実削除は呼び出し側(最後の1つは false)。jump モードのみ表示
  onAdd: (name: string) => string | null; // 作成した id を返す(move モードで直接移動するため)
  onClose: () => void;
}

export function CategoryPanel({
  categories,
  activeCategoryId,
  mode = "jump",
  onJump,
  onMoveTarget,
  onDelete,
  onAdd,
  onClose,
}: CategoryPanelProps) {
  const isMove = mode === "move";
  const [newName, setNewName] = useState("");
  const toast = useToast();
  const listRef = useRef<HTMLDivElement | null>(null);
  const currentRef = useRef<HTMLDivElement | null>(null);

  // ダイヤルと同じ「ホイールで1つずつ切替」。jump モードのみ(moveには「現在地」が無い)。
  // preventDefault が効くよう、ダイヤルと同じくネイティブリスナー(passive:false)で配線。
  useEffect(() => {
    const el = listRef.current;
    if (!el || isMove || categories.length === 0) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const idx = categories.findIndex((c) => c.id === activeCategoryId);
      const base = idx === -1 ? 0 : idx;
      const delta = e.deltaY > 0 ? 1 : -1;
      const next = (base + delta + categories.length) % categories.length;
      onJump?.(categories[next].id); // パネルは閉じない(連続切替のため handleItemClick は使わない)
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [categories, activeCategoryId, isMove, onJump]);

  // 切替のたびに、選択中の行が見えるようスクロール追従する
  useEffect(() => {
    currentRef.current?.scrollIntoView({ block: "nearest" });
  }, [activeCategoryId]);

  const handleDelete = (cat: Category) => {
    if (categories.length <= 1) {
      toast("最後のカテゴリは削除できません");
      return;
    }
    const n = countPhrases(cat.items);
    if (
      window.confirm(`「${cat.name}」を削除しますか?(定型文 ${n}件も削除されます)`)
    ) {
      if (onDelete?.(cat.id)) toast("カテゴリを削除しました");
    }
  };

  const handleItemClick = (id: string) => {
    if (isMove) {
      onMoveTarget?.(id);
    } else {
      onJump?.(id);
    }
    onClose();
  };

  const handleAdd = () => {
    const name = newName.trim();
    if (name === "") return;
    const id = onAdd(name);
    setNewName("");
    toast(`カテゴリ「${name}」を追加しました`);
    if (isMove && id) onMoveTarget?.(id);
    onClose();
  };

  return (
    <div
      ref={listRef}
      style={{
        position: "absolute",
        top: 60,
        left: 10,
        right: 10,
        maxHeight: 420,
        overflowY: "auto",
        background: "var(--panel)",
        border: "2px solid var(--ink)",
        borderRadius: 12,
        boxShadow: "var(--shadow)",
        zIndex: 11,
      }}
    >
      {isMove && (
        <div
          style={{
            padding: "8px 12px",
            fontSize: 11,
            fontWeight: 700,
            color: "var(--accent-deep)",
            background: "var(--accent-soft)",
            borderBottom: "1.5px solid var(--border)",
          }}
        >
          移動先のカテゴリを選択
        </div>
      )}

      {categories.map((cat) => {
        const current = cat.id === activeCategoryId && !isMove;
        return (
          <div
            key={cat.id}
            ref={current ? currentRef : undefined}
            onClick={() => handleItemClick(cat.id)}
            style={{
              padding: "9px 12px",
              fontSize: 12.5,
              fontWeight: 600,
              borderBottom: "1px solid var(--border)",
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 6,
              background: current ? "var(--accent-soft)" : "transparent",
              color: current ? "var(--accent-deep)" : "var(--ink)",
            }}
          >
            <span>{cat.name}</span>
            {!isMove && (
              <span
                title="このカテゴリを削除"
                onClick={(e) => {
                  e.stopPropagation();
                  handleDelete(cat);
                }}
                style={{
                  fontSize: 11,
                  color: "var(--sub)",
                  padding: "2px 6px",
                  borderRadius: 6,
                  cursor: "pointer",
                }}
              >
                🗑
              </span>
            )}
          </div>
        );
      })}

      <div style={{ display: "flex", gap: 6, padding: 8 }}>
        <input
          type="text"
          value={newName}
          placeholder="新しいカテゴリ名"
          onChange={(e) => setNewName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") handleAdd();
          }}
          style={{
            flex: 1,
            border: "1.5px solid var(--border)",
            borderRadius: 8,
            padding: "6px 8px",
            fontSize: 12,
            fontFamily: "inherit",
            background: "var(--panel)",
            color: "var(--ink)",
          }}
        />
        <button
          onClick={handleAdd}
          style={{
            border: "2px solid var(--ink)",
            background: "var(--accent)",
            color: "var(--ink)",
            borderRadius: 8,
            padding: "6px 12px",
            fontSize: 12,
            fontWeight: 700,
            cursor: "pointer",
            flexShrink: 0,
          }}
        >
          追加
        </button>
      </div>
    </div>
  );
}
