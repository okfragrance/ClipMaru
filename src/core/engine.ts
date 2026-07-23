// core/engine.ts
// 【House Rule R5】アプリ本体ロジックの置き場所(純関数の世界)。
// React / Tauri API / タイマー / ストレージを一切importしない。
// テンプレートではサンプルの空engineを置く。アプリごとにここを書き換える。
//
// 契約:
// ・toSave() はschemaのキーに一致した形の状態を返す(保存はstorage側の仕事)
// ・fromSave() は deep-merge 済みの状態を受け取る(復元経路は1つ)
// ・applyElapsed() は「見ていない時間」の反映の唯一の入口(R4)
// ・checkDailyRollover() は 起動時/resume時/保存前 に呼ばれる(R3-3)
// ・報酬の付与判断はRewardLedger(storage側)が行い、engineは
//   applyReward() で「確定した付与」を状態へ反映するだけ(R6)

import { todayKey, needsRollover } from "./date.js";
import type { FastForwardResult } from "./session.js";
import type { RewardPayload } from "./economy/rewardLedger.js";
import { defaultState } from "./schema.js";
import { deepMerge } from "./merge.js";

export interface EngineState {
  settings: { theme: string; soundOn: boolean };
  progress: { totalXp: number; unlockedIds: string[] };
  dailyState: { lastRolloverKey: string; tasksDone: string[] };
  session: { lastSeenMs: number };
}

export class Engine {
  private constructor(private state: EngineState) {}

  /** 新規開始(schemaのdefaultから) */
  static fresh(): Engine {
    return new Engine(defaultState() as unknown as EngineState);
  }

  /**
   * 復元(deep-merge済みの状態を受ける)。
   * Persistence.loadAll() の結果をそのまま渡すのが唯一の復元経路。
   */
  static fromSave(saved: Record<string, unknown>): Engine {
    const merged = deepMerge(
      defaultState() as unknown as EngineState,
      saved
    );
    return new Engine(merged);
  }

  /** 保存用の状態(schemaのキーと同じ形)。保存自体はstorageの仕事 */
  toSave(): Record<string, unknown> {
    return { ...this.state };
  }

  /** UI表示用の読み取り専用ビュー */
  get view(): Readonly<EngineState> {
    return this.state;
  }

  /**
   * 【R4】「見ていない時間」の反映。SessionClock.fastForward() の戻り値を
   * そのまま受ける。elapsedMs分の放置進行と、またいだ日数分の日次処理を行う。
   */
  applyElapsed(ff: FastForwardResult): void {
    if (ff.firstRun) return;
    // ここに放置生産などの経過処理を書く(サンプルでは何もしない)
    // またいだ日はrolledOverDaysの日数分、正しく日次処理を回す
    for (const dayKey of ff.rolledOverDays) {
      this.rollover(dayKey);
    }
  }

  /**
   * 【R3-3】日次ロールオーバー判定。起動時・resume時・保存前に呼ぶ。
   * lastRolloverKeyの更新は「処理を実行した瞬間だけ」。
   */
  checkDailyRollover(now: Date = new Date()): boolean {
    if (!needsRollover(this.state.dailyState.lastRolloverKey, now)) {
      return false;
    }
    this.rollover(todayKey(now));
    return true;
  }

  /** 日次リセットの実体。lastRolloverKeyはここでのみ更新する */
  private rollover(dayKey: string): void {
    this.state.dailyState.tasksDone = [];
    this.state.dailyState.lastRolloverKey = dayKey;
  }

  /**
   * 【R6】確定済みの報酬を状態へ反映する。
   * 呼び出せるのは RewardLedger.grantOnce() が true を返した直後だけ。
   * ここ以外で totalXp を増やすコードを書いた時点でルール違反。
   */
  applyReward(payload: RewardPayload): void {
    if (payload.xp) this.state.progress.totalXp += payload.xp;
  }

  /** 【R6】巻き戻し(revoke時)。applyRewardと対称 */
  revertReward(payload: RewardPayload): void {
    if (payload.xp) {
      this.state.progress.totalXp = Math.max(
        0,
        this.state.progress.totalXp - payload.xp
      );
    }
  }

  /** タスク完了の記録(報酬はledger経由で別途)。同日重複はfalse */
  markTaskDone(taskId: string): boolean {
    if (this.state.dailyState.tasksDone.includes(taskId)) return false;
    this.state.dailyState.tasksDone.push(taskId);
    return true;
  }

  /**
   * 【R5→R6】UIタイマーとは独立に呼べる純関数なので、
   * scripts/simulate.ts がそのままNodeで経済シミュレーションに使える。
   */
  pauseTimers(): void {
    // サンプルでは内部タイマーを持たない。実アプリでは進行中の
    // カウントダウン等を「ここで止めてから」markSeen()する契約(R4)。
  }
}
