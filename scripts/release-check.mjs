// scripts/release-check.mjs
// 【House Rule R8】リリース前grep。デバッグ残留を機械的に検出する。
// 実行: npm run release-check(検出ありなら exit 1)
//
// ・src/debug/ は「サンクション済みの隔離区域」(DEVガードで消える)なので除外
// ・debug/ へのimport行(正規の配線)も除外
// ・それ以外の本番コードパスにヒットしたら出荷前に人間がレビューする

import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const PATTERNS = [
  /MOCK_/,
  /DEBUG_/,
  /cheat/i,
  /テスト用/,
  /TODO/,
  /console\.log/,
];
const SCAN_DIRS = ["src", join("src-tauri", "src")];
const EXCLUDE_DIRS = [join("src", "debug")];
const EXTS = [".ts", ".tsx", ".rs"];
// debug/配下への import は正規の配線(R8の隔離区域を指すだけ)なので許可
const SANCTIONED_IMPORT = /(from\s+["']|import\(["'])[^"']*debug\//;

let hits = 0;

function scan(dir) {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    const rel = relative(ROOT, full);
    if (EXCLUDE_DIRS.some((e) => rel === e || rel.startsWith(e + sep))) continue;
    if (statSync(full).isDirectory()) {
      scan(full);
      continue;
    }
    if (!EXTS.some((e) => name.endsWith(e))) continue;
    const lines = readFileSync(full, "utf8").split("\n");
    lines.forEach((line, i) => {
      if (SANCTIONED_IMPORT.test(line)) return;
      for (const p of PATTERNS) {
        if (p.test(line)) {
          console.error(`${rel}:${i + 1}: [${p.source}] ${line.trim()}`);
          hits++;
          break;
        }
      }
    });
  }
}

for (const d of SCAN_DIRS) {
  scan(join(ROOT, d));
}

if (hits > 0) {
  console.error(
    `\nrelease-check: ${hits}件のデバッグ残留候補。出荷前に除去すること。`
  );
  process.exit(1);
}
console.log("release-check: クリーン");
