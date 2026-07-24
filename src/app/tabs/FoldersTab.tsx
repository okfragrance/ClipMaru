// app/tabs/FoldersTab.tsx
// フォルダ/ショートカットタブ。定型文タブと同じ操作感(クリックで起動・✎で編集・
// ⠿でD&D並べ替え)だが、対象はテキストではなくパス/URL。
// 削除は定型文タブと同じく常時表示アイコンを置かず、右クリックメニューから行う
// (ドラッグ操作時の誤爆を避けるという定型文タブと同じ理由)。
// tauri-plugin-opener の openPath/openUrl(storage/opener.ts)で開く。

import { useEffect, useRef, useState } from "react";
import type { FoldersView } from "../hooks/useFolders";
import { openTarget } from "../../storage/opener";
import { useToast } from "../components/Toast";
import { FolderEditPanel } from "../components/FolderEditPanel";
import { Tooltip } from "../components/Tooltip";

interface EditState {
  id: string | null; // null = 新規
  initialLabel: string;
  initialPath: string;
}

interface MenuState {
  x: number;
  y: number;
  id: string;
  label: string;
}

export function FoldersTab({ view }: { view: FoldersView }) {
  const { folders, actions } = view;
  const toast = useToast();
  const [edit, setEdit] = useState<EditState | null>(null);
  const [menu, setMenu] = useState<MenuState | null>(null);
  const dragIndex = useRef<number | null>(null);

  // 右クリックメニューは外側クリック/スクロールで閉じる(定型文タブと同じ挙動)
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

  const handleOpen = async (path: string, label: string) => {
    const result = await openTarget(path);
    toast(
      result.ok
        ? `開きました: ${label}`
        : `開けませんでした: ${result.message ?? "不明なエラー"}`
    );
  };

  const handleSave = (label: string, path: string) => {
    const trimmedLabel = label.trim();
    const trimmedPath = path.trim();
    if (trimmedLabel === "" || trimmedPath === "") {
      toast("表示名とパスの両方を入力してください");
      return;
    }
    if (edit?.id) {
      actions.update(edit.id, { label: trimmedLabel, path: trimmedPath });
      toast("保存しました");
    } else {
      actions.add(trimmedLabel, trimmedPath);
      toast("追加しました");
    }
    setEdit(null);
  };

  const handleDelete = (id: string, label: string) => {
    setMenu(null);
    if (window.confirm(`「${label}」を削除しますか?`)) {
      actions.remove(id);
      toast("削除しました");
    }
  };

  return (
    <div style={{ position: "relative" }}>
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
          onClick={() =>
            setEdit({ id: null, initialLabel: "", initialPath: "" })
          }
          style={{
            padding: "7px 8px",
            border: "1.5px dashed var(--border)",
            borderRadius: 10,
            fontSize: 11,
            color: "var(--sub)",
            textAlign: "center",
            cursor: "pointer",
            fontWeight: 700,
            marginBottom: 6,
          }}
        >
          ＋ フォルダ/ショートカットを登録
        </div>
      </div>

      {edit !== null && (
        <>
          <div
            onClick={() => setEdit(null)}
            style={{
              position: "absolute",
              inset: 0,
              background: "rgba(58,50,41,0.35)",
              zIndex: 10,
            }}
          />
          <FolderEditPanel
            key={edit.id ?? "new"}
            title={edit.id ? "編集" : "フォルダ/ショートカットを登録"}
            initialLabel={edit.initialLabel}
            initialPath={edit.initialPath}
            onCancel={() => setEdit(null)}
            onSave={handleSave}
          />
        </>
      )}

      {menu && (
        <div
          style={{
            position: "fixed",
            left: menu.x,
            top: menu.y,
            background: "var(--panel)",
            border: "2px solid var(--ink)",
            borderRadius: 10,
            boxShadow: "var(--shadow)",
            zIndex: 20,
            overflow: "hidden",
            minWidth: 140,
          }}
          onContextMenu={(e) => e.preventDefault()}
        >
          <div
            onClick={() => handleDelete(menu.id, menu.label)}
            style={{
              padding: "9px 14px",
              fontSize: 12,
              fontWeight: 700,
              cursor: "pointer",
              color: "var(--danger)",
            }}
          >
            削除
          </div>
        </div>
      )}

      {folders.map((f, index) => (
        <div
          key={f.id}
          draggable
          onDragStart={(e) => {
            dragIndex.current = index;
            // 一部のWebView(WebView2含む)は dataTransfer にデータが無いと
            // dragstart は発火してもドラッグが実際に開始されず、以後の
            // dragover/drop が一切発火しないことがある。setData は必須。
            e.dataTransfer.effectAllowed = "move";
            e.dataTransfer.setData("text/plain", f.id);
          }}
          onDragOver={(e) => e.preventDefault()}
          onDrop={() => {
            const from = dragIndex.current;
            dragIndex.current = null;
            if (from === null || from === index) return;
            actions.reorder(from, index);
            toast("並べ替えました");
          }}
          onContextMenu={(e) => {
            e.preventDefault();
            setMenu({ x: e.clientX, y: e.clientY, id: f.id, label: f.label });
          }}
          className="clip-row"
          style={{
            display: "flex",
            alignItems: "center",
            gap: 6,
            padding: "7px 4px 7px 8px",
            borderBottom: "1px solid var(--border)",
            borderRadius: 6,
          }}
        >
          <Tooltip
            text={f.path}
            onClick={() => void handleOpen(f.path, f.label)}
            style={{ flex: 1, minWidth: 0, cursor: "pointer" }}
          >
            <div
              style={{
                fontSize: 12,
                fontWeight: 700,
                whiteSpace: "nowrap",
                overflow: "hidden",
                textOverflow: "ellipsis",
              }}
            >
              {f.label}
            </div>
            <div
              style={{
                fontSize: 10,
                color: "var(--sub)",
                whiteSpace: "nowrap",
                overflow: "hidden",
                textOverflow: "ellipsis",
              }}
            >
              {f.path}
            </div>
          </Tooltip>
          <span
            title="編集"
            onClick={() =>
              setEdit({ id: f.id, initialLabel: f.label, initialPath: f.path })
            }
            style={{ fontSize: 12, color: "var(--sub)", flexShrink: 0, padding: "2px 4px", cursor: "pointer" }}
          >
            ✎
          </span>
          <span
            style={{
              color: "var(--sub)",
              fontSize: 13,
              letterSpacing: -2,
              flexShrink: 0,
              cursor: "grab",
              padding: "2px 4px",
            }}
          >
            ⠿
          </span>
        </div>
      ))}

      {folders.length === 0 && (
        <p style={{ fontSize: 11, color: "var(--sub)", textAlign: "center", marginTop: 16 }}>
          まだ登録がありません。「＋ フォルダ/ショートカットを登録」から追加できます。
        </p>
      )}
    </div>
  );
}
