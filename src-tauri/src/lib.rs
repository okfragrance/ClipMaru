mod clipboard_watcher;
mod commands;
mod tray;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_sql::Builder::default().build())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        // ウィンドウ位置/サイズの記憶(仕様§3)。終了時に保存し次回起動時に自動復元する。
        .plugin(tauri_plugin_window_state::Builder::default().build())
        // Windowsスタートアップ登録。トグルのenable/disableはフロントから呼ぶ。
        // Windowsではレジストリ(Run key)を使う。第2引数は起動時に渡す追加引数(なし)。
        .plugin(tauri_plugin_autostart::init(
            tauri_plugin_autostart::MacosLauncher::LaunchAgent,
            None,
        ))
        .invoke_handler(tauri::generate_handler![
            commands::safe_write::safe_write_json,
            commands::clipboard_write::write_clipboard_image
        ])
        .setup(|app| {
            clipboard_watcher::start_watching(app.handle().clone());
            tray::setup_tray(app.handle())?; // システムトレイ常駐(仕様§3・技術検討6)
            Ok(())
        })
        // ✕は終了せずトレイへ格納(常駐アプリ)。完全終了はトレイメニューの「終了」から。
        .on_window_event(tray::on_window_event)
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
