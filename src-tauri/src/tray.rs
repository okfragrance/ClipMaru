// tray.rs
// システムトレイ常駐(仕様§3・技術検討6)。
// ・左クリック(トレイアイコン)= 常に「表示して前面へ」(トグルではない)。
// ・右クリックメニュー = 「表示 / 非表示」(こちらがトグル)「終了」。
// ・ウィンドウの✕(閉じる)は終了せずトレイへ格納する(常駐アプリのため)。
//   → 完全終了はトレイメニューの「終了」からのみ。
//
// 【左クリックをトグルにしない理由】実機で「トレイを押しても出てこない」が起きた。
// ① ウィンドウが他アプリの裏に隠れているとき、ユーザーには見えていないのに
//    `is_visible()` は true。トグルだと「隠す」側に倒れて何も起きないように見える。
// ② Windows はトレイアイコンのダブルクリックで WM_LBUTTONUP を2回送る
//    (WM_LBUTTONUP → WM_LBUTTONDBLCLK → WM_LBUTTONUP)。tray-icon はこれを
//    Click 2回として通知するため、トグルだと「表示→即非表示」で差し引きゼロになる。
// ③ 「今フォーカスを持っているか」で分岐する手もあるが、トレイをクリックした時点で
//    フォアグラウンドはシェル(通知領域)へ移るので、判定材料として使えない。
// → 左クリックは「表示」に振り切り、引っ込める操作は ✕ とトレイメニューに任せる。
//
// ウィンドウ位置・サイズの記憶は tauri-plugin-window-state が担当するため、
// ここでは「見せる/隠す」だけを扱う(位置の保存/復元ロジックは持たない)。
//
// 「ウィンドウを表示する」経路は show_main_window の1本だけにする
// (トレイ左クリック / トレイメニュー / 多重起動時のフォーカス要求)。
// 表示のたびに最前面固定を張り直す必要があるため、経路を散らすと必ず漏れる。

use tauri::{
    menu::{Menu, MenuEvent, MenuItem},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    AppHandle, Manager, Runtime, WindowEvent,
};
use tauri_plugin_window_state::{AppHandleExt, StateFlags};

const MENU_TOGGLE: &str = "toggle";
const MENU_QUIT: &str = "quit";

/// メインウィンドウを表示して手前に出す。何度呼んでも同じ結果になる(冪等)。
///
/// `set_focus` は tao の force_window_active、つまり SetForegroundWindow +
/// (拒否されたときの)Altキー送出ハックまで面倒を見てくれるので、前面化はこれで足りる。
///
/// 【最前面固定には触らない】ここで `set_always_on_top` を呼んではいけない。
/// ・固定の正はフロント(`settings.alwaysOnTop`)であって、Rust側は知らない。
///   `is_always_on_top()` で読んでから書き戻すと、フロントが起動直後に設定を適用する
///   タイミングと競合する(読んだ後・書く前にフロントが true にすると、こちらの
///   後追いの false が勝って「UIは ON なのに前面に出ない」状態が作れてしまう。
///   実際にこの手順で再現させた)。
/// ・そもそも tao の `set_always_on_top` は WindowFlags の**差分がある時だけ**
///   SetWindowPos を出す(`window_state.rs` の apply_diff)。同じ値を投げ直しても
///   何も起きないので、「張り直し」としては機能しない。
/// → 表示経路は「出して・前に出す」だけを担当し、固定の面倒はフロントが見る。
pub fn show_main_window<R: Runtime>(app: &AppHandle<R>) {
    if let Some(win) = app.get_webview_window("main") {
        if win.is_minimized().unwrap_or(false) {
            let _ = win.unminimize();
        }
        let _ = win.show();
        let _ = win.set_focus();
    }
}

/// メインウィンドウの表示/非表示を切り替える(トレイメニューの「表示 / 非表示」)。
/// 左クリックはこれを使わない(ファイル冒頭の理由により表示専用)。
fn toggle_main_window<R: Runtime>(app: &AppHandle<R>) {
    if let Some(win) = app.get_webview_window("main") {
        if win.is_visible().unwrap_or(false) {
            let _ = win.hide();
        } else {
            show_main_window(app);
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
        // アプリを開かずにホバーだけで版が分かるよう、tooltipにバージョンを入れる。
        // 正は Cargo.toml / tauri.conf.json の version(両者は同じ値で運用)。
        .tooltip(format!("ClipMaru v{}", env!("CARGO_PKG_VERSION")))
        .menu(&menu)
        // 左クリックはメニューを出さず、ウィンドウの呼び出しに使う。
        .show_menu_on_left_click(false)
        .on_menu_event(|app, event| on_menu_event(app, event))
        .on_tray_icon_event(|tray, event| {
            // シングル/ダブルどちらでも「表示して前面へ」。show_main_window は冪等なので、
            // ダブルクリックで Click が2回届いても結果は変わらない。
            let is_left_click = matches!(
                event,
                TrayIconEvent::Click {
                    button: MouseButton::Left,
                    button_state: MouseButtonState::Up,
                    ..
                } | TrayIconEvent::DoubleClick {
                    button: MouseButton::Left,
                    ..
                }
            );
            if is_left_click {
                show_main_window(tray.app_handle());
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
