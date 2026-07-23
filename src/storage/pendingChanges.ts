// storage/pendingChanges.ts
// 【House Rule R7】編集モーダルの標準形。
// 編集セッション中の削除は「予約リスト」に積むだけ。
// ・実行(副作用)は commit() のみ
// ・cancel() は「追加した仮データの掃除」だけ。既存データは触らない=副作用ゼロ
// 「削除→キャンセルしたのに消えたまま」をこの型で構造的に潰す。

import type { Database } from "./db";
import { BlobStore } from "./blobs";

export class PendingChanges {
  /** 「消す予定」の既存blob。commit()まで実際には消えない */
  removedBlobIds: string[] = [];
  /** 編集セッション中に仮追加したblob。cancel()時に掃除される */
  addedBlobIds: string[] = [];

  constructor(private entity: string) {}

  markRemove(blobId: string): void {
    if (!this.removedBlobIds.includes(blobId)) {
      this.removedBlobIds.push(blobId);
    }
  }

  markAdded(blobId: string): void {
    if (!this.addedBlobIds.includes(blobId)) {
      this.addedBlobIds.push(blobId);
    }
  }

  /** 確定: ここで初めて blobs / tombstones を操作する */
  async commit(db: Database): Promise<void> {
    const store = new BlobStore(db);
    for (const id of this.removedBlobIds) {
      await store.delete(this.entity, id);
    }
    this.removedBlobIds = [];
    this.addedBlobIds = [];
  }

  /** 取消: 仮追加だけ掃除。removedは触らない=既存データへの副作用ゼロ */
  async cancel(db: Database): Promise<void> {
    for (const id of this.addedBlobIds) {
      await db.execute("DELETE FROM blobs WHERE id = $1", [id]);
    }
    this.removedBlobIds = [];
    this.addedBlobIds = [];
  }
}
