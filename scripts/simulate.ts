// scripts/simulate.ts
// 【House Rule R5→R6】エンジンが純関数なのでNodeでそのまま回せる。
// 1日 2/4/8 回プレイ × 365日 を回してCSVを吐き、
// 複利暴走(PatisserieClicker)を実装前に検出する。
//
// 実行: npm run simulate   (tsx scripts/simulate.ts)
// アプリのengineを作り込んだら、ここの報酬パラメータを実物に合わせること。

import { Engine } from "../src/core/engine.js";
import { todayKey } from "../src/core/date.js";

/** reward_grantsテーブルのインメモリ版(R6のべき等性をシミュレーションでも守る) */
const granted = new Set<string>();
function grantOnce(key: string): boolean {
  if (granted.has(key)) return false;
  granted.add(key);
  return true;
}

const XP_PER_TASK = 10;

for (const playsPerDay of [2, 4, 8]) {
  granted.clear();
  const engine = Engine.fresh();
  const lines: string[] = ["day,dateKey,totalXp"];
  const start = new Date(2026, 0, 1);

  for (let day = 0; day < 365; day++) {
    const now = new Date(
      start.getFullYear(),
      start.getMonth(),
      start.getDate() + day,
      12,
      0,
      0
    );
    engine.checkDailyRollover(now);

    for (let p = 0; p < playsPerDay; p++) {
      const taskId = `daily-${p}`;
      const grantKey = `task:${taskId}:${todayKey(now)}`;
      // 【R6】付与はgrantOnceがtrueのときだけ。連打しても増えない。
      if (engine.markTaskDone(taskId) && grantOnce(grantKey)) {
        engine.applyReward({ xp: XP_PER_TASK });
      }
    }
    lines.push(`${day},${todayKey(now)},${engine.view.progress.totalXp}`);
  }

  process.stdout.write(`# playsPerDay=${playsPerDay}\n`);
  process.stdout.write(lines.join("\n") + "\n\n");
}
