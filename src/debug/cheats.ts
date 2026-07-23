// debug/cheats.ts
// 【House Rule R8】デバッグ機能はこのディレクトリに隔離し、
// import.meta.env.DEV ガード必須。本番ビルドではツリーシェイクで消える。
// UIからの導線(チートボタン等)もDEV限定で描画すること。

import type { Engine } from "../core/engine";
import { RewardLedger } from "../core/economy/rewardLedger";
import type { Database } from "../storage/db";

export function installDevtools(engine: Engine, db: Database): void {
  if (!import.meta.env.DEV) return;

  const ledger = new RewardLedger(db);

  // 【R6】チートでも付与はledger経由。直接 totalXp += は書かない。
  (window as unknown as Record<string, unknown>).DEBUG_grantXp = async (
    n: number
  ) => {
    const key = `cheat:xp:${Date.now()}`;
    if (await ledger.grantOnce(key, { xp: n })) {
      engine.applyReward({ xp: n });
    }
  };

  (window as unknown as Record<string, unknown>).DEBUG_dumpState = () =>
    engine.toSave();
}
