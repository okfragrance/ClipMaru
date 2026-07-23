// app/components/RestoreNotice.tsx
// 復元レポートの通知(契約: defaulted / errors が空でなければ必ず見せる)。
// PomoQuestの「1キー破損で起動不能」もNAGIの「サイレント停止」も、
// 「継続はするが黙らない」というこの通知で潰す。

import type { RestoreReport } from "../../core/errors";

export function RestoreNotice({ report }: { report: RestoreReport | null }) {
  if (!report) return null;
  const hasIssue = report.errors.length > 0 || report.defaulted.length > 0;
  if (!hasIssue) return null;

  return (
    <div
      role="alert"
      style={{
        background: "#fff3cd",
        border: "1px solid #ffc107",
        borderRadius: 8,
        padding: "8px 12px",
        marginBottom: 16,
      }}
    >
      {report.errors.length > 0 && (
        <p>一部のデータを読み込めなかったため、初期値に戻しました。</p>
      )}
      <ul style={{ margin: 0, color: "#666", fontSize: 12 }}>
        {report.defaulted.map((k) => (
          <li key={k}>{k}</li>
        ))}
        {report.errors.map((e, i) => (
          <li key={i}>
            [{e.scope}] {e.key}: {e.message}
          </li>
        ))}
      </ul>
    </div>
  );
}
