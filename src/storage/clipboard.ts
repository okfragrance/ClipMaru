// storage/clipboard.ts
// クリップボードへの書き込み。
//
// プレーン: navigator.clipboard.writeText(WebView2/Chromium上で動作)。
// リッチ: navigator.clipboard.write() に 'text/plain' + 'text/html' の2形式を
//   ClipboardItem として渡す。WebView側がOSネイティブのCF_HTMLへの再ラップを
//   担当してくれるため、Rust側に書き込み専用コマンドは不要
//   (読み取り側の src-tauri/src/clipboard_watcher.rs は clipboard-win の
//   get_html でCF_HTMLヘッダを剥がした「素のHTMLフラグメント」を渡してくるので、
//   ここで受け取る html はそのまま 'text/html' Blob にできる)。
// 画像: navigator.clipboard.write() の image/png ClipboardItem は WebView2上で
//   サポートが不完全/不安定(実機で "コピーに失敗しました" が再現)。そのため画像だけは
//   Rust側の専用コマンド write_clipboard_image(src-tauri/src/commands/clipboard_write.rs)
//   経由で clipboard-win に直接書き込む。

/** プレーンテキストをクリップボードへ書き込む。成功可否を返す */
export async function writePlainText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

/**
 * プレーン+HTMLの両形式を同時に書き込む(リッチコピー)。
 * html が無ければプレーンのみの書き込みにフォールバックする。
 */
export async function writeRich(
  plain: string,
  html: string | null
): Promise<boolean> {
  if (!html) return writePlainText(plain);
  try {
    const item = new ClipboardItem({
      "text/plain": new Blob([plain], { type: "text/plain" }),
      "text/html": new Blob([html], { type: "text/html" }),
    });
    await navigator.clipboard.write([item]);
    return true;
  } catch {
    return writePlainText(plain); // リッチ書き込みに失敗してもプレーンだけは通す
  }
}

export interface WriteImageResult {
  ok: boolean;
  /** 失敗時のエラーメッセージ(トーストで理由をそのまま見せるため) */
  message?: string;
}

/** 画像(data:image/png;base64,... の data URL)をクリップボードへ書き込む */
export async function writeImage(dataUrl: string): Promise<WriteImageResult> {
  const commaIndex = dataUrl.indexOf(",");
  if (commaIndex === -1) {
    return { ok: false, message: "不正なdata URLです" };
  }
  const base64 = dataUrl.slice(commaIndex + 1);
  try {
    const { invoke } = await import("@tauri-apps/api/core");
    await invoke("write_clipboard_image", { pngBase64: base64 });
    return { ok: true };
  } catch (err) {
    return { ok: false, message: err instanceof Error ? err.message : String(err) };
  }
}
