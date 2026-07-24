// app/App.tsx
// ClipMaru のアプリシェル。タイトルバー(常に表示トグル・設定)/ タブ / タブ内容。
// UI は「状態の表示と入力」だけ。ロジックは engine(R5)へ委譲し、永続化は
// usePhrasebook / applySetting 経由で必ず Persistence(R2)を通す。
// 色・角丸は theme.css のCSS変数のみ参照(B6: コンポーネントに直書きしない)。
//
// 設定パネル: 配色テーマ / 文字フォント / 文字サイズ / スタートアップ登録 / バックアップ。

import { useEffect, useState } from "react";
import { useAppState } from "./hooks/useAppState";
import { useLifecycle } from "./hooks/useLifecycle";
import { usePhrasebook } from "./hooks/usePhrasebook";
import { useHistory } from "./hooks/useHistory";
import { useFolders } from "./hooks/useFolders";
import { useClipboardWatcher } from "./hooks/useClipboardWatcher";
import { RestoreNotice } from "./components/RestoreNotice";
import { ToastProvider, useToast } from "./components/Toast";
import { PhrasesTab } from "./tabs/PhrasesTab";
import { HistoryTab } from "./tabs/HistoryTab";
import { FoldersTab } from "./tabs/FoldersTab";
import type { TabName, Settings, FontFamilyKey, FontScaleKey } from "../core/types";
import type { Engine } from "../core/engine";
import type { Persistence } from "../storage/persistence";
import { todayKey } from "../core/date";

async function setWindowAlwaysOnTop(value: boolean): Promise<void> {
  try {
    const { getCurrentWindow } = await import("@tauri-apps/api/window");
    await getCurrentWindow().setAlwaysOnTop(value);
  } catch {
    // Tauri 外(ブラウザ)では何もしない
  }
}

