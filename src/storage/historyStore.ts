// storage/historyStore.ts
// 【R1】履歴は SQLite の relational テーブル history。localStorage は使わない。
// §4 でバックアップ対象外のため PERSIST_SCHEMA には載せず、この専用ストアで扱う
// (バックアップ配線漏れ=R2 の事故が原理的に起きないドメイン)。
//
// ・追記はクリップボード変化ごとの高頻度。
// 【MRU方式・仕様確定 2026-07-24】同一 content を再コピーしたときは、履歴内の古い行を
// 削除してから最新として先頭に追加する(「最新のものが上に来て、下の同じものは消える」
// というユーザーの明示要望)。結果として同一内容が履歴内に複数行残ることはない。
// ・保持上限 HISTORY_CAP を超えたら古いものから自動削除。画像は IMAGE_CAP で別カウント。
// ・リッチ/プレーンは両方保持し、コピー時に force_plain でどちらを書くか選ぶ。
//
// 画像(format='image')の扱い【R1: 画像は分離、本文には参照IDのみ】:
// ・実データ(PNGバイト列)は blobs テーブルへ。history.blob_id が参照するだけ。
// ・blobs.data(BLOB宣言・NOT NULL)に base64 文字列を書き込む運用だったが、実機で
//   サムネイル破損・コピー失敗(画像の代わりに古いクリップボード内容が残る)が発生した。
//   原因: tauri-plugin-sql の列→JSON変換は「クエリ結果列の宣言型」で分岐する仕様
//   (実行時の値の型ではない)ため、BLOB宣言列は常に Vec<u8> 経由の数値配列として
//   返ってくる。書き込んだのは base64文字列(ASCIIのみ)なので理論上は
//   UTF-8バイト列とみなして復元できるはずだったが、実機で復元結果が壊れていた。
// ・【v4以降】そのためあいまいさの原因そのものを避け、素直に TEXT 宣言の
//   blobs.data_text 列を新設し、こちらを読み取りの正とする(data列はNOT NULL制約
//   のため書き込みだけは維持するが、読み取りには使わない)。TEXT宣言列は
//   プラグインの変換でそのままJS文字列として返るため、バイト列復元は不要。

import type { Database } from "./db";
import type { ClipFormat, HistoryItem } from "../core/types.js";
import { newId } from "../core/phrasebook.js";

/** 履歴の保持上限。仕様「少なくとも数百件」を満たしつつDBを軽量に保つ */
export const HISTORY_CAP = 500;

/** 画像履歴の保持上限。テキストとは別カウント(仕様: 5枚程度) */
export const IMAGE_CAP = 5;

/** DB の行(snake_case)。LEFT JOIN blobs の結果も含む */
interface HistoryRow {
  id: string;
  content: string;
  content_rich: string | null;
  format: string;
  force_plain: number;
  created_at: number;
  blob_id: string | null;
  blob_data_text: string | null;
  blob_mime: string | null;
}

function rowToItem(r: HistoryRow): HistoryItem {
  let imageDataUrl: string | null = null;
  if (r.blob_data_text && r.blob_mime) {
    imageDataUrl = `data:${r.blob_mime};base64,${r.blob_data_text}`;
  }
  const format: ClipFormat =
    r.format === "rich" ? "rich" : r.format === "image" ? "image" : "plain";
  return {
    id: r.id,
    content: r.content,
    contentRich: r.content_rich,
    format,
    forcePlain: r.force_plain !== 0,
    createdAt: r.created_at,
    imageDataUrl,
  };
}

export interface NewClip {
  content: string;
  /** リッチ本文(HTML/RTF)。プレーンのみなら null */
  contentRich?: string | null;
  format: ClipFormat;
}

export interface NewImageClip {
  /** 表示用ラベル(呼び出し側で "画像 (幅×高さ)" 等を組み立てて渡す) */
  content: string;
  /** PNGバイト列の base64 文字列 */
  imageBase64: string;
}

export class HistoryStore {
  constructor(private db: Database) {}

