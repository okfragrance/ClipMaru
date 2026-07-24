// storage/historyStore.ts
// 【R1】履歴は SQLite の relational テーブル history。localStorage は使わない。
// §4 でバックアップ対象外のため PERSIST_SCHEMA には載せず、この専用ストアで扱う
// (バックアップ配線漏れ=R2 の事故が原理的に起きないドメイン)。
//
// ・追記はクリップボード変化ごとの高頻度。
// 【MRU方式・仕様確定 2026-07-24】同一 content を再コピーしたときは、履歴内の古い行を
// 削除してから最新として先頭に追加する(「最新のものが上に来て、下の同じものは消える」
// というユーザーの明示要望)。結果として同一内容が履歴内に複数行残ることはない。
// ・保持上限 HISTORY_CAP を超えたら古いものから自動削除。
// ・リッチ/プレーンは両方保持し、コピー時に force_plain でどちらを書くか選ぶ。

import type { Database } from "./db";
import type { ClipFormat, HistoryItem } from "../core/types.js";
import { newId } from "../core/phrasebook.js";

/** 履歴の保持上限。仕様「少なくとも数百件」を満たしつつDBを軽量に保つ */
export const HISTORY_CAP = 500;

/** DB の行(snake_case) */
interface HistoryRow {
  id: string;
  content: string;
  content_rich: string | null;
  format: string;
  force_plain: number;
  created_at: number;
}

function rowToItem(r: HistoryRow): HistoryItem {
  return {
    id: r.id,
    content: r.content,
    contentRich: r.content_rich,
    format: r.format === "rich" ? "rich" : "plain",
    forcePlain: r.force_plain !== 0,
    createdAt: r.created_at,
  };
}

export interface NewClip {
  content: string;
  /** リッチ本文(HTML/RTF)。プレーンのみなら null */
  contentRich?: string | null;
  format: ClipFormat;
}

export class HistoryStore {
  constructor(private db: Database) {}

  /**
   * クリップボードの内容を1件記録する。
   *
   * 【MRU方式】同一 content が既に履歴内にあれば、まずその行を削除してから
   * 新しい行として追加する。見た目上は「最新のものが先頭に来て、下にあった同じものは
   * 消える」という単一の履歴行に統合される(フォーマットが plain⇔rich で変わっていても
   * 同じ文面なら同一クリップとみなす。force_plain トグルは新規コピーとして 0 にリセット)。
   * 履歴内に同一内容の行が複数残ることはない。
   */
  async add(clip: NewClip): Promise<string> {
    // 既存の同一内容を先に消す(あれば)
    await this.db.execute("DELETE FROM history WHERE content = $1", [clip.content]);

    const id = newId();
    const now = Date.now();
    await this.db.execute(
      `INSERT INTO history (id, content, content_rich, format, force_plain, created_at)
       VALUES ($1, $2, $3, $4, 0, $5)`,
      [id, clip.content, clip.contentRich ?? null, clip.format, now]
    );

    // 上限を超えた古い履歴を削除(新しい HISTORY_CAP 件を残す)
    await this.db.execute(
      `DELETE FROM history WHERE id NOT IN (
         SELECT id FROM history ORDER BY created_at DESC LIMIT $1
       )`,
      [HISTORY_CAP]
    );
    return id;
  }

  /** 新しい順に一覧取得(既定で上限まで) */
  async list(limit: number = HISTORY_CAP): Promise<HistoryItem[]> {
    const rows = await this.db.select<HistoryRow[]>(
      "SELECT * FROM history ORDER BY created_at DESC LIMIT $1",
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

  /** 1件削除 */
  async remove(id: string): Promise<void> {
    await this.db.execute("DELETE FROM history WHERE id = $1", [id]);
  }

  /** 全消去(設定パネルの手動クリア用) */
  async clear(): Promise<void> {
    await this.db.execute("DELETE FROM history");
  }
}
