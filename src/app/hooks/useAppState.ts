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
  /** DB初期化・復元に失敗したときのメッセージ。null=正常。UIで必ず見せる契約 */
  error: string | null;
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
    error: null,
  });

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
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
          setState({ engine, clock, persist, history, report, ready: true, error: null });
        }
      } catch (e) {
        // DBオープン/マイグレーション/復元の失敗。ここで握らないと ready が永久に
        // 立たず「読み込み中…」のまま無限停止する。UIにエラーを見せて再起動を促す。
        if (!cancelled) {
          setState((prev) => ({
            ...prev,
            ready: false,
            error: e instanceof Error ? e.message : String(e),
          }));
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return state;
}
