import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// @ts-expect-error process is a nodejs global
const host = process.env.TAURI_DEV_HOST;

// https://vite.dev/config/
export default defineConfig(async () => ({
  plugins: [react()],

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
