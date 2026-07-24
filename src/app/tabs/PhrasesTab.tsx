// app/tabs/PhrasesTab.tsx
// 定型文タブ本体。ダイヤル(カテゴリ切替) / sticky 追加ボタン / 一覧(定型文・区切り線)
// / 編集パネル / カテゴリ一覧 / 右クリックメニュー / D&D 並べ替え / 選択モード を配線する。
// ロジックは usePhrasebook(engine)に委譲。ここは表示と入力のみ(R5)。

import { useEffect, useMemo, useRef, useState } from "react";
import type { Phrasebook } from "../hooks/usePhrasebook";
import { computeCategoryView } from "../../core/phrasebook";
import { writePlainText } from "../../storage/clipboard";
import { useToast } from "../components/Toast";
import { EditPanel } from "../components/EditPanel";
import { CategoryPanel } from "../components/CategoryPanel";
import { Tooltip } from "../components/Tooltip";
import {
  PhraseContextMenu,
  type ContextTarget,
} from "../components/PhraseContextMenu";

type Overlay = "none" | "category" | "categoryMove" | "edit";

interface EditState {
  title: string;
  itemId: string | null; // null = 新規
  insertIndex?: number;
  initialLabel: string;
  initialContent: string;
}

interface MenuState {
  x: number;
  y: number;
  target: ContextTarget | null;
}

