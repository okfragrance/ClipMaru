// app/components/CurrencyChip.tsx
// 【BRAND_TOKENS B2③】通貨チップ構造: アイコン+数値を角丸ピルに内包。
// Macaron Board / POMO Quest共通の署名パターン。
// 新規プロジェクトで「所持数・スコア表示」が要る場合は、これをデフォルトにする。

export type ChipAccent =
  | "strawberry"
  | "pistachio"
  | "lemon"
  | "lavender"
  | "babypink";

const ACCENT_VAR: Record<ChipAccent, string> = {
  strawberry: "var(--k3070-accent-strawberry)",
  pistachio: "var(--k3070-accent-pistachio)",
  lemon: "var(--k3070-accent-lemon)",
  lavender: "var(--k3070-accent-lavender)",
  babypink: "var(--k3070-accent-babypink)",
};

export interface CurrencyChipProps {
  /** 絵文字などの短いアイコン表現(例: "🪙") */
  icon: string;
  value: number;
  accent?: ChipAccent;
}

export function CurrencyChip({
  icon,
  value,
  accent = "lemon",
}: CurrencyChipProps) {
  return (
    <span
      className="k3070-chip k3070-outline-shadow"
      style={{ background: ACCENT_VAR[accent] }}
    >
      <span aria-hidden="true">{icon}</span>
      <span>{value.toLocaleString()}</span>
    </span>
  );
}
