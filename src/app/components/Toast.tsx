// app/components/Toast.tsx
// プロトタイプの showToast 相当。画面下中央に短時間表示するトースト。
// プロップスドリリングを避けるため context で showToast を配布する。

import {
  createContext,
  useCallback,
  useContext,
  useRef,
  useState,
  type ReactNode,
} from "react";

type ShowToast = (message: string) => void;

const ToastContext = createContext<ShowToast>(() => {});

export function useToast(): ShowToast {
  return useContext(ToastContext);
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [message, setMessage] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const show = useCallback<ShowToast>((msg) => {
    setMessage(msg);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setMessage(null), 1300);
  }, []);

  return (
    <ToastContext.Provider value={show}>
      {children}
      <div
        style={{
          position: "fixed",
          bottom: 20,
          left: "50%",
          transform: `translateX(-50%) translateY(${message ? 0 : 20}px)`,
          background: "var(--ink)",
          color: "var(--panel)",
          padding: "9px 18px",
          borderRadius: 20,
          fontSize: 12,
          fontWeight: 700,
          opacity: message ? 1 : 0,
          transition: "all .2s ease",
          pointerEvents: "none",
          maxWidth: "80vw",
          textAlign: "center",
          zIndex: 200,
        }}
      >
        {message}
      </div>
    </ToastContext.Provider>
  );
}
