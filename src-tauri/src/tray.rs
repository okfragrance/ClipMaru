// tray.rs
// システムトレイ常駐(仕様§3・技術検討6)。
// ・左クリック(トレイアイコン)= ウィンドウの表示/非表示トグル。
// ・右クリックメニュー = 「表示 / 非表示」「終了」。
// ・ウィンドウの✕(閉じる)は終了せずトレイへ格納する(常駐アプリのため)。
//   → 完全終了はトレイメニューの「終了」からのみ。
//
// ウィンドウ位置・サイズの記憶は tauri-plugin-window-state が担当するため、
// ここでは「見せる/隠す」だけを扱う(位置の保存/復元ロジックは持たない)。

use tauri::{
    menu::{Menu, MenuEvent, MenuItem},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    AppHandle, Manager, Runtime, WindowEvent,
};
use tauri_plugin_window_state::{AppHandleExt, StateFlags};

const MENU_TOGGLE: &str = "toggle";
const MENU_QUIT: &str = "quit";

/// メインウィンドウの表示/非表示を切り替える。
/// 表示に切り替えるときは最前面へ持ち上げてフォーカスも与える。
fn toggle_main_window<R: Runtime>(app: &AppHandle<R>) {
    if let Some(win) = app.get_webview_window("main") {
        let visible = win.is_visible().unwrap_or(false);
        if visible {
            let _ = win.hide();
        } else {
            let _ = win.show();
            let _ = win.set_focus();
        }
    }
}

fn on_menu_event<R: Runtime>(app: &AppHandle<R>, event: MenuEvent) {
    match event.id().as_ref() {
        MENU_TOGGLE => toggle_main_window(app),
        MENU_QUIT => {
            // ✕での終了は無効化しているため、通常この経路が唯一の完全終了。
            // ウィンドウが表示中のまま終了された場合に備え、現在の位置/サイズを保存する。
            let _ = app.save_window_state(StateFlags::all());
            app.exit(0);
        }
        _ => {}
    }
}

/// トレイアイコンを生成して常駐させる。lib.rs の setup から1回だけ呼ぶ。
pub fn setup_tray<R: Runtime>(app: &AppHandle<R>) -> tauri::Result<()> {
    let toggle = MenuItem::with_id(app, MENU_TOGGLE, "表示 / 非表示", true, None::<&str>)?;
    let quit = MenuItem::with_id(app, MENU_QUIT, "終了", true, None::<&str>)?;
    let menu = Menu::with_items(app, &[&toggle, &quit])?;

    TrayIconBuilder::with_id("clipmaru-tray")
        .icon(app.default_window_icon().unwrap().clone())
        .tooltip("ClipMaru")
        .menu(&menu)
        // 左クリックはメニューを出さず、表示/非表示トグルに使う。
        .show_menu_on_left_click(false)
        .on_menu_event(|app, event| on_menu_event(app, event))
        .on_tray_icon_event(|tray, event| {
            if let TrayIconEvent::Click {
                button: MouseButton::Left,
                button_state: MouseButtonState::Up,
                ..
            } = event
            {
                toggle_main_window(tray.app_handle());
            }
        })
        .build(app)?;

    Ok(())
}

/// ウィンドウの✕を「終了」ではなく「トレイへ格納」に振り替える。
/// 常駐アプリなので、閉じてもプロセスは生かしたままトレイに残す。
pub fn on_window_event<R: Runtime>(window: &tauri::Window<R>, event: &WindowEvent) {
    if let WindowEvent::CloseRequested { api, .. } = event {
        if window.label() == "main" {
            // トレイへ格納する前に、今の位置/サイズを保存(次回表示時に復元される)。
            let _ = window.app_handle().save_window_state(StateFlags::all());
            api.prevent_close();
            let _ = window.hide();
        }
    }
}
