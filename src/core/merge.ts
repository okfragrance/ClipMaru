// core/merge.ts
// 復元の原則: defaults が「形」の真実。saved は「値の上書き」しかできない。
// ・アップデートで増えたフィールド → defaultが自動補完(復元漏れゼロ)
// ・型が壊れた値 → そのフィールドだけdefaultに落ちる(起動は続行)
// ・_プレフィックス → 混入していても復元しない(NAGIの_rawTextCache対策)
// ・スキーマ外の未知キー → 捨てる(ゴミを持ち越さない)

export function deepMerge<T>(defaults: T, saved: unknown): T {
  if (saved === null || saved === undefined) return defaults;

  // 配列は「置換」。要素単位のマージは事故のもと。
  if (Array.isArray(defaults)) {
    return (Array.isArray(saved) ? saved : defaults) as T;
  }

  if (isPlainObject(defaults)) {
    if (!isPlainObject(saved)) return defaults; // 形が違うなら丸ごとdefault
    const out: Record<string, unknown> = { ...(defaults as Record<string, unknown>) };
    for (const [k, v] of Object.entries(saved)) {
      if (k.startsWith("_")) continue;                    // キャッシュは復元しない
      if (!(k in (defaults as Record<string, unknown>))) continue; // 未知キーは捨てる
      out[k] = deepMerge((defaults as Record<string, unknown>)[k], v);
    }
    return out as T;
  }

  // プリミティブ: 型が一致すればsaved、不一致ならdefault(破損データ耐性)
  if (defaults === null || defaults === undefined) return saved as T;
  return typeof saved === typeof defaults ? (saved as T) : defaults;
}

/** 保存時に _プレフィックスキーを機械的に除外するJSON.stringify用replacer */
export function persistReplacer(key: string, value: unknown): unknown {
  return key.startsWith("_") ? undefined : value;
}

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}
