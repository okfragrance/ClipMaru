// core/session.ts
// 【House Rule R4】lastSeenMs を書き込む権限はこのクラスだけが持つ。
// ・セーブのたびに現在時刻を刻むのは禁止(PatisserieClickerの放置生産消失)
// ・pause時は「タイマーを止めてから」markSeen()(PomoQuestの二重計上防止)
// ・復帰時の早送りは fastForward() の1経路のみ

import { enumerateDayKeys } from "./date.js";

export interface FastForwardResult {
  /** 前回lastSeenからの経過ミリ秒(初回起動・時計巻き戻しでは0) */
  elapsedMs: number;
  /** またいだ日付キー(古い順)。日次リセットを日数分正しく回すため */
  rolledOverDays: string[];
  /** 初回起動(lastSeen未記録)だったか */
  firstRun: boolean;
}

export interface SessionState {
  lastSeenMs: number; // 0 = 未記録(初回)
}

export class SessionClock {
  constructor(private state: SessionState) {}

  /**
   * pause / blur / kill前 に呼ぶ。
   * 呼び出し順の契約: engine.pauseTimers() → markSeen() → save()。
   */
  markSeen(nowMs: number = Date.now()): void {
    this.state.lastSeenMs = nowMs;
  }

  /**
   * resume / 起動時に呼ぶ。戻り値を engine.applyElapsed() に渡す。
   * ・初回起動(lastSeenMs===0): 経過0・rollover無し
   * ・時計の巻き戻り(now < lastSeen): 経過0・rollover無し(負の時間を配らない)
   */
  fastForward(nowMs: number = Date.now()): FastForwardResult {
    const last = this.state.lastSeenMs;
    if (last === 0) {
      this.state.lastSeenMs = nowMs;
      return { elapsedMs: 0, rolledOverDays: [], firstRun: true };
    }
    const elapsedMs = Math.max(0, nowMs - last);
    const rolledOverDays = elapsedMs > 0 ? enumerateDayKeys(last, nowMs) : [];
    this.state.lastSeenMs = nowMs;
    return { elapsedMs, rolledOverDays, firstRun: false };
  }
}
