// debug/cheats.ts
// 【House Rule R8】デバッグ機能はこのディレクトリに隔離し、
// import.meta.env.DEV ガード必須。本番ビルドではツリーシェイクで消える。
// UIからの導線(デバッグボタン等)もDEV限定で描画すること。
//
// ClipMaru は経済要素を持たないため付与チートは無い。状態ダンプのみ。

import type { Engine } from "../core/engine";

export function installDevtools(engine: Engine): void {
  if (!import.meta.env.DEV) return;

  (window as unknown as Record<string, unknown>).DEBUG_dumpState = () =>
    engine.toSave();
}