export function PhrasesTab({ book }: { book: Phrasebook }) {
  const { categories, activeCategory, activeIndex, actions } = book;
  const toast = useToast();

  const [overlay, setOverlay] = useState<Overlay>("none");
  const [edit, setEdit] = useState<EditState | null>(null);
  const [menu, setMenu] = useState<MenuState | null>(null);
  const [editingDividerId, setEditingDividerId] = useState<string | null>(null);
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const dragIndex = useRef<number | null>(null);
  const dialRef = useRef<HTMLDivElement | null>(null);

  const rows = useMemo(
    () => (activeCategory ? computeCategoryView(activeCategory.items) : []),
    [activeCategory]
  );
  const endIndex = activeCategory ? activeCategory.items.length : 0;

  // ダイヤル上のホイールでカテゴリを1つずつ切替(passive:false で preventDefault)
  useEffect(() => {
    const el = dialRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      actions.cycleCategory(e.deltaY > 0 ? 1 : -1);
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [actions]);

  // 右クリックメニューは外側クリック/スクロールで閉じる
  useEffect(() => {
    if (!menu) return;
    const close = () => setMenu(null);
    document.addEventListener("click", close);
    document.addEventListener("scroll", close, true);
    return () => {
      document.removeEventListener("click", close);
      document.removeEventListener("scroll", close, true);
    };
  }, [menu]);

  // カテゴリが変わったら選択モードは抜ける(選択item idは別カテゴリの内容を指してしまうため)
  useEffect(() => {
    setSelectionMode(false);
    setSelectedIds(new Set());
  }, [book.activeCategoryId]);

  const closeOverlay = () => {
    setOverlay("none");
    setEdit(null);
  };

  const openNewPhrase = (insertIndex?: number) => {
    setEdit({
      title: "定型文を追加",
      itemId: null,
      insertIndex,
      initialLabel: "",
      initialContent: "",
    });
    setOverlay("edit");
  };

  const openEditPhrase = (
    itemId: string,
    label: string,
    labelIsAuto: boolean,
    content: string
  ) => {
    setEdit({
      title: "定型文を編集",
      itemId,
      // 自動見出しは編集欄では空にして「自動生成のまま」を表現
      initialLabel: labelIsAuto ? "" : label,
      initialContent: content,
    });
    setOverlay("edit");
  };

  const handleSaveEdit = (label: string, content: string) => {
    if (!edit) return;
    if (edit.itemId === null) {
      actions.addPhrase({ label, content }, edit.insertIndex);
      toast("追加しました");
    } else {
      actions.updatePhrase(edit.itemId, { label, content });
      toast("保存しました");
    }
    closeOverlay();
  };

  const handleCopy = async (content: string) => {
    const ok = await writePlainText(content);
    const preview =
      content.length > 18 ? content.slice(0, 18) + "…" : content;
    toast(ok ? `コピーしました: ${preview}` : "コピーに失敗しました");
  };

  // 右クリック: 選択モード中はメニューを出さない。対象行(data-*)を読み取ってメニューを開く
  const onListContextMenu = (e: React.MouseEvent) => {
    if (selectionMode) return;
    e.preventDefault();
    const rowEl = (e.target as HTMLElement).closest<HTMLElement>("[data-index]");
    if (rowEl) {
      setMenu({
        x: e.clientX,
        y: e.clientY,
        target: {
          kind: rowEl.dataset.kind as "phrase" | "divider",
          itemId: rowEl.dataset.itemid as string,
          index: Number(rowEl.dataset.index),
          label: rowEl.dataset.label ?? "",
        },
      });
    } else {
      setMenu({ x: e.clientX, y: e.clientY, target: null });
    }
  };

  const handleMenuDelete = (target: ContextTarget) => {
    setMenu(null);
    if (target.kind === "phrase") {
      if (window.confirm(`「${target.label}」を削除しますか?`)) {
        actions.deleteItem(target.itemId);
        toast("削除しました");
      }
    } else {
      if (window.confirm("この区切り線を削除しますか?(中の定型文は削除されません)")) {
        actions.deleteItem(target.itemId);
        toast("区切り線を削除しました");
      }
    }
  };

  // ── 選択モード ────────────────────────
  const enterSelectionMode = (initialId?: string) => {
    setSelectionMode(true);
    setEditingDividerId(null);
    setSelectedIds(initialId ? new Set([initialId]) : new Set());
  };
  const exitSelectionMode = () => {
    setSelectionMode(false);
    setSelectedIds(new Set());
  };
  const toggleSelected = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };
  const handleSelectionDelete = () => {
    if (selectedIds.size === 0) {
      toast("定型文を選択してください");
      return;
    }
    if (window.confirm(`${selectedIds.size}件の定型文を削除しますか?`)) {
      const n = actions.deleteItems(Array.from(selectedIds));
      exitSelectionMode();
      toast(`${n}件削除しました`);
    }
  };
  const handleSelectionMove = () => {
    if (selectedIds.size === 0) {
      toast("定型文を選択してください");
      return;
    }
    setOverlay("categoryMove");
  };

  // ── D&D ──────────────────────────────
  const onDrop = (toIndex: number) => {
    const from = dragIndex.current;
    dragIndex.current = null;
    if (from === null || from === toIndex) return;
    actions.reorderItem(from, toIndex);
    toast("並べ替えました");
  };

  const handleStyle: React.CSSProperties = {
    color: "var(--sub)",
    fontSize: 13,
    letterSpacing: -2,
    flexShrink: 0,
    cursor: "grab",
    padding: "2px 4px",
  };

  return (
    <div style={{ position: "relative" }}>
      {/* sticky ツールバー: ダイヤル + (追加ボタン | 選択バー) */}
      <div
        style={{
          position: "sticky",
          top: 0,
          zIndex: 6,
          background: "var(--panel)",
          paddingBottom: 2,
        }}
      >
        <div
          ref={dialRef}
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 8,
            padding: "9px 6px",
            marginBottom: 8,
            background: "var(--cream)",
            border: "2px solid var(--ink)",
            borderRadius: 12,
            userSelect: "none",
            cursor: "ns-resize",
          }}
        >
          <div
            onClick={() => actions.cycleCategory(-1)}
            style={{ fontSize: 12, color: "var(--sub)", cursor: "pointer", padding: "4px 7px" }}
            title="前のカテゴリ"
          >
            ▲
          </div>
          <div
            onClick={() => setOverlay("category")}
            style={{ flex: 1, textAlign: "center", cursor: "pointer" }}
            title="カテゴリ一覧"
          >
            <div style={{ fontSize: 14, fontWeight: 700 }}>
              {activeCategory?.name ?? "—"}
            </div>
          </div>
          <div
            onClick={() => setOverlay("category")}
            style={{ fontSize: 12, color: "var(--sub)", cursor: "pointer", padding: "4px 7px" }}
            title="カテゴリ一覧"
          >
            ▼
          </div>
          <div
            style={{ fontSize: 9.5, color: "var(--sub)", width: 32, textAlign: "center" }}
          >
            {categories.length > 0 ? `${activeIndex + 1} / ${categories.length}` : ""}
          </div>
        </div>

        {selectionMode ? (
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              padding: "7px 8px",
              marginBottom: 6,
              background: "var(--accent-soft)",
              border: "2px solid var(--accent-deep)",
              borderRadius: 10,
            }}
          >
            <span style={{ flex: 1, fontSize: 12, fontWeight: 700, color: "var(--accent-deep)" }}>
              {selectedIds.size}件選択中
            </span>
            <button onClick={handleSelectionMove} style={selectionBtnStyle("var(--accent)")}>
              移動
            </button>
            <button onClick={handleSelectionDelete} style={selectionBtnStyle("var(--danger-soft)", "var(--danger)")}>
              削除
            </button>
            <button onClick={exitSelectionMode} style={selectionBtnStyle("var(--panel)")}>
              キャンセル
            </button>
          </div>
        ) : (
          <div style={{ display: "flex", gap: 6, marginBottom: 6 }}>
            <div onClick={() => openNewPhrase(endIndex)} style={addButtonStyle}>
              ＋ 定型文
            </div>
            <div
              onClick={() => {
                actions.addDivider();
                toast("区切り線を追加しました");
              }}
              style={addButtonStyle}
            >
              ＋ 区切り線
            </div>
          </div>
        )}
      </div>

      {/* オーバーレイ背景 */}
      {overlay !== "none" && (
        <div
          onClick={closeOverlay}
          style={{
            position: "absolute",
            inset: 0,
            background: "rgba(58,50,41,0.35)",
            zIndex: 10,
          }}
        />
      )}

      {overlay === "category" && (
        <CategoryPanel
          categories={categories}
          activeCategoryId={book.activeCategoryId}
          mode="jump"
          onJump={(id) => actions.setActiveCategory(id)}
          onDelete={(id) => actions.deleteCategory(id)}
          onAdd={actions.addCategory}
          onClose={closeOverlay}
        />
      )}

      {overlay === "categoryMove" && (
        <CategoryPanel
          categories={categories}
          activeCategoryId={book.activeCategoryId}
          mode="move"
          onMoveTarget={(targetId) => {
            const ids = Array.from(selectedIds);
            const n = actions.moveItemsToCategory(ids, targetId);
            exitSelectionMode();
            toast(`${n}件を移動しました`);
          }}
          onAdd={actions.addCategory}
          onClose={closeOverlay}
        />
      )}

      {overlay === "edit" && edit && (
        <EditPanel
          key={edit.itemId ?? "new"}
          title={edit.title}
          initialLabel={edit.initialLabel}
          initialContent={edit.initialContent}
          onCancel={closeOverlay}
          onSave={handleSaveEdit}
        />
      )}

      {menu && (
        <PhraseContextMenu
          x={menu.x}
          y={menu.y}
          target={menu.target}
          endIndex={endIndex}
          onAddPhrase={(index) => {
            setMenu(null);
            openNewPhrase(index);
          }}
          onAddDivider={(index) => {
            setMenu(null);
            actions.addDivider(index);
            toast("区切り線を追加しました");
          }}
          onDelete={handleMenuDelete}
          onSelectMove={(target) => {
            setMenu(null);
            enterSelectionMode(target.itemId);
          }}
        />
      )}

      {/* 一覧 */}
      <div onContextMenu={onListContextMenu}>
        {rows.map((row) => {
          const commonDnd = selectionMode
            ? {
                "data-index": row.index,
                "data-kind": row.kind,
                "data-itemid": row.id,
              }
            : {
                draggable: true,
                onDragStart: (e: React.DragEvent) => {
                  dragIndex.current = row.index;
                  // 一部のWebView(WebView2含む)は dataTransfer にデータが無いと
                  // dragstart は発火してもドラッグが実際に開始されず、以後の
                  // dragover/drop が一切発火しないことがある。setData は必須。
                  e.dataTransfer.effectAllowed = "move";
                  e.dataTransfer.setData("text/plain", row.id);
                },
                onDragOver: (e: React.DragEvent) => e.preventDefault(),
                onDrop: () => onDrop(row.index),
                "data-index": row.index,
                "data-kind": row.kind,
                "data-itemid": row.id,
              };

          if (row.kind === "divider") {
            const isEditing = !selectionMode && editingDividerId === row.id;
            return (
              <div
                key={row.id}
                {...commonDnd}
                data-label={row.displayLabel}
                className="clip-row"
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  padding: "2px 4px",
                  margin: "1px 0",
                  borderRadius: 6,
                  opacity: selectionMode ? 0.5 : 1,
                }}
              >
                <span style={{ flex: 1, height: 1.5, background: "var(--border)" }} />
                {isEditing ? (
                  <input
                    autoFocus
                    defaultValue={row.labelIsAuto ? "" : row.displayLabel}
                    onBlur={(e) => {
                      actions.setDividerLabel(row.id, e.target.value);
                      setEditingDividerId(null);
                    }}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") (e.target as HTMLInputElement).blur();
                    }}
                    style={{
                      fontSize: 10.5,
                      fontFamily: "inherit",
                      border: "1px solid var(--border)",
                      borderRadius: 4,
                      padding: "1px 4px",
                      background: "var(--panel)",
                      color: "var(--ink)",
                      width: 90,
                    }}
                  />
                ) : (
                  <span
                    onDoubleClick={
                      selectionMode ? undefined : () => setEditingDividerId(row.id)
                    }
                    title={selectionMode ? undefined : "ダブルクリックで名前を編集"}
                    style={{
                      fontSize: 10.5,
                      color: "var(--sub)",
                      fontWeight: 700,
                      whiteSpace: "nowrap",
                      cursor: selectionMode ? "default" : "pointer",
                      minWidth: 10,
                    }}
                  >
                    {row.displayLabel}
                  </span>
                )}
                <span style={{ flex: 1, height: 1.5, background: "var(--border)" }} />
                <button
                  disabled={selectionMode}
                  title="このグループの定型文に番号を表示(見た目のみ)"
                  onClick={
                    selectionMode
                      ? undefined
                      : () => {
                          actions.toggleDividerNumbered(row.id);
                          toast(row.numbered ? "番号表示をオフ" : "この下のグループに番号を表示");
                        }
                  }
                  style={{
                    flexShrink: 0,
                    width: 20,
                    height: 20,
                    borderRadius: "50%",
                    border: `1.5px solid ${row.numbered ? "var(--ink)" : "var(--border)"}`,
                    background: row.numbered ? "var(--accent)" : "var(--panel)",
                    color: row.numbered ? "var(--ink)" : "var(--sub)",
                    fontSize: 10,
                    fontWeight: 700,
                    cursor: selectionMode ? "default" : "pointer",
                    padding: 0,
                  }}
                >
                  #
                </button>
                {!selectionMode && <span style={handleStyle}>⠿</span>}
              </div>
            );
          }

          const checked = selectedIds.has(row.id);
          return (
            <div
              key={row.id}
              {...commonDnd}
              data-label={row.label}
              className="phrase-row clip-row"
              onClick={selectionMode ? () => toggleSelected(row.id) : undefined}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 6,
                padding: "7px 4px 7px 8px",
                borderBottom: "1px solid var(--border)",
                borderRadius: 6,
                cursor: selectionMode ? "pointer" : "default",
                background: selectionMode && checked ? "var(--accent-soft)" : undefined,
              }}
            >
              {selectionMode && (
                <span
                  style={{
                    flexShrink: 0,
                    fontSize: 15,
                    width: 18,
                    textAlign: "center",
                    color: "var(--accent-deep)",
                  }}
                >
                  {checked ? "☑" : "☐"}
                </span>
              )}
              <Tooltip
                text={row.content}
                onClick={selectionMode ? undefined : () => void handleCopy(row.content)}
                style={{
                  flex: 1,
                  fontSize: 12,
                  fontWeight: 700,
                  cursor: selectionMode ? "inherit" : "pointer",
                  padding: "2px 0",
                }}
              >
                {row.displayText}
              </Tooltip>
              {!selectionMode && (
                <>
                  <span
                    title="編集"
                    onClick={() =>
                      openEditPhrase(row.id, row.label, row.labelIsAuto, row.content)
                    }
                    style={{
                      fontSize: 12,
                      color: "var(--sub)",
                      flexShrink: 0,
                      padding: "2px 4px",
                      cursor: "pointer",
                    }}
                  >
                    ✎
                  </span>
                  <span style={handleStyle}>⠿</span>
                </>
              )}
            </div>
          );
        })}

        {rows.length === 0 && (
          <p style={{ fontSize: 11, color: "var(--sub)", textAlign: "center", marginTop: 16 }}>
            まだ定型文がありません。「＋ 定型文」から追加できます。
          </p>
        )}
      </div>
    </div>
  );
}

const addButtonStyle: React.CSSProperties = {
  flex: 1,
  padding: "7px 8px",
  border: "1.5px dashed var(--border)",
  borderRadius: 10,
  fontSize: 11,
  color: "var(--sub)",
  textAlign: "center",
  cursor: "pointer",
  fontWeight: 700,
};

function selectionBtnStyle(background: string, color = "var(--ink)"): React.CSSProperties {
  return {
    border: "2px solid var(--ink)",
    borderRadius: 8,
    padding: "5px 10px",
    fontSize: 11.5,
    fontWeight: 700,
    cursor: "pointer",
    background,
    color,
  };
}