  /**
   * クリップボードのテキストを1件記録する。
   *
   * 【MRU方式】同一 content が既に履歴内にあれば、まずその行を削除してから
   * 新しい行として追加する。見た目上は「最新のものが先頭に来て、下にあった同じものは
   * 消える」という単一の履歴行に統合される(フォーマットが plain⇔rich で変わっていても
   * 同じ文面なら同一クリップとみなす。force_plain トグルは新規コピーとして 0 にリセット)。
   * 履歴内に同一内容の行が複数残ることはない。
   */
  async add(clip: NewClip): Promise<string> {
    // 既存の同一内容を先に消す(あれば)。image行を巻き込まないようformatも絞る。
    await this.db.execute(
      "DELETE FROM history WHERE content = $1 AND format != 'image'",
      [clip.content]
    );

    const id = newId();
    const now = Date.now();
    await this.db.execute(
      `INSERT INTO history (id, content, content_rich, format, force_plain, created_at)
       VALUES ($1, $2, $3, $4, 0, $5)`,
      [id, clip.content, clip.contentRich ?? null, clip.format, now]
    );

    // 上限を超えた古いテキスト履歴を削除(新しい HISTORY_CAP 件を残す)。
    // image行はIMAGE_CAPで別管理するため、ここでは対象外にする。
    const overflow = await this.db.select<{ id: string }[]>(
      `SELECT id FROM history WHERE format != 'image' AND id NOT IN (
         SELECT id FROM history WHERE format != 'image'
         ORDER BY created_at DESC LIMIT $1
       )`,
      [HISTORY_CAP]
    );
    for (const row of overflow) {
      await this.db.execute("DELETE FROM history WHERE id = $1", [row.id]);
    }
    return id;
  }

  /**
   * クリップボードの画像を1件記録する【R1: 実データはblobsへ、historyは参照IDのみ】。
   * IMAGE_CAP 件を超えたら古いものから削除し、対応する blobs 行も同時に消す(R7)。
   */
  async addImage(clip: NewImageClip): Promise<string> {
    const blobId = newId();
    const now = Date.now();
    await this.db.execute(
      "INSERT INTO blobs (id, mime, data, data_text, created_at) VALUES ($1, $2, $3, $4, $5)",
      [blobId, "image/png", clip.imageBase64, clip.imageBase64, now]
    );

    const id = newId();
    await this.db.execute(
      `INSERT INTO history (id, content, content_rich, format, force_plain, blob_id, created_at)
       VALUES ($1, $2, NULL, 'image', 0, $3, $4)`,
      [id, clip.content, blobId, now]
    );

    const overflow = await this.db.select<{ id: string; blob_id: string | null }[]>(
      `SELECT id, blob_id FROM history WHERE format = 'image' AND id NOT IN (
         SELECT id FROM history WHERE format = 'image'
         ORDER BY created_at DESC LIMIT $1
       )`,
      [IMAGE_CAP]
    );
    for (const row of overflow) {
      await this.deleteRowAndBlob(row.id, row.blob_id);
    }
    return id;
  }

  /** 新しい順に一覧取得(既定で上限まで)。画像は blobs を LEFT JOIN して表示用URLも返す */
  async list(limit: number = HISTORY_CAP): Promise<HistoryItem[]> {
    const rows = await this.db.select<HistoryRow[]>(
      `SELECT h.*, b.data_text as blob_data_text, b.mime as blob_mime
       FROM history h
       LEFT JOIN blobs b ON h.blob_id = b.id
       ORDER BY h.created_at DESC LIMIT $1`,
      [limit]
    );
    return rows.map(rowToItem);
  }

  /**
   * リッチ/プレーンのコピー指定トグル(仕様: リッチ項目のみ切替可能)。
   * 保存したトグル状態は次回起動後も残る。
   */
  async setForcePlain(id: string, forcePlain: boolean): Promise<void> {
    await this.db.execute(
      "UPDATE history SET force_plain = $1 WHERE id = $2",
      [forcePlain ? 1 : 0, id]
    );
  }

  /** 1件削除。image行なら対応するblobsも同時に削除する(R7) */
  async remove(id: string): Promise<void> {
    const rows = await this.db.select<{ blob_id: string | null }[]>(
      "SELECT blob_id FROM history WHERE id = $1",
      [id]
    );
    await this.deleteRowAndBlob(id, rows[0]?.blob_id ?? null);
  }

  /** 全消去(設定パネルの手動クリア用)。blobsも道連れに全消去する(R7) */
  async clear(): Promise<void> {
    await this.db.execute("DELETE FROM history");
    await this.db.execute("DELETE FROM blobs");
  }

  private async deleteRowAndBlob(id: string, blobId: string | null): Promise<void> {
    await this.db.execute("DELETE FROM history WHERE id = $1", [id]);
    if (blobId) {
      await this.db.execute("DELETE FROM blobs WHERE id = $1", [blobId]);
    }
  }
}
