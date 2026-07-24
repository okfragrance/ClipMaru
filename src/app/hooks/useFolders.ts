// app/hooks/useFolders.ts
// engine(folders フィールド)と React の橋渡し。usePhrasebook と同じ経路
// (engine を変更 → スナップショット再描画 → Persistence.saveAll)を踏む。

import { useCallback, useEffect, useState } from "react";
import type { Engine } from "../../core/engine";
import type { Persistence } from "../../storage/persistence";
import type { FolderEntry } from "../../core/types";

export interface FoldersActions {
  add: (label: string, path: string) => void;
  update: (id: string, patch: { label?: string; path?: string }) => void;
  remove: (id: string) => void;
  reorder: (fromIndex: number, toIndex: number) => void;
}

export interface FoldersView {
  folders: FolderEntry[];
  actions: FoldersActions;
}

export function useFolders(
  engine: Engine | null,
  persist: Persistence | null
): FoldersView {
  const [folders, setFolders] = useState<FolderEntry[]>([]);

  useEffect(() => {
    if (!engine) return;
    setFolders(structuredClone(engine.view.folders));
  }, [engine]);

  const sync = useCallback(() => {
    if (!engine || !persist) return;
    setFolders(structuredClone(engine.view.folders));
    void persist.saveAll(engine.toSave());
  }, [engine, persist]);

  const add = useCallback(
    (label: string, path: string) => {
      if (!engine) return;
      engine.addFolder(label, path);
      sync();
    },
    [engine, sync]
  );

  const update = useCallback(
    (id: string, patch: { label?: string; path?: string }) => {
      if (!engine) return;
      engine.updateFolder(id, patch);
      sync();
    },
    [engine, sync]
  );

  const remove = useCallback(
    (id: string) => {
      if (!engine) return;
      engine.deleteFolder(id);
      sync();
    },
    [engine, sync]
  );

  const reorder = useCallback(
    (fromIndex: number, toIndex: number) => {
      if (!engine) return;
      engine.reorderFolder(fromIndex, toIndex);
      sync();
    },
    [engine, sync]
  );

  return { folders, actions: { add, update, remove, reorder } };
}
