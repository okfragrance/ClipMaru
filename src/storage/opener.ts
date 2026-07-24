// storage/opener.ts
// フォルダ/ファイル/.exe/.lnk/URL を開く呼び出し口を1つに統一する。
// フォルダ・ファイル・実行ファイル・ショートカットは openPath、
// http/https/mailto/tel は openUrl(capabilities側でスキームが許可されている)。
//
// 【capabilities/オチ】opener:default だけでは openPath は「許可はされるがscopeが
// 空」で全パス拒否になる(openUrlはopener:defaultに組み込みscopeがあるため動くが、
// openPathは自前でscopeを持たせないと常に失敗する)。src-tauri/capabilities/default.json
// で opener:allow-open-path に scope: [{ path: "**" }] を明示済み。
// ClipMaruは個人利用のローカルユーティリティで、登録するのはユーザー自身が信頼する
// パスのみ(サンドボックスで未信頼コンテンツを扱う想定ではない)ため、ワイルドカードで
// 「ユーザーが選んだ任意のパスを開ける」ことを優先する。

const URL_SCHEME = /^(https?:|mailto:|tel:)/i;

export interface OpenResult {
  ok: boolean;
  /** 失敗時のエラーメッセージ(トーストで理由をそのまま見せるため) */
  message?: string;
}

/** 登録されたパス/URLを開く。失敗時は理由をそのまま返す(黙って握りつぶさない) */
export async function openTarget(target: string): Promise<OpenResult> {
  try {
    if (URL_SCHEME.test(target)) {
      const { openUrl } = await import("@tauri-apps/plugin-opener");
      await openUrl(target);
    } else {
      const { openPath } = await import("@tauri-apps/plugin-opener");
      await openPath(target);
    }
    return { ok: true };
  } catch (err) {
    return { ok: false, message: err instanceof Error ? err.message : String(err) };
  }
}
