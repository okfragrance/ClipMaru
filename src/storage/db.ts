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
  // v5: blobs.data(旧BLOB宣言列)への二重書き込みをやめ、冗長分を解放する。
  // v4以降、読み取りは data_text のみを使うため data に実データを二重保持する必要が無く、
  // 画像1枚あたり容量が2倍になっていた(#4)。data_text を持つ(=完全に復元可能な)行の
  // data だけを空にして解放する。data_text を持たない古い行は唯一の実体を失わないよう
  // 触らない(それらは v4 で読めなくなった破損行で、いずれ IMAGE_CAP 超過で自然消滅する)。
  // 以降の新規書き込みも data には '' を入れる(historyStore.addImage)。NOT NULL は空文字で満たす。
  `
  UPDATE blobs SET data = '' WHERE data_text IS NOT NULL;
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
    // 1マイグレーション本体と user_version の更新を「1回の execute」にまとめて
    // BEGIN/COMMIT で包む。tauri-plugin-sql の execute は1呼び出し=単一コネクション
    // 上で複数文をまとめて流すため、こうすることで両者が同一トランザクションになる。
    // 途中で失敗すればスキーマ変更も user_version の前進も一緒に巻き戻るので、
    // 「半分だけ適用され、次回起動で "テーブルが既に存在" して恒久起動不能」という
    // 事故が起きない(user_version が進んでいなければ、この同じ v から丸ごと再実行される)。
    await db.execute(
      `BEGIN;\n${MIGRATIONS[v]}\nPRAGMA user_version = ${v + 1};\nCOMMIT;`
    );
  }
  return db;
}

export type { Database };
