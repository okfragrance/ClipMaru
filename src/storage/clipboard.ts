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
