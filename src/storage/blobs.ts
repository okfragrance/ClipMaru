// storage/blobs.ts
// 【House Rule R1】画像・バイナリはblobsテーブルに分離し、
// 本文(kvのJSON)には参照ID(blobId)だけを持たせる。
// JSON本文に base64 を埋め込んだ時点でレビューNG。

import type { Database } from "./db";

export interface BlobMeta {
  id: string;
  mime: string;
  createdAt: number;
}

export class BlobStore {
  constructor(private db: Database) {}

  /** 保存して参照IDを返す。本文にはこのIDだけを書く */
  async put(id: string, mime: string, data: Uint8Array): Promise<string> {
    await this.db.execute(
      `INSERT INTO blobs (id, mime, data, created_at) VALUES ($1,$2,$3,$4)
       ON CONFLICT(id) DO UPDATE SET mime=$2, data=$3`,
      [id, mime, Array.from(data), Date.now()]
    );
    return id;
  }

  async get(id: string): Promise<{ mime: string; data: Uint8Array } | null> {
    const rows = await this.db.select<{ mime: string; data: number[] }[]>(
      "SELECT mime, data FROM blobs WHERE id = $1",
      [id]
    );
    if (rows.length === 0) return null;
    return { mime: rows[0].mime, data: new Uint8Array(rows[0].data) };
  }

  /**
   * 【R7】UIの編集セッションからは直接呼ばない。
   * 削除は PendingChanges.commit() 経由のみ(tombstonesも同時に記録)。
   */
  async delete(entity: string, id: string): Promise<void> {
    await this.db.execute("DELETE FROM blobs WHERE id = $1", [id]);
    await this.db.execute(
      `INSERT INTO tombstones (entity, id, deleted_at) VALUES ($1,$2,$3)
       ON CONFLICT(entity, id) DO NOTHING`,
      [entity, id, Date.now()]
    );
  }
}
