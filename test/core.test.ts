// House Rulesの「実際に起きたバグ」をそのままテストケースにする。
// 各テスト名の【】は HOUSE_RULES.md のパターン/ルール番号。

import { describe, it, expect } from "vitest";
import { todayKey, needsRollover, enumerateDayKeys } from "../src/core/date.js";
import { deepMerge, persistReplacer } from "../src/core/merge.js";
import { ErrorCollector } from "../src/core/errors.js";
import { SessionClock } from "../src/core/session.js";
import { defaultState, validateSchema, field, PERSIST_SCHEMA } from "../src/core/schema.js";

// ───────────────────────── date (R3)
describe("date.ts", () => {
  it("【R3】todayKeyはローカルタイムのYYYY-MM-DD(ゼロ埋め)", () => {
    expect(todayKey(new Date(2026, 0, 5))).toBe("2026-01-05");
    expect(todayKey(new Date(2026, 11, 31))).toBe("2026-12-31");
  });

  it("【パターン2/Macaron】JST朝9時前でもUTCにズレない(toISOStringとの差を確認)", () => {
    // JST 2026-07-12 08:00 はUTCでは前日。todayKeyはローカルの12日を返すこと。
    const jstMorning = new Date(2026, 6, 12, 8, 0, 0);
    expect(todayKey(jstMorning)).toBe("2026-07-12");
    // 環境がUTC+9ならtoISOStringは前日を返す=禁止理由の実証(TZ依存なので参考出力のみ)
  });

  it("【R3-3】needsRollover: 同日はfalse・日付が変わればtrue", () => {
    const d = new Date(2026, 6, 12, 23, 59);
    expect(needsRollover("2026-07-12", d)).toBe(false);
    expect(needsRollover("2026-07-11", d)).toBe(true);
    expect(needsRollover("", d)).toBe(true); // 初回
  });

  it("【パターン3】enumerateDayKeys: 同日内は空、0時またぎは1件", () => {
    const t2350 = new Date(2026, 6, 11, 23, 50).getTime();
    const t2359 = new Date(2026, 6, 11, 23, 59).getTime();
    const t0010 = new Date(2026, 6, 12, 0, 10).getTime();
    expect(enumerateDayKeys(t2350, t2359)).toEqual([]);
    expect(enumerateDayKeys(t2350, t0010)).toEqual(["2026-07-12"]);
  });

  it("【パターン3/kill→数日後再起動】複数日放置で全日を古い順に列挙(月またぎ含む)", () => {
    const start = new Date(2026, 6, 30, 12, 0).getTime(); // 7/30
    const end = new Date(2026, 7, 2, 9, 0).getTime();     // 8/2
    expect(enumerateDayKeys(start, end)).toEqual([
      "2026-07-31",
      "2026-08-01",
      "2026-08-02",
    ]);
  });

  it("enumerateDayKeys: 逆転(時計巻き戻し)は空", () => {
    const a = new Date(2026, 6, 12).getTime();
    const b = new Date(2026, 6, 10).getTime();
    expect(enumerateDayKeys(a, b)).toEqual([]);
  });
});

// ───────────────────────── merge (R2)
describe("merge.ts", () => {
  const defaults = () => ({
    theme: "macaron",
    soundOn: true,
    nested: { volume: 5, newInV2: "added" },
    list: [1, 2, 3],
  });

  it("【R2】保存値が既知キーを上書きし、形はdefaultsが決める", () => {
    const saved = { theme: "sakura", nested: { volume: 9 } };
    const out = deepMerge(defaults(), saved);
    expect(out.theme).toBe("sakura");
    expect(out.nested.volume).toBe(9);
    expect(out.soundOn).toBe(true); // 保存に無いキーはdefault維持
  });

  it("【パターン1/復元漏れゼロ】アップデートで増えたフィールドはdefaultで自動補完", () => {
    // v1のセーブにはnested.newInV2が存在しない → v2のdefaultが補完される
    const v1Save = { theme: "sakura", nested: { volume: 9 } };
    const out = deepMerge(defaults(), v1Save);
    expect(out.nested.newInV2).toBe("added");
  });

  it("【NAGI/_rawTextCache】_プレフィックスは混入していても復元しない", () => {
    const saved = { theme: "sakura", _rawTextCache: "巨大キャッシュ" };
    const out = deepMerge(defaults(), saved) as Record<string, unknown>;
    expect("_rawTextCache" in out).toBe(false);
  });

  it("スキーマ外の未知キーは捨てる(ゴミを持ち越さない)", () => {
    const saved = { theme: "sakura", legacyKey: 123 };
    const out = deepMerge(defaults(), saved) as Record<string, unknown>;
    expect("legacyKey" in out).toBe(false);
  });

  it("【破損耐性】型が壊れた値はそのフィールドだけdefaultに落ちる", () => {
    const saved = { soundOn: "true(文字列に化けた)", theme: 42, nested: "壊れた" };
    const out = deepMerge(defaults(), saved);
    expect(out.soundOn).toBe(true);
    expect(out.theme).toBe("macaron");
    expect(out.nested).toEqual({ volume: 5, newInV2: "added" });
  });

  it("配列は要素マージせず置換", () => {
    const out = deepMerge(defaults(), { list: [9] });
    expect(out.list).toEqual([9]);
  });

  it("null/undefinedのsavedはdefaultsを返す", () => {
    expect(deepMerge(defaults(), null)).toEqual(defaults());
    expect(deepMerge(defaults(), undefined)).toEqual(defaults());
  });

  it("【R2】persistReplacer: 保存時に_キーを機械的に除外", () => {
    const json = JSON.stringify(
      { a: 1, _cache: "x", nested: { _tmp: 2, b: 3 } },
      persistReplacer
    );
    expect(json).toBe('{"a":1,"nested":{"b":3}}');
  });
});

