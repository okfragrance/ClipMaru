import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// @ts-expect-error process is a nodejs global
const host = process.env.TAURI_DEV_HOST;

// ビルド日時("YYYY-MM-DD HH:mm" ローカル)を __BUILD_TIME__ として埋め込む。
// バージョン番号だけでは「同じ 0.1.0 の古い exe」と見分けが付かない
// (2026-08-16に、7/29ビルドを動かし続けたまま「修正が効かない」と調べる事故が発生)。
// 設定パネルに出して、どのビルドを動かしているか一目で分かるようにする。
// ※R3(日付キーは todayKey() のみ)はアプリの日付ロジックの話。ここはビルド時に
//   一度だけ焼き込むスタンプなので対象外。toISOString は使わずローカル時刻で組む。
const pad = (n: number) => String(n).padStart(2, "0");
const t = new Date();
const buildTime =
  `${t.getFullYear()}-${pad(t.getMonth() + 1)}-${pad(t.getDate())}` +
  ` ${pad(t.getHours())}:${pad(t.getMinutes())}`;

// https://vite.dev/config/
export default defineConfig(async () => ({
  plugins: [react()],

  define: {
    __BUILD_TIME__: JSON.stringify(buildTime),
  },

  // Vite options tailored for Tauri development and only applied in `tauri dev` or `tauri build`
  //
  // 1. prevent Vite from obscuring rust errors
  clearScreen: false,
  // 2. tauri expects a fixed port, fail if that port is not available
  //
  // 【重要】ポートはプロジェクトごとにずらすこと(既定の1420のままにしない)。
  // テンプレート由来の他アプリ(Macaron Board / PatisserieClicker)も既定1420のため、
  // それらのdevサーバが起動していると 1420 を先に奪われ、strictPortでClipMaru側の
  // vite が起動できないまま Tauri は devUrl(=1420)を読みに行き、
  // 「別アプリの画面がClipMaruのウィンドウに出る」→そのアプリが呼ぶプラグインが
  // ClipMaruのRust側に無く "Plugin not found" で落ちる、という分かりにくい事故になる
  // (2026-08-05に実際に発生。store.load not allowed の原因がこれだった)。
  // 変更するときは src-tauri/tauri.conf.json の devUrl と必ず揃える。
  server: {
    port: 1424, // T004-ClipMaru なので 1424(他プロジェクトの1420/1421と衝突させない)
    strictPort: true,
    host: host || false,
    hmr: host
      ? {
          protocol: "ws",
          host,
          port: 1425,
        }
      : undefined,
    watch: {
      // 3. tell Vite to ignore watching `src-tauri`
      ignored: ["**/src-tauri/**"],
    },
  },
}));
