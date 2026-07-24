// clipboard_watcher.rs
// Windowsのクリップボード変化を監視し、変化のたびに "clipboard-changed" イベントを
// フロントエンドへemitする。履歴への実際の追記・重複排除・保存は
// フロントエンド側(storage/historyStore.ts)の責務(R1: SQLiteが正のストア)。
//
// 監視方式: clipboard-win の Monitor(AddClipboardFormatListener相当のイベント駆動)。
// Monitor は「別スレッドへ移動させるのは安全でない」ため、生成した同じスレッド内で
// 使い切る(このモジュールの外に Monitor を持ち出さない)。
//
// 【デバウンス・重要】WebView(Chromium)の navigator.clipboard.writeText()/write() は、
// 単一のJS呼び出しでも内部的に複数回 OpenClipboard/SetClipboardData/CloseClipboard を
// 行うことがあり、その結果 WM_CLIPBOARDUPDATE が短時間に複数回発火することが実機で
// 確認された(ClipMaru自身のコピーが履歴に二重登録される不具合の原因)。
// try_recv() をポーリングし、一定時間(DEBOUNCE)変化が来なくなってから初めて
// クリップボードを読み取ってemitすることで、1回の論理的なコピー操作を1件に集約する。
//
// リッチ(HTML)テキストの扱い:
// ・読み取りは clipboard_win::raw::get_html が CF_HTML のヘッダ(Version/StartHTML/…)
//   を自動で剥がし、素のHTMLフラグメントだけを返してくれる。
//   ただし raw::get_html は「呼び出し前に Clipboard::open() 済みであること」が
//   前提の低レベル関数(内部で自動オープンしない)。get_clipboard_string() のような
//   簡易関数と違い、明示的に Clipboard::new_attempts() でロックしてから呼ぶ必要がある。
// ・書き戻し(コピー実行時)はフロントエンド側の navigator.clipboard.write() に
//   'text/html' Blobとして渡すだけでよい(WebView側がCF_HTMLへの再ラップを担当)。
//   → Rust側に書き込み用コマンドは不要。

use clipboard_win::monitor::Monitor;
use clipboard_win::{get_clipboard_string, raw, Clipboard};
use serde::Serialize;
use std::time::{Duration, Instant};
use tauri::{AppHandle, Emitter};

/// 変化通知が来なくなってから実際に読み取り/emitするまでの静穏期間。
/// WebViewの多段階書き込み(text/plain→text/htmlなど)を1件に集約するための猶予。
const DEBOUNCE: Duration = Duration::from_millis(250);
/// try_recv() のポーリング間隔。デバウンス精度とCPU負荷のバランス。
const POLL_INTERVAL: Duration = Duration::from_millis(40);

#[derive(Clone, Serialize)]
struct ClipboardChangedPayload {
    content: String,
    #[serde(rename = "contentRich")]
    content_rich: Option<String>,
    format: &'static str, // "plain" | "rich"
}

/// 【R8】ここはデバッグ機能ではなく本番機能。デバッグ隔離の対象外。
pub fn start_watching(app: AppHandle) {
    std::thread::spawn(move || {
        // "HTML Format" はWindows標準の登録済みクリップボード形式名。
        // register_format はプロセス内で安定したIDを返すため、監視ループの外で1回だけ呼ぶ。
        let html_format = raw::register_format("HTML Format").map(|n| n.get());

        loop {
            match Monitor::new() {
                Ok(mut monitor) => run_debounced(&mut monitor, &app, html_format),
                Err(_) => {
                    // Monitor生成失敗(他アプリがクリップボードを掴んでいる等)。
                }
            }
            std::thread::sleep(Duration::from_secs(2));
        }
    });
}

/// pending: 直近の変化通知を受けてから、まだ確定処理(読み取り+emit)していない状態。
/// DEBOUNCE時間ぶん通知が途切れたら確定させる。
///
/// 【二重防止・もう1段】デバウンスだけでは吸収しきれない(発生源が特定できていない)
/// 連続通知に備え、「直前にemitした内容と完全一致するならemitしない」を
/// このスレッドの生存期間中ずっと覚えておく。別の内容が挟まれば自動的にリセットされる
/// ため、「連続する完全重複だけをスキップ」という仕様の意図を壊さない。
fn run_debounced(monitor: &mut Monitor, app: &AppHandle, html_format: Option<u32>) {
    let mut pending_since: Option<Instant> = None;
    let mut last_emitted: Option<(String, Option<String>)> = None;
    loop {
        match monitor.try_recv() {
            Ok(true) => {
                pending_since = Some(Instant::now()); // 新しい変化。デバウンスタイマーをリセット
            }
            Ok(false) => {
                if let Some(since) = pending_since {
                    if since.elapsed() >= DEBOUNCE {
                        if let Some(payload) = read_clipboard(html_format) {
                            let key = (payload.content.clone(), payload.content_rich.clone());
                            if last_emitted.as_ref() != Some(&key) {
                                last_emitted = Some(key);
                                let _ = app.emit("clipboard-changed", payload);
                            }
                        }
                        pending_since = None;
                    }
                }
                std::thread::sleep(POLL_INTERVAL);
            }
            Err(_) => return, // 監視エラー。呼び出し元で再接続を試みる
        }
    }
}

fn read_clipboard(html_format: Option<u32>) -> Option<ClipboardChangedPayload> {
    let content = get_clipboard_string().ok()?;
    if content.is_empty() {
        return None; // 画像のみ等、テキスト表現が無いコピーは今回のスコープ外
    }

    let content_rich = html_format.and_then(|fmt| {
        // get_clipboard_string() は既に閉じているので、ここで新規に開き直す
        // (open()前提のraw関数を使う前に必須)。
        let _clip = Clipboard::new_attempts(10).ok()?;
        if !raw::is_format_avail(fmt) {
            return None;
        }
        let mut buf = Vec::new();
        raw::get_html(fmt, &mut buf).ok()?;
        String::from_utf8(buf).ok().filter(|s| !s.is_empty())
    });

    let format = if content_rich.is_some() { "rich" } else { "plain" };
    Some(ClipboardChangedPayload {
        content,
        content_rich,
        format,
    })
}