function AppInner() {
  const { engine, clock, persist, history, report, ready } = useAppState();
  useLifecycle(engine, clock, persist); // R4 の配線はここ1箇所だけ

  const book = usePhrasebook(engine, persist);
  const historyView = useHistory(history);
  const foldersView = useFolders(engine, persist);
  useClipboardWatcher(history, historyView.refresh); // 配線はここ1箇所だけ
  const toast = useToast();

  const [tab, setTab] = useState<TabName>("history");
  const [theme, setTheme] = useState("cream");
  const [fontFamily, setFontFamily] = useState<FontFamilyKey>("maru");
  const [fontScale, setFontScale] = useState<FontScaleKey>("medium");
  const [pinned, setPinned] = useState(false);
  const [autostart, setAutostart] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);

  // 起動して engine が用意できたら設定値をUIへ反映
  useEffect(() => {
    if (!ready || !engine) return;
    const s = engine.view.settings;
    setTab(s.activeTab);
    setTheme(s.theme);
    setFontFamily(s.fontFamily);
    setFontScale(s.fontScale);
    setPinned(s.alwaysOnTop);
    void setWindowAlwaysOnTop(s.alwaysOnTop);
  }, [ready, engine]);

  // テーマ/フォント/文字サイズの差し替え: documentElement の data-* を切り替えるだけ
  // (theme.css 側で :root[data-...] が変数セット・zoom を上書きする)
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
  }, [theme]);
  useEffect(() => {
    document.documentElement.dataset.font = fontFamily;
  }, [fontFamily]);
  useEffect(() => {
    document.documentElement.dataset.scale = fontScale;
  }, [fontScale]);

  // 設定パネルを開いたとき、OS側のスタートアップ登録状態を実際に問い合わせて反映
  // (登録状態はOSが持つ正なので、こちらの stored フラグは持たず毎回照会する)
  useEffect(() => {
    if (!settingsOpen) return;
    void (async () => {
      try {
        const { isEnabled } = await import("@tauri-apps/plugin-autostart");
        setAutostart(await isEnabled());
      } catch {
        // Tauri 外(ブラウザ)では何もしない
      }
    })();
  }, [settingsOpen]);

  const applySetting = (patch: Partial<Settings>) => {
    const e = engine as Engine | null;
    const p = persist as Persistence | null;
    if (!e || !p) return;
    e.updateSettings(patch);
    void p.saveAll(e.toSave());
  };

  const switchTab = (t: TabName) => {
    setTab(t);
    applySetting({ activeTab: t });
  };

  const togglePin = () => {
    const next = !pinned;
    setPinned(next);
    applySetting({ alwaysOnTop: next });
    void setWindowAlwaysOnTop(next);
    toast(next ? "常に手前に表示します" : "通常表示に戻します");
  };

  const changeTheme = (t: string) => {
    setTheme(t);
    applySetting({ theme: t });
  };

  const changeFont = (f: FontFamilyKey) => {
    setFontFamily(f);
    applySetting({ fontFamily: f });
  };

  const changeFontScale = (s: FontScaleKey) => {
    setFontScale(s);
    applySetting({ fontScale: s });
  };

  const toggleAutostart = async () => {
    try {
      const { enable, disable, isEnabled } = await import(
        "@tauri-apps/plugin-autostart"
      );
      if (await isEnabled()) {
        await disable();
      } else {
        await enable();
      }
      const now = await isEnabled();
      setAutostart(now);
      toast(now ? "スタートアップに登録しました" : "スタートアップ登録を解除しました");
    } catch {
      toast("スタートアップ設定に失敗しました");
    }
  };

  const backupExport = async () => {
    if (!persist) return;
    try {
      const { save } = await import("@tauri-apps/plugin-dialog");
      const { writeTextFile } = await import("@tauri-apps/plugin-fs");
      const path = await save({
        defaultPath: `ClipMaru_backup_${todayKey()}.json`,
        filters: [{ name: "JSON", extensions: ["json"] }],
      });
      if (!path) return; // キャンセル
      const data = await persist.exportJson();
      await writeTextFile(path, JSON.stringify(data, null, 2));
      toast("バックアップを保存しました");
    } catch {
      toast("バックアップの保存に失敗しました");
    }
  };

  const backupImport = async () => {
    if (!persist) return;
    if (!window.confirm("現在のデータは上書きされます。バックアップから復元しますか?")) {
      return;
    }
    try {
      const { open } = await import("@tauri-apps/plugin-dialog");
      const { readTextFile } = await import("@tauri-apps/plugin-fs");
      const path = await open({
        multiple: false,
        filters: [{ name: "JSON", extensions: ["json"] }],
      });
      if (!path || Array.isArray(path)) return; // キャンセル
      const text = await readTextFile(path);
      const data: unknown = JSON.parse(text);
      if (typeof data !== "object" || data === null) {
        throw new Error("invalid backup file");
      }
      await persist.importJson(data as Record<string, unknown>);
      toast("復元しました。アプリを再読み込みします");
      window.location.reload();
    } catch {
      toast("復元に失敗しました。ファイルを確認してください");
    }
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100vh" }}>
      {/* タイトルバー */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "9px 12px",
          background: "var(--accent)",
          borderBottom: "2px solid var(--ink)",
          flexShrink: 0,
        }}
      >
        <h1 style={{ fontSize: 13, margin: 0, fontWeight: 700 }}>📋 ClipMaru</h1>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <div
            onClick={() => setSettingsOpen(true)}
            title="設定"
            style={{
              width: 24,
              height: 24,
              borderRadius: "50%",
              border: "1.5px solid var(--ink)",
              background: "rgba(255,255,255,0.5)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 13,
              cursor: "pointer",
            }}
          >
            ⚙
          </div>
          <div
            onClick={togglePin}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 4,
              fontSize: 10.5,
              fontWeight: 700,
              cursor: "pointer",
              background: "rgba(255,255,255,0.5)",
              border: `1.5px solid ${pinned ? "#4CAF50" : "var(--ink)"}`,
              borderRadius: 20,
              padding: "3px 8px",
              userSelect: "none",
            }}
          >
            <span
              style={{
                width: 8,
                height: 8,
                borderRadius: "50%",
                background: pinned ? "#4CAF50" : "var(--sub)",
              }}
            />
            {pinned ? "常に表示 ON" : "常に表示 OFF"}
          </div>
        </div>
      </div>

      {/* タブ */}
      <div style={{ display: "flex", borderBottom: "2px solid var(--border)", background: "var(--cream)", flexShrink: 0 }}>
        {(["history", "phrases", "folders"] as const).map((t) => (
          <div
            key={t}
            onClick={() => switchTab(t)}
            style={{
              flex: 1,
              textAlign: "center",
              padding: "10px 0",
              fontSize: 12.5,
              fontWeight: 700,
              color: tab === t ? "var(--ink)" : "var(--sub)",
              cursor: "pointer",
              borderBottom: `3px solid ${tab === t ? "var(--accent-deep)" : "transparent"}`,
              userSelect: "none",
            }}
          >
            {t === "history" ? "履歴" : t === "phrases" ? "定型文" : "フォルダ"}
          </div>
        ))}
      </div>

      {/* 内容 */}
      {/* minHeight:0 は flex子要素の既定 min-height:auto を打ち消すために必須。
          無いと中身が入りきらないとき内部スクロールされずコンテナ自体が伸びてしまい、
          ホイールスクロールが効かなくなる(40件規模の一覧で顕在化する典型的flexbox罠)。 */}
      <div style={{ flex: 1, minHeight: 0, overflowY: "auto", padding: "10px 10px 14px", background: "var(--panel)" }}>
        {!ready || !engine ? (
          <p style={{ color: "var(--sub)" }}>読み込み中…</p>
        ) : (
          <>
            <RestoreNotice report={report} />
            {tab === "history" && <HistoryTab history={historyView} />}
            {tab === "phrases" && <PhrasesTab book={book} />}
            {tab === "folders" && <FoldersTab view={foldersView} />}
          </>
        )}
      </div>

      {/* 設定パネル(テーマ・フォント・文字サイズ・スタートアップ・バックアップ) */}
      {settingsOpen && (
        <>
          <div
            onClick={() => setSettingsOpen(false)}
            style={{ position: "fixed", inset: 0, background: "rgba(58,50,41,0.35)", zIndex: 100 }}
          />
          <div
            style={{
              position: "fixed",
              top: "50%",
              left: "50%",
              transform: "translate(-50%, -50%)",
              width: 240,
              maxHeight: "88vh",
              overflowY: "auto",
              background: "var(--panel)",
              border: "2px solid var(--ink)",
              borderRadius: 14,
              boxShadow: "var(--shadow)",
              padding: 16,
              zIndex: 101,
            }}
          >
            <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 10 }}>設定</div>
            <div style={{ fontSize: 10.5, color: "var(--sub)", fontWeight: 700, marginBottom: 6 }}>
              配色テーマ
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              {[
                { id: "cream", label: "クリーム" },
                { id: "dark", label: "ダーク" },
              ].map((opt) => (
                <button
                  key={opt.id}
                  onClick={() => changeTheme(opt.id)}
                  style={{
                    flex: 1,
                    padding: "7px 0",
                    borderRadius: 8,
                    border: `2px solid ${theme === opt.id ? "var(--accent-deep)" : "var(--border)"}`,
                    background: theme === opt.id ? "var(--accent-soft)" : "var(--panel)",
                    color: "var(--ink)",
                    fontSize: 12,
                    fontWeight: 700,
                    cursor: "pointer",
                  }}
                >
                  {opt.label}
                </button>
              ))}
            </div>

            {/* 文字フォント(丸ゴシック同梱 + システム標準)。各ボタンは実際の書体でプレビュー表示 */}
            <div style={{ fontSize: 10.5, color: "var(--sub)", fontWeight: 700, marginTop: 14, marginBottom: 6 }}>
              文字フォント
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              {[
                { id: "maru" as FontFamilyKey, label: "丸ゴシック", preview: '"Zen Maru Gothic", sans-serif' },
                { id: "gothic" as FontFamilyKey, label: "ゴシック", preview: '"Yu Gothic UI", "Meiryo", sans-serif' },
                { id: "mincho" as FontFamilyKey, label: "明朝", preview: '"Yu Mincho", serif' },
              ].map((opt) => (
                <button
                  key={opt.id}
                  onClick={() => changeFont(opt.id)}
                  style={{
                    flex: 1,
                    padding: "7px 0",
                    borderRadius: 8,
                    border: `2px solid ${fontFamily === opt.id ? "var(--accent-deep)" : "var(--border)"}`,
                    background: fontFamily === opt.id ? "var(--accent-soft)" : "var(--panel)",
                    color: "var(--ink)",
                    fontSize: 12,
                    fontWeight: 700,
                    fontFamily: opt.preview,
                    cursor: "pointer",
                  }}
                >
                  {opt.label}
                </button>
              ))}
            </div>

            {/* 文字サイズ(UI全体を段階ズーム) */}
            <div style={{ fontSize: 10.5, color: "var(--sub)", fontWeight: 700, marginTop: 14, marginBottom: 6 }}>
              文字サイズ
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              {[
                { id: "small" as FontScaleKey, label: "小" },
                { id: "medium" as FontScaleKey, label: "中" },
                { id: "large" as FontScaleKey, label: "大" },
              ].map((opt) => (
                <button
                  key={opt.id}
                  onClick={() => changeFontScale(opt.id)}
                  style={{
                    flex: 1,
                    padding: "7px 0",
                    borderRadius: 8,
                    border: `2px solid ${fontScale === opt.id ? "var(--accent-deep)" : "var(--border)"}`,
                    background: fontScale === opt.id ? "var(--accent-soft)" : "var(--panel)",
                    color: "var(--ink)",
                    fontSize: 12,
                    fontWeight: 700,
                    cursor: "pointer",
                  }}
                >
                  {opt.label}
                </button>
              ))}
            </div>

            {/* スタートアップ登録(Windows起動時に自動で開く)。状態はOS側を正として照会 */}
            <div style={{ fontSize: 10.5, color: "var(--sub)", fontWeight: 700, marginTop: 14, marginBottom: 6 }}>
              スタートアップ
            </div>
            <button
              onClick={() => void toggleAutostart()}
              style={{
                width: "100%",
                padding: "7px 10px",
                borderRadius: 8,
                border: `2px solid ${autostart ? "var(--accent-deep)" : "var(--border)"}`,
                background: autostart ? "var(--accent-soft)" : "var(--panel)",
                color: "var(--ink)",
                fontSize: 12,
                fontWeight: 700,
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
              }}
            >
              <span>Windows起動時に自動で開く</span>
              <span style={{ color: autostart ? "var(--accent-deep)" : "var(--sub)" }}>
                {autostart ? "ON" : "OFF"}
              </span>
            </button>

            <div style={{ fontSize: 10.5, color: "var(--sub)", fontWeight: 700, marginTop: 14, marginBottom: 6 }}>
              バックアップ(カテゴリ・定型文)
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <button
                onClick={() => void backupExport()}
                style={{
                  flex: 1,
                  padding: "7px 0",
                  borderRadius: 8,
                  border: "2px solid var(--border)",
                  background: "var(--panel)",
                  color: "var(--ink)",
                  fontSize: 12,
                  fontWeight: 700,
                  cursor: "pointer",
                }}
              >
                保存
              </button>
              <button
                onClick={() => void backupImport()}
                style={{
                  flex: 1,
                  padding: "7px 0",
                  borderRadius: 8,
                  border: "2px solid var(--border)",
                  background: "var(--panel)",
                  color: "var(--ink)",
                  fontSize: 12,
                  fontWeight: 700,
                  cursor: "pointer",
                }}
              >
                復元
              </button>
            </div>
            <button
              onClick={() => setSettingsOpen(false)}
              style={{
                width: "100%",
                marginTop: 12,
                padding: "7px 0",
                borderRadius: 8,
                border: "2px solid var(--ink)",
                background: "var(--panel)",
                color: "var(--ink)",
                fontSize: 12,
                fontWeight: 700,
                cursor: "pointer",
              }}
            >
              閉じる
            </button>
          </div>
        </>
      )}
    </div>
  );
}

function App() {
  return (
    <ToastProvider>
      <AppInner />
    </ToastProvider>
  );
}

export default App;
