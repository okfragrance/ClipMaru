// app/hooks/useLifecycle.ts
// 【House Rule R4】ライフサイクル配線はこの1箇所だけ。
// 他の場所で visibilitychange / focus を購読して lastSeen や早送りに
// 触った時点でルール違反(二重計上・計上漏れの温床)。
//
// 順序の契約(pause側): engine.pauseTimers() → clock.markSeen() → save
// 順序の契約(resume側): clock.fastForward() → engine.applyElapsed() → rollover判定

import { useEffect } from "react";
import type { Engine } from "../../core/engine";
import type { SessionClock } from "../../core/session";
import type { Persistence } from "../../storage/persistence";

export function useLifecycle(
  engine: Engine | null,
  clock: SessionClock | null,
  persist: Persistence | null
): void {
  useEffect(() => {
    if (!engine || !clock || !persist) return;

    const onHide = () => {
      engine.pauseTimers(); // ① まずタイマーを止める(順序が重要)
      clock.markSeen(); // ② それからlastSeenを刻む(二重計上防止)
      void persist.saveAll(engine.toSave()); // ③ 最後に保存
    };

    const onShow = () => {
      const ff = clock.fastForward(); // 早送りは1経路(R4-2)
      engine.applyElapsed(ff);
      engine.checkDailyRollover(); // 起動時以外でもリセット判定(R3-3)
      void persist.saveAll(engine.toSave());
    };

    const onVisibility = () => {
      if (document.hidden) onHide();
      else onShow();
    };

    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("blur", onHide);
    window.addEventListener("focus", onShow);

    // 起動直後にも一度「復帰」扱いで早送り+rollover判定(R3-3)
    onShow();

    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("blur", onHide);
      window.removeEventListener("focus", onShow);
    };
  }, [engine, clock, persist]);
}
