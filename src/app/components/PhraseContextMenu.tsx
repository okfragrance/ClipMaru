// app/components/PhraseContextMenu.tsx
// リスト上の右クリックメニュー。右クリックした行の「直前」に挿入する(index 位置)。
// 余白で右クリックした場合(target=null)は末尾追加のみ(削除は出さない)。
// 「選択して移動...」(選択モード)は次フェーズで追加する。

export interface ContextTarget {
  kind: "phrase" | "divider";
  itemId: string;
  index: number;
  label: string;
}

export interface PhraseContextMenuProps {
  x: number;
  y: number;
  /** 右クリック対象の行。余白なら null(末尾追加のみ) */
  target: ContextTarget | null;
  /** 末尾追加時のindex(= items.length) */
  endIndex: number;
  onAddPhrase: (index: number) => void;
  onAddDivider: (index: number) => void;
  onDelete: (target: ContextTarget) => void;
  /** 「選択して移動...」。target.kind === 'phrase' のときだけ表示 */
  onSelectMove: (target: ContextTarget) => void;
}

export function PhraseContextMenu({
  x,
  y,
  target,
  endIndex,
  onAddPhrase,
  onAddDivider,
  onDelete,
  onSelectMove,
}: PhraseContextMenuProps) {
  const insertIndex = target ? target.index : endIndex;

  const itemStyle: React.CSSProperties = {
    padding: "9px 14px",
    fontSize: 12,
    fontWeight: 700,
    cursor: "pointer",
  };

  return (
    <div
      style={{
        position: "fixed",
        left: x,
        top: y,
        background: "var(--panel)",
        border: "2px solid var(--ink)",
        borderRadius: 10,
        boxShadow: "var(--shadow)",
        zIndex: 20,
        overflow: "hidden",
        minWidth: 180,
      }}
      onContextMenu={(e) => e.preventDefault()}
    >
      <div style={itemStyle} onClick={() => onAddPhrase(insertIndex)}>
        ここに定型文を追加
      </div>
      <div
        style={{ ...itemStyle, borderTop: "1px solid var(--border)" }}
        onClick={() => onAddDivider(insertIndex)}
      >
        ここに区切り線を追加
      </div>
      {target?.kind === "phrase" && (
        <div
          style={{ ...itemStyle, borderTop: "1px solid var(--border)" }}
          onClick={() => onSelectMove(target)}
        >
          選択して移動...
        </div>
      )}
      {target && (
        <div
          style={{
            ...itemStyle,
            borderTop: "1px solid var(--border)",
            color: "var(--danger)",
          }}
          onClick={() => onDelete(target)}
        >
          削除
        </div>
      )}
    </div>
  );
}
