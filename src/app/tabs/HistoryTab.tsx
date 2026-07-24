// app/tabs/HistoryTab.tsx
// 履歴タブ。1行1件のコンパクト表示・クリックでコピー。リッチ項目のみ右側に
// リッチ/プレーン切替トグルを出す(プレーン項目にはボタンを出さない)。
// 画像項目(format='image')は小さいサムネイルを表示し、クリックで画像としてコピーする。
//
// コピー時のフォーマット選択(§技術検討2): format==='rich' && !forcePlain なら
// リッチ(text/plain + text/html の両方を書き込む)、それ以外はプレーンのみ。
// クリップボード監視は src-tauri/src/clipboard_watcher.rs(Rust) →
// "clipboard-changed" イベント → useClipboardWatcher(App.tsx配線)経由で自動追記される。
// 画像は5枚上限でテキスト(500件)とは別カウント(storage/historyStore.ts参照)。

import { useEffect, useState } from "react";
import type { HistoryItem } from "../../core/types";
import type { HistoryView } from "../hooks/useHistory";
import { writePlainText, writeRich, writeImage } from "../../storage/clipboard";
import { useToast } from "../components/Toast";
import { Tooltip } from "../components/Tooltip";

interface MenuState {
  x: number;
  y: number;
  id: string;
  label: string;
}

export function HistoryTab({ history }: { history: HistoryView }) {
  const toast = useToast();
  const [menu, setMenu] = useState<MenuState | null>(null);

  // 右クリックメニューは外側クリック/スクロールで閉じる(定型文・フォルダタブと同じ挙動)
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

  const handleDelete = (id: string, label: string) => {
    setMenu(null);
    const preview = label.length > 18 ? label.slice(0, 18) + "…" : label;
    if (window.confirm(`「${preview}」を履歴から削除しますか?`)) {
      void history.remove(id);
      toast("履歴から削除しました");
    }
  };

  const copy = async (item: HistoryItem, forcePlain: boolean) => {
    if (item.format === "image" && item.imageDataUrl) {
      const result = await writeImage(item.imageDataUrl);
      toast(
        result.ok
          ? "コピーしました"
          : `コピーに失敗しました: ${result.message ?? "不明なエラー"}`
      );
      return;
    }
    const ok =
      item.format === "rich" && !forcePlain
        ? await writeRich(item.content, item.contentRich)
        : await writePlainText(item.content);
    if (!ok) {
      toast("コピーに失敗しました");
      return;
    }
    toast(forcePlain ? "プレーンテキストでコピー" : "コピーしました");
  };

  return (
    <div style={{ position: "relative" }}>
      <p style={{ fontSize: 10.5, color: "var(--sub)", textAlign: "center", margin: "2px 0 8px" }}>
        クリックでコピー(右クリックで削除・リッチ項目は右のボタンでプレーンに切替)
      </p>

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

      {history.items.map((item) => {
        const isRich = item.format === "rich";
        const isImage = item.format === "image";
        return (
          <div
            key={item.id}
            onClick={() => void copy(item, item.forcePlain)}
            onContextMenu={(e) => {
              e.preventDefault();
              setMenu({ x: e.clientX, y: e.clientY, id: item.id, label: item.content });
            }}
            className="clip-row"
            style={{
              display: "flex",
              alignItems: "center",
              gap: 6,
              padding: "7px 6px",
              borderBottom: "1px solid var(--border)",
              borderRadius: 6,
              cursor: "pointer",
              fontSize: 12,
            }}
          >
            {isImage && item.imageDataUrl && (
              <img
                src={item.imageDataUrl}
                alt=""
                style={{
                  width: 28,
                  height: 28,
                  objectFit: "cover",
                  borderRadius: 4,
                  border: "1px solid var(--border)",
                  flexShrink: 0,
                }}
              />
            )}
            <Tooltip text={item.content} style={{ flex: 1, fontWeight: 700 }}>
              {item.content}
            </Tooltip>
            {isRich && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  const next = !item.forcePlain;
                  void history.setForcePlain(item.id, next);
                  void copy(item, next);
                }}
                style={{
                  fontSize: 9.5,
                  padding: "2px 8px",
                  borderRadius: 20,
                  border: "none",
                  fontWeight: 700,
                  cursor: "pointer",
                  flexShrink: 0,
                  color: "var(--panel)",
                  background: item.forcePlain ? "var(--plain-tag)" : "var(--rich-tag)",
                }}
              >
                {item.forcePlain ? "プレーン" : "リッチ"}
              </button>
            )}
          </div>
        );
      })}

      {history.items.length === 0 && (
        <p style={{ fontSize: 11, color: "var(--sub)", textAlign: "center", marginTop: 16 }}>
          履歴はまだありません。
          <br />
          何かをコピーすると、ここに自動的に追加されます。
        </p>
      )}
    </div>
  );
}
