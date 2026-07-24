// app/hooks/useClipboardWatcher.ts
// Rust側(src-tauri/src/clipboard_watcher.rs)がemitする "clipboard-changed" を
// 購読し、履歴へ追記する。ライフサイクル配線(R4)とは別物だが、同じく
// 「アプリ全体で1箇所だけ」の原則で App.tsx から1回だけ呼ぶこと。
//
// 実データ書き込みは HistoryStore.add() 経由(R1: SQLiteが正)。
// 連続する完全重複は HistoryStore 側で機械的にスキップされるため、
// 「自分でコピーした内容を監視が拾って二重追加してしまう」問題も自然に解消される。

import { useEffect } from "react";
import type { HistoryStore } from "../../storage/historyStore";

interface ClipboardChangedPayload {
  content: string;
  contentRich: string | null;
  format: "plain" | "rich";
}

export function useClipboardWatcher(
  history: HistoryStore | null,
  onChanged: () => void
): void {
  useEffect(() => {
    if (!history) return;
    let unlisten: (() => void) | undefined;
    let cancelled = false;

    void (async () => {
      const { listen } = await import("@tauri-apps/api/event");
      const stop = await listen<ClipboardChangedPayload>(
        "clipboard-changed",
        (event) => {
          void (async () => {
            await history.add({
              content: event.payload.content,
              contentRich: event.payload.contentRich,
              format: event.payload.format,
            });
            onChanged();
          })();
        }
      );
      if (cancelled) {
        stop();
      } else {
        unlisten = stop;
      }
    })();

    return () => {
      cancelled = true;
      unlisten?.();
    };
  }, [history, onChanged]);
}
