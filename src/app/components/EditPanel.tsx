// app/components/EditPanel.tsx
// 定型文の編集パネル。見出し(空欄可) + 中身。見出しを空で保存すると自動生成へ戻る
// (自動生成は engine 側で行うため、ここは空文字をそのまま渡す)。
// PhrasesTab は開くたびに key を変えてマウントし直し、初期値を確実に反映する。

import { useState } from "react";

export interface EditPanelProps {
  title: string;
  initialLabel: string;
  initialContent: string;
  onCancel: () => void;
  onSave: (label: string, content: string) => void;
}

export function EditPanel({
  title,
  initialLabel,
  initialContent,
  onCancel,
  onSave,
}: EditPanelProps) {
  const [label, setLabel] = useState(initialLabel);
  const [content, setContent] = useState(initialContent);

  const fieldStyle: React.CSSProperties = {
    width: "100%",
    border: "1.5px solid var(--border)",
    borderRadius: 8,
    padding: "6px 8px",
    fontSize: 12,
    fontFamily: "inherit",
    color: "var(--ink)",
    background: "var(--panel)",
  };
  const labelStyle: React.CSSProperties = {
    display: "block",
    fontSize: 10.5,
    color: "var(--sub)",
    fontWeight: 700,
    margin: "8px 0 3px",
  };
  const btnStyle: React.CSSProperties = {
    flex: 1,
    padding: "7px 0",
    borderRadius: 8,
    border: "2px solid var(--ink)",
    fontSize: 12,
    fontWeight: 700,
    cursor: "pointer",
  };

  return (
    <div
      style={{
        position: "absolute",
        top: 60,
        left: 10,
        right: 10,
        background: "var(--panel)",
        border: "2px solid var(--ink)",
        borderRadius: 12,
        boxShadow: "var(--shadow)",
        zIndex: 11,
        padding: 12,
      }}
    >
      <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 8 }}>
        {title}
      </div>
      <label style={labelStyle}>見出し(空欄なら本文から自動生成)</label>
      <input
        type="text"
        value={label}
        onChange={(e) => setLabel(e.target.value)}
        style={fieldStyle}
        autoFocus
      />
      <label style={labelStyle}>中身(コピーされる内容)</label>
      <textarea
        value={content}
        onChange={(e) => setContent(e.target.value)}
        style={{ ...fieldStyle, minHeight: 90, resize: "vertical" }}
      />
      <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
        <button
          style={{ ...btnStyle, background: "var(--panel)", color: "var(--ink)" }}
          onClick={onCancel}
        >
          キャンセル
        </button>
        <button
          style={{ ...btnStyle, background: "var(--accent)", color: "var(--ink)" }}
          onClick={() => onSave(label, content)}
        >
          保存
        </button>
      </div>
    </div>
  );
}
