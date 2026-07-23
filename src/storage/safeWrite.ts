// storage/safeWrite.ts
// tmp→検証→rename の安全書き込み(本体はRust側 commands/safe_write.rs)。
// SQLiteが主ストレージ(R1)なので、この経路は
// エクスポート・スナップショット・バックアップJSON用。

import { invoke } from "@tauri-apps/api/core";
import { persistReplacer } from "../core/merge";

export async function safeWriteJson(
  path: string,
  data: unknown
): Promise<void> {
  // _プレフィックスの表示用キャッシュを機械的に除外(R2)
  const json = JSON.stringify(data, persistReplacer, 2);
  await invoke("safe_write_json", { path, contents: json });
}
