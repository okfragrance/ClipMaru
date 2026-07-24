// app/hooks/useAppState.ts
// engineとUIの橋渡し。起動シーケンス:
//   openDb → Persistence.loadAll(deep-merge) → Engine.fromSave → SessionClock
// report.errors / defaulted が空でなければ必ずUIに見せる(契約)。

import { useEffect, useState } from "react";
import { Engine } from "../../core/engine";
import { SessionClock } from "../../core/session";
import type { RestoreReport } from "../../core/errors";
import { openDb } from "../../storage/db";
import { Persistence } from "../../storage/persistence";
import { HistoryStore } from "../../storage/historyStore";
import { installDevtools } from "../../debug/cheats";

export interface AppState {
  engine: Engine | null;
  clock: SessionClock | null;
  persist: Persistence | null;
  history: HistoryStore | null;
  report: RestoreReport | null;
  ready: boolean;
}

const DEFAULT_PROFILE = "default";

export function useAppState(): AppState {
  const [state, setState] = useState<AppState>({
    engine: null,
    clock: null,
    persist: null,
    history: null,
    report: null,
    ready: false,
  });

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const db = await openDb();
      const persist = new Persistence(db, DEFAULT_PROFILE);
      const history = new HistoryStore(db);
      const { state: saved, report } = await persist.loadAll();
      const engine = Engine.fromSave(saved);
      engine.ensureSeeded(); // 初回起動時にカテゴリを1つ用意(最後の1つは削除不可の前提)
      await persist.saveAll(engine.toSave()); // 初回シードを永続化
      const clock = new SessionClock(
        engine.view.session // lastSeenMsの書き込み権限はSessionClockだけ(R4)
      );
      installDevtools(engine); // 本番ビルドでは中身が空になる(R8)
      if (!cancelled) {
        setState({ engine, clock, persist, history, report, ready: true });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return state;
}
