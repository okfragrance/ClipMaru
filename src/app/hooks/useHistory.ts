// app/hooks/useHistory.ts
// 履歴タブの状態。HistoryStore(relational)から一覧を読み、行トグルを反映する。
// クリップボード自動監視(#4)が入るまでは基本的に空。監視導入後は refresh を
// 監視イベントから呼んで最新化する。

import { useCallback, useEffect, useState } from "react";
import type { HistoryStore } from "../../storage/historyStore";
import type { HistoryItem } from "../../core/types";

export interface HistoryView {
  items: HistoryItem[];
  refresh: () => Promise<void>;
  setForcePlain: (id: string, forcePlain: boolean) => Promise<void>;
  remove: (id: string) => Promise<void>;
}

export function useHistory(store: HistoryStore | null): HistoryView {
  const [items, setItems] = useState<HistoryItem[]>([]);

  const refresh = useCallback(async () => {
    if (!store) return;
    setItems(await store.list());
  }, [store]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const setForcePlain = useCallback(
    async (id: string, forcePlain: boolean) => {
      if (!store) return;
      await store.setForcePlain(id, forcePlain);
      await refresh();
    },
    [store, refresh]
  );

  const remove = useCallback(
    async (id: string) => {
      if (!store) return;
      await store.remove(id);
      await refresh();
    },
    [store, refresh]
  );

  return { items, refresh, setForcePlain, remove };
}
