// storage/db.ts
// 【House Rule R1】実データはSQLite一択。localStorageは使わない。
// tombstones / reward_grants / blobs は「初日から」作る
// (後付けは復活バグ・二重付与バグになる)。

import Database from "@tauri-apps/plugin-sql";

// マイグレーションは追記onlyの配列。PRAGMA user_version で管理。
// 既存要素の書き換えは禁止。変更が必要なら新しい要素を足す。
const MIGRATIONS: string[] = [
  // v1: 初期スキーマ
  `
  CREATE TABLE kv (
    profile_id TEXT NOT NULL,
    key        TEXT NOT NULL,
    value      TEXT NOT NULL,      -- JSON
    updated_at INTEGER NOT NULL,
    PRIMARY KEY (profile_id, key)
  );
  CREATE TABLE blobs (              -- R1: 画像は分離、本文には参照IDのみ
    id         TEXT PRIMARY KEY,
    mime       TEXT NOT NULL,
    data       BLOB NOT NULL,
    created_at INTEGER NOT NULL
  );
  CREATE TABLE tombstones (         -- R1: 削除の後付けは「復活バグ」になる
    entity     TEXT NOT NULL,
    id         TEXT NOT NULL,
    deleted_at INTEGER NOT NULL,
    PRIMARY KEY (entity, id)
  );
  CREATE TABLE reward_grants (      -- R6: 付与済み記録(べき等性の土台)
    grant_key  TEXT PRIMARY KEY,    -- 例 "task:abc123:2026-07-12"
    granted_at INTEGER NOT NULL,
    payload    TEXT                 -- 巻き戻し用に付与内容を記録
  );
  `,
  // v2: クリップボード履歴。§4 でバックアップ対象外のため kv(PERSIST_SCHEMA)
  // ではなく専用テーブルで扱う。追記が高頻度・500件で古いものを自動削除する。
  // リッチ/プレーンは両方保持し、コピー時にどちらを書くか force_plain で選ぶ。
  `
  CREATE TABLE history (
    id           TEXT PRIMARY KEY,
    content      TEXT NOT NULL,               -- プレーン(常に存在)
    content_rich TEXT,                        -- リッチ(HTML/RTF)。plainならNULL
    format       TEXT NOT NULL,               -- 'plain' | 'rich'
    force_plain  INTEGER NOT NULL DEFAULT 0,  -- 1=リッチでもプレーンでコピー
    created_at   INTEGER NOT NULL
  );
  CREATE INDEX idx_history_created ON history (created_at DESC);
  `,
  // v3: 画像履歴。R1「画像は分離、本文には参照IDのみ」に従い、実データは既存の
  // blobsテーブルへ、historyには参照IDだけを持たせる(format='image'のとき使用)。
  // テキスト500件とは別に5件上限で管理する(storage/historyStore.ts側)。
  `
  ALTER TABLE history ADD COLUMN blob_id TEXT REFERENCES blobs(id);
  `,
  // v4: blobs.data(宣言はBLOB)にbase64文字列を格納する運用だったが、実機で
  // サムネイル破損・コピー失敗(画像の代わりに古いクリップボード内容が残る)が発生した。
  // 原因は tauri-plugin-sql の列→JSON変換が「クエリ結果列の宣言型」で分岐する仕様上、
  // BLOB宣言列は常にバイト配列化され、フロント側でのバイト列→文字列復元の経路に
  // 何らかの不整合があったこと。宣言から素直にTEXTな列を新設し、そちらを正とする
  // (BLOB/TEXTの型あいまいさそのものを回避する)。既存のdata列はNOT NULL制約が
  // あるため書き込みは続けるが、読み取りはdata_textのみを使う。
  `
  ALTER TABLE blobs ADD COLUMN data_text TEXT;
  `,
];

export async function openDb(): Promise<Database> {
  const db = await Database.load("sqlite:app.db");
  await db.execute("PRAGMA journal_mode = WAL;");
  await db.execute("PRAGMA foreign_keys = ON;");

  const rows = await db.select<{ user_version: number }[]>(
    "PRAGMA user_version;"
  );
  const userVersion = rows[0]?.user_version ?? 0;
  for (let v = userVersion; v < MIGRATIONS.length; v++) {
    await db.execute(MIGRATIONS[v]);
    await db.execute(`PRAGMA user_version = ${v + 1};`);
  }
  return db;
}

export type { Database };
