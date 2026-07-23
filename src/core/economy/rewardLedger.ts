// core/economy/rewardLedger.ts
// 【House Rule R6】報酬付与はこのledger経由のみ。直接 coins += x を書かない。
// grantKeyの粒度が冪等性を決める。例:
//   `task:${taskId}:${todayKey()}` … 同じタスクは1日1回だけ
//   `unlock:${itemId}`             … 永久に1回だけ
//
// 【R5】coreはTauri APIをimportしない。DBは構造的インターフェース
// (LedgerDb)で受け、実体は storage/db.ts の openDb() が渡す。

export interface RewardPayload {
  coins?: number;
  xp?: number;
}

export interface LedgerQueryResult {
  rowsAffected: number;
}

/** @tauri-apps/plugin-sql の Database が構造的に満たす最小インターフェース */
export interface LedgerDb {
  execute(query: string, bindValues?: unknown[]): Promise<LedgerQueryResult>;
  select<T>(query: string, bindValues?: unknown[]): Promise<T>;
}

export class RewardLedger {
  constructor(private db: LedgerDb) {}

  /**
   * 付与を試みる。既に付与済みなら false(何も起きない)。
   * true が返ったときだけ engine.applyReward(payload) を呼ぶこと。
   * 往復・連打・リプレイ・復元のどれでも二重取得は構造的に不可能。
   */
  async grantOnce(grantKey: string, payload: RewardPayload): Promise<boolean> {
    const res = await this.db.execute(
      `INSERT INTO reward_grants (grant_key, granted_at, payload)
       VALUES ($1, $2, $3) ON CONFLICT(grant_key) DO NOTHING`,
      [grantKey, Date.now(), JSON.stringify(payload)]
    );
    return res.rowsAffected > 0;
  }

  /**
   * 取り消しは対称に: 記録を消して巻き戻す。
   * 戻り値のpayloadで engine.revertReward(payload) を呼ぶこと。
   * 未付与(または取り消し済み)なら null(何も起きない)。
   *
   * 「消さずに再付与だけブロックしたい」場合はこのメソッドを使わず、
   * grant_keyを残したままにする(どちらかの方針をアプリ毎に選ぶ)。
   */
  async revoke(grantKey: string): Promise<{ payload: RewardPayload } | null> {
    const rows = await this.db.select<{ payload: string | null }[]>(
      "SELECT payload FROM reward_grants WHERE grant_key = $1",
      [grantKey]
    );
    if (rows.length === 0) return null;
    await this.db.execute("DELETE FROM reward_grants WHERE grant_key = $1", [
      grantKey,
    ]);
    const payload = rows[0].payload
      ? (JSON.parse(rows[0].payload) as RewardPayload)
      : {};
    return { payload };
  }

  /** 付与済みかの照会(UIの「受取済み」表示用) */
  async isGranted(grantKey: string): Promise<boolean> {
    const rows = await this.db.select<{ c: number }[]>(
      "SELECT COUNT(*) as c FROM reward_grants WHERE grant_key = $1",
      [grantKey]
    );
    return rows[0].c > 0;
  }
}