// ───────────────────────── errors
describe("errors.ts", () => {
  it("【PomoQuest/1キー破損で起動不能】非fatalは続行し、集計に残る", () => {
    const c = new ErrorCollector();
    const ok = c.trySync({ scope: "restore", key: "good" }, () => 42);
    const bad = c.trySync({ scope: "restore", key: "broken" }, () => {
      throw new Error("JSON壊れた");
    });
    expect(ok).toBe(42);
    expect(bad).toBeUndefined();
    const r = c.report();
    expect(r.ok).toBe(true); // fatal無しなのでok
    expect(r.restored).toEqual(["good"]);
    expect(r.defaulted).toEqual(["broken"]);
    expect(r.errors).toHaveLength(1);
    expect(r.errors[0].message).toBe("JSON壊れた");
  });

  it("fatalはrethrowし、report.ok=false", () => {
    const c = new ErrorCollector();
    expect(() =>
      c.trySync({ scope: "restore", key: "db", fatal: true }, () => {
        throw new Error("DB開けない");
      })
    ).toThrow("DB開けない");
    expect(c.report().ok).toBe(false);
  });

  it("tryAsyncも同じ規則", async () => {
    const c = new ErrorCollector();
    const v = await c.tryAsync({ scope: "sync", key: "calendar" }, async () => {
      throw new Error("token失効");
    });
    expect(v).toBeUndefined();
    // 【NAGI/サイレント停止対策】UIはerrors>0で必ず通知する契約
    expect(c.report().errors[0].scope).toBe("sync");
  });
});

// ───────────────────────── session (R4)
describe("session.ts", () => {
  it("【R4】初回起動: 経過0・rollover無し・firstRun=true", () => {
    const clock = new SessionClock({ lastSeenMs: 0 });
    const ff = clock.fastForward(1_000_000);
    expect(ff).toEqual({ elapsedMs: 0, rolledOverDays: [], firstRun: true });
  });

  it("【PatisserieClicker/放置生産消失】markSeen→fastForwardで経過が正しく出る", () => {
    const state = { lastSeenMs: 0 };
    const clock = new SessionClock(state);
    clock.markSeen(1000);
    const ff = clock.fastForward(61_000);
    expect(ff.elapsedMs).toBe(60_000);
    expect(state.lastSeenMs).toBe(61_000); // 消費した経過は再配布されない
  });

  it("【PomoQuest/二重計上】連続fastForwardで同じ経過が二度出ない", () => {
    const clock = new SessionClock({ lastSeenMs: 1000 });
    expect(clock.fastForward(61_000).elapsedMs).toBe(60_000);
    expect(clock.fastForward(61_000).elapsedMs).toBe(0); // 2回目は0
  });

  it("【0時またぎ】pause前日→resume翌日でrolledOverDaysが返る", () => {
    const t2350 = new Date(2026, 6, 11, 23, 50).getTime();
    const t0010 = new Date(2026, 6, 12, 0, 10).getTime();
    const clock = new SessionClock({ lastSeenMs: t2350 });
    const ff = clock.fastForward(t0010);
    expect(ff.rolledOverDays).toEqual(["2026-07-12"]);
  });

  it("時計の巻き戻り: 負の経過を配らない", () => {
    const clock = new SessionClock({ lastSeenMs: 100_000 });
    const ff = clock.fastForward(50_000);
    expect(ff.elapsedMs).toBe(0);
    expect(ff.rolledOverDays).toEqual([]);
  });
});

// ───────────────────────── schema (R2/R9)
describe("schema.ts", () => {
  it("defaultStateは毎回新インスタンス(共有参照事故なし)", () => {
    const a = defaultState();
    const b = defaultState();
    (a.progress as { totalXp: number }).totalXp = 999;
    expect((b.progress as { totalXp: number }).totalXp).toBe(0);
  });

  it("【R9】全フィールドにscopeが宣言されている", () => {
    for (const f of PERSIST_SCHEMA) {
      expect(["profile", "shared"]).toContain(f.scope);
    }
  });

  it("validateSchema: キー重複と_プレフィックスを検出", () => {
    const bad = [
      field("dup", "shared", () => 1),
      field("dup", "profile", () => 2),
      field("_cache", "shared", () => 3),
    ];
    const problems = validateSchema(bad);
    expect(problems.some((p) => p.includes("キー重複"))).toBe(true);
    expect(problems.some((p) => p.includes("_プレフィックス"))).toBe(true);
    expect(validateSchema(PERSIST_SCHEMA)).toEqual([]);
  });
});
