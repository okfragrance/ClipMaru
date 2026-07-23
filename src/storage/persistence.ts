// storage/persistence.ts
// 【House Rule R2】save / load / snapshot / export / import は
// 全て PERSIST_SCHEMA をループするだけ。手書きの列挙関数を書いた時点で違反。
// 【R9】scope: "shared" のキーは profile_id = "__shared__" 固定。
// プロフィール切替で読み直すのはprofileスコープだけ(この振り分けも自動)。

import { PERSIST_SCHEMA, defaultState } from "../core/schema";
import { deepMerge, persistReplacer } from "../core/merge";
import { ErrorCollector, type RestoreReport } from "../core/errors";
import type { Database } from "./db";

const SHARED = "__shared__";

export class Persistence {
  constructor(
    private db: Database,
    private profileId: string
  ) {}

  /** 保存: schemaをループするだけ(R2)。_プレフィックスは機械的に除外 */
  async saveAll(state: Record<string, unknown>): Promise<void> {
    const now = Date.now();
    for (const f of PERSIST_SCHEMA) {
      const pid = f.scope === "shared" ? SHARED : this.profileId;
      const json = JSON.stringify(state[f.key], persistReplacer);
      await this.db.execute(
        `INSERT INTO kv (profile_id, key, value, updated_at) VALUES ($1,$2,$3,$4)
         ON CONFLICT(profile_id, key) DO UPDATE SET value=$3, updated_at=$4`,
        [pid, f.key, json, now]
      );
    }
  }

  /**
   * 復元: defaults に保存値を deep-merge。
   * ・アップデートで増えたフィールド → defaultが自動補完(復元漏れゼロ)
   * ・1キーの破損 → そのキーだけdefaultに落ち、起動は続行(PomoQuest対策)
   * 呼び出し側の契約: report.errors か report.defaulted が空でなければ
   * 必ずUIで通知する(「一部のデータを初期値に戻しました」)。
   */
  async loadAll(): Promise<{
    state: Record<string, unknown>;
    report: RestoreReport;
  }> {
    const errors = new ErrorCollector();
    const state = defaultState();

    for (const f of PERSIST_SCHEMA) {
      const pid = f.scope === "shared" ? SHARED : this.profileId;
      const rows = await this.db.select<{ value: string }[]>(
        "SELECT value FROM kv WHERE profile_id = $1 AND key = $2",
        [pid, f.key]
      );
      if (rows.length === 0) {
        errors.defaulted(f.key, "初回またはデータなし");
        continue;
      }
      errors.trySync({ scope: "restore", key: f.key, fatal: false }, () => {
        state[f.key] = deepMerge(state[f.key], JSON.parse(rows[0].value));
      }); // 失敗してもdefaultのまま続行。errorsに集計される
    }
    return { state, report: errors.report() };
  }

  /** スナップショット/エクスポートも同じschemaをループ(別列挙を作らない) */
  async exportJson(): Promise<Record<string, unknown>> {
    const { state } = await this.loadAll();
    return Object.fromEntries(
      PERSIST_SCHEMA.filter((f) => f.exportable !== false).map((f) => [
        f.key,
        state[f.key],
      ])
    );
  }

  /**
   * 【R1】エクスポートを作ったら同じ形式のインポートも同時に(往復保証)。
   * loadAllと同じ deep-merge 経路を通してから保存する。
   * 破損キーはdefaultに落ち、reportに集計される。
   */
  async importJson(data: Record<string, unknown>): Promise<RestoreReport> {
    const errors = new ErrorCollector();
    const state = defaultState();

    for (const f of PERSIST_SCHEMA) {
      if (!(f.key in data)) {
        errors.defaulted(f.key, "インポートに含まれず");
        continue;
      }
      errors.trySync({ scope: "restore", key: f.key, fatal: false }, () => {
        state[f.key] = deepMerge(state[f.key], data[f.key]);
      });
    }
    await this.saveAll(state);
    return errors.report();
  }
}
