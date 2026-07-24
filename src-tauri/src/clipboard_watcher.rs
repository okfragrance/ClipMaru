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
//
// 画像(CF_BITMAP)の扱い:
// ・画像を優先して確認し、画像として読めた場合はそれを使う(画像優先)。
//   スクリーンショットツールや画像編集ソフトの一部は、画像と一緒に付随テキスト
//   (ファイルパス等)もクリップボードに置くことがあり、「テキストが無いときだけ画像」
//   という判定だと画像コピーなのに画像扱いされない実例があったための設計。
// ・【重要・実機検証で判明】raw::get_bitmap の出力は「裸のDIB」ではなく、
//   先頭にBITMAPFILEHEADER("BM"マジックバイト等14バイト)を自前で書き込んだ、
//   **それ自体で完結した正式なBMPファイル**(clipboard-winのソースを実際に読んで確認済み)。
//   そのためファイルヘッダを別途合成する必要は無く、出力をそのまま
//   image::load_from_memory_with_format(..., ImageFormat::Bmp) に渡せばよい
//   (当初「DIBにファイルヘッダを合成する」実装をしたが、実機ログで
//   「未対応のDIBヘッダ形式」と常に失敗することが判明し、二重にヘッダを
//   付けてしまっていたのが原因だった)。
// ・BMPのままだと無圧縮で数MBになり得る(スクリーンショット等)ため、デコード後に
//   圧縮率の良いPNGへ再エンコードしてから保存する(「重くなる」というユーザー要望対策)。
// ・base64エンコードしてJSONイベント経由でフロントへ渡す(Tauri IPCはJSONなので
//   バイナリを直接送れない)。DB書き込み(blobsテーブルへの実データ保存)は
//   フロント側(historyStore.ts)の責務。

use base64::prelude::*;
use clipboard_win::monitor::Monitor;
use clipboard_win::{formats, get_clipboard_string, raw, Clipboard};
use image::ImageFormat;
use serde::Serialize;
use std::io::Cursor;
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
    /// PNGバイト列をbase64化したもの。画像コピーのときだけ Some。
    #[serde(rename = "imageBase64")]
    image_base64: Option<String>,
    format: &'static str, // "plain" | "rich" | "image"
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
    let mut last_emitted: Option<(String, Option<String>, Option<String>)> = None;
    loop {
        match monitor.try_recv() {
            Ok(true) => {
                pending_since = Some(Instant::now()); // 新しい変化。デバウンスタイマーをリセット
            }
            Ok(false) => {
                if let Some(since) = pending_since {
                    if since.elapsed() >= DEBOUNCE {
                        if let Some(payload) = read_clipboard(html_format) {
                            let key = (
                                payload.content.clone(),
                                payload.content_rich.clone(),
                                payload.image_base64.clone(),
                            );
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

/// 開発ビルドでのみ標準エラー出力にログを出す(R8: 本番ビルドでは消える)。
/// この監視ループは実機でしか挙動を確認できないため、"どこで止まったか" を
/// 追えるようにしておく(cargo tauri dev のターミナルに出力される)。
macro_rules! dbg_log {
    ($($arg:tt)*) => {
        if cfg!(debug_assertions) {
            eprintln!("[clipboard_watcher] {}", format!($($arg)*));
        }
    };
}

fn read_clipboard(html_format: Option<u32>) -> Option<ClipboardChangedPayload> {
    // 画像を優先して試す(テキストが付随していても画像コピーは画像として扱う)
    if let Some(image_payload) = read_clipboard_image() {
        return Some(image_payload);
    }

    let content = get_clipboard_string().ok().filter(|s| !s.is_empty());
    let Some(content) = content else {
        dbg_log!("画像でもテキストでもないコピー、または両方読み取り失敗");
        return None;
    };

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
        image_base64: None,
        format,
    })
}

fn read_clipboard_image() -> Option<ClipboardChangedPayload> {
    let _clip = match Clipboard::new_attempts(10) {
        Ok(c) => c,
        Err(e) => {
            dbg_log!("画像確認: クリップボードのopenに失敗 {e:?}");
            return None;
        }
    };
    if !raw::is_format_avail(formats::CF_BITMAP) {
        dbg_log!("画像確認: CF_BITMAP形式が無い(画像コピーではない)");
        return None;
    }
    dbg_log!("画像確認: CF_BITMAPを検出、読み取りを試みる");

    // get_bitmap の出力はそれ自体で完結した正式なBMPファイル(先頭にBITMAPFILEHEADER
    // 込み)。ファイルヘッダの合成は不要で、そのままデコーダに渡せる。
    let mut bmp = Vec::new();
    if let Err(e) = raw::get_bitmap(&mut bmp) {
        dbg_log!("画像確認: get_bitmap失敗 {e:?}");
        return None;
    }
    dbg_log!("画像確認: BMP {}バイト取得", bmp.len());

    let img = match image::load_from_memory_with_format(&bmp, ImageFormat::Bmp) {
        Ok(img) => img,
        Err(e) => {
            dbg_log!("画像確認: image crateでのBMPデコードに失敗 {e:?}");
            return None;
        }
    };
    let (width, height) = (img.width(), img.height());

    let mut png_bytes = Vec::new();
    if let Err(e) = img.write_to(&mut Cursor::new(&mut png_bytes), ImageFormat::Png) {
        dbg_log!("画像確認: PNGエンコードに失敗 {e:?}");
        return None;
    }
    dbg_log!("画像確認: PNG化成功 {width}x{height}, {}バイト", png_bytes.len());

    Some(ClipboardChangedPayload {
        content: format!("画像 ({width}×{height})"),
        content_rich: None,
        image_base64: Some(BASE64_STANDARD.encode(&png_bytes)),
        format: "image",
    })
}
