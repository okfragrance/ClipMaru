// scripts/simulate.ts
// 【House Rule R6】このスクリプトは「経済の複利暴走を実装前に検出する」ためのもの。
// ClipMaru は報酬・通貨・進行度を持たない(クリップボード管理アプリ)。
// したがって回すべき経済シミュレーションが存在しない。
//
// 将来 ClipMaru に定量的に検証したい挙動(例: 履歴の増加ペースと 500 件上限での
// 削除挙動など)を入れる場合は、engine を純関数のまま Node で叩いてここに追加する。
//
// 実行: npm run simulate

process.stdout.write(
  "simulate: ClipMaru は経済要素を持たないため、シミュレーション対象はありません。\n"
);
