// app/components/Tooltip.tsx
// ブラウザネイティブの title属性ツールチップはOS依存の配色で、アプリのクリーム基調
// トーンに対して浮いて見える(色を制御できない)。同じ「ホバーで全文表示」の役割を、
// テーマ変数(--ink/--cream)を使った控えめな配色の自前ツールチップに置き換える。
// 既存の <span title="..."> の差し替え用途を想定し、style/onClick等をそのまま透過する。
//
// 【注意・重要】アンカー自体は overflow:hidden のまま(呼び出し側の style をそのまま
// 適用)にする必要がある。flexboxでは overflow:visible の要素は「中身の幅より縮まない」
// (min-width:autoが内容サイズに解決される)ため、overflow:visibleにすると1行テキストの
// 省略(ellipsis)が効かなくなり、行・ウィンドウごと横に伸びてしまう(実際に発生した
// 不具合: 編集アイコンが見切れる/並べ替えハンドルが掴めなくなる)。
// 一方で overflow:hidden な祖先の中に position:absolute の吹き出しを置くとクリップされて
// 見えなくなる(これも実際に発生した不具合)。この2つは同じ要素上で両立できないため、
// ツールチップ本体は React Portal で document.body 直下に描画し、アンカーの
// getBoundingClientRect() から座標を計算して position:fixed で置く。

import {
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";

export interface TooltipProps {
  text: string;
  children: ReactNode;
  style?: CSSProperties;
  onClick?: () => void;
}

const SHOW_DELAY_MS = 400;
const TOOLTIP_MAX_WIDTH = 220;

export function Tooltip({ text, children, style, onClick }: TooltipProps) {
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null);
  const anchorRef = useRef<HTMLSpanElement | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleEnter = () => {
    timer.current = setTimeout(() => {
      const rect = anchorRef.current?.getBoundingClientRect();
      if (!rect) return;
      const left = Math.min(
        rect.left,
        window.innerWidth - TOOLTIP_MAX_WIDTH - 8
      );
      setPos({ left: Math.max(4, left), top: rect.bottom + 4 });
    }, SHOW_DELAY_MS);
  };
  const handleLeave = () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    setPos(null);
  };

  return (
    <span
      ref={anchorRef}
      onMouseEnter={handleEnter}
      onMouseLeave={handleLeave}
      onClick={onClick}
      style={{
        display: "block",
        overflow: "hidden",
        textOverflow: "ellipsis",
        whiteSpace: "nowrap",
        ...style,
      }}
    >
      {children}
      {pos &&
        createPortal(
          <span
            style={{
              position: "fixed",
              left: pos.left,
              top: pos.top,
              maxWidth: TOOLTIP_MAX_WIDTH,
              background: "var(--ink)",
              color: "var(--cream)",
              opacity: 0.82,
              fontSize: 10.5,
              fontWeight: 500,
              lineHeight: 1.4,
              padding: "5px 8px",
              borderRadius: 6,
              whiteSpace: "normal",
              wordBreak: "break-all",
              boxShadow: "var(--shadow)",
              zIndex: 100,
              pointerEvents: "none",
            }}
          >
            {text}
          </span>,
          document.body
        )}
    </span>
  );
}
