// app/components/FolderEditPanel.tsx
// フォルダ/ショートカット登録の編集パネル。EditPanel(定型文用)と同じ配置・見た目だが
// フィールドが「表示名」+「パス/URL」の2つである点が異なる。

import { useState } from "react";

export interface FolderEditPanelProps {
  title: string;
  initialLabel: string;
  initialPath: string;
  onCancel: () => void;
  onSave: (label: string, path: string) => void;
}

export function FolderEditPanel({
  title,
  initialLabel,
  initialPath,
  onCancel,
  onSave,
}: FolderEditPanelProps) {
  const [label, setLabel] = useState(initialLabel);
  const [path, setPath] = useState(initialPath);

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
      <label style={labelStyle}>表示名</label>
      <input
        type="text"
        value={label}
        onChange={(e) => setLabel(e.target.value)}
        style={fieldStyle}
        autoFocus
      />
      <label style={labelStyle}>
        パス / URL(フォルダ・ファイル・.exe・.lnk・http(s)://など)
      </label>
      <input
        type="text"
        value={path}
        onChange={(e) => setPath(e.target.value)}
        style={fieldStyle}
        placeholder="C:\Users\...\Documents または https://..."
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
          onClick={() => onSave(label, path)}
        >
          保存
        </button>
      </div>
    </div>
  );
}
