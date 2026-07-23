// app/App.tsx
// UIは「状態の表示と入力」だけ。ロジックはcoreへ委譲(R5)。
// 復元レポート(defaulted / errors)が空でなければ必ずユーザーに見せる。
// 見た目のトークンは BRAND_TOKENS.md / app/theme.css を参照(改変する場合は
// theme.css側のCSS変数を直す。コンポーネント側に色や角丸を直書きしない)。

import { useAppState } from "./hooks/useAppState";
import { useLifecycle } from "./hooks/useLifecycle";
import { RestoreNotice } from "./components/RestoreNotice";
import { CurrencyChip } from "./components/CurrencyChip";

function App() {
  const { engine, clock, persist, report, ready } = useAppState();
  useLifecycle(engine, clock, persist); // R4の配線はここ1箇所だけ

  return (
    <main style={{ padding: 24, minHeight: "100vh" }}>
      <header
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        <h1>AnnyStation Template</h1>
        {/* B2③: 通貨チップ(所持数・スコア表示のデフォルト構造) */}
        <CurrencyChip
          icon="🪙"
          value={engine?.view.progress.totalXp ?? 0}
          accent="lemon"
        />
      </header>

      {!ready || !engine ? (
        <p>Loading…</p>
      ) : (
        <>
          <RestoreNotice report={report} />
          <div
            className="k3070-card k3070-outline-shadow"
            style={{ padding: 16, marginTop: 16 }}
          >
            <p>today tasks done: {engine.view.dailyState.tasksDone.length}</p>
          </div>
          <p style={{ color: "#888", marginTop: 16 }}>
            このテンプレートの使い方は README.md を参照。
            状態を追加するときは src/core/schema.ts に1行足すだけ。
            見た目のトークンは BRAND_TOKENS.md / src/app/theme.css を参照。
          </p>
        </>
      )}
    </main>
  );
}

export default App;
