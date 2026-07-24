// commands/clipboard_write.rs
// クリップボードへの画像書き込み専用コマンド。
//
// 【なぜRust側コマンドが必要か】WebView(WebView2)の navigator.clipboard.write() は
// 画像/HTML/ファイル形式の書き込みサポートが不完全/不安定(Tauri/WebView2環境で
// 既知の問題。コミュニティが専用プラグインを作るほど)。読み取りに使っている
// clipboard-win をそのまま書き込みにも使い、Rust側で完結させる方が確実。
//
// clipboard_win::raw::set_bitmap は raw::get_bitmap と対称的に「それ自体で完結した
// BMPファイル」(BITMAPFILEHEADER込み)を期待する(ソースの bfOffBits 参照箇所で
// 確認済み)。image crate の BMPエンコーダは標準的なBMPファイル形式(ファイルヘッダ
// 込み)を出力するため、そのまま渡せる。

use base64::prelude::*;
use clipboard_win::options::DoClear;
use clipboard_win::{raw, Clipboard};
use image::ImageFormat;
use std::io::Cursor;

/// 実体(テスト可能な純粋関数)。base64 PNG → BMP変換のみを担う。
/// クリップボードへの実書き込み(OS状態の変更)はコマンド側で行う。
fn png_base64_to_bmp(png_base64: &str) -> Result<Vec<u8>, String> {
    let png_bytes = BASE64_STANDARD
        .decode(png_base64)
        .map_err(|e| format!("base64デコード失敗: {e}"))?;
    let img = image::load_from_memory_with_format(&png_bytes, ImageFormat::Png)
        .map_err(|e| format!("PNGデコード失敗: {e}"))?;
    let mut bmp = Vec::new();
    img.write_to(&mut Cursor::new(&mut bmp), ImageFormat::Bmp)
        .map_err(|e| format!("BMPエンコード失敗: {e}"))?;
    Ok(bmp)
}

#[tauri::command]
pub fn write_clipboard_image(png_base64: String) -> Result<(), String> {
    let bmp = png_base64_to_bmp(&png_base64)?;
    let _clip =
        Clipboard::new_attempts(10).map_err(|e| format!("クリップボードのopen失敗: {e:?}"))?;
    raw::set_bitmap_with(&bmp, DoClear).map_err(|e| format!("set_bitmap失敗: {e:?}"))?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use image::GenericImageView;

    fn make_png_base64() -> String {
        let img = image::RgbImage::from_pixel(2, 2, image::Rgb([10, 20, 30]));
        let mut png_bytes = Vec::new();
        image::DynamicImage::ImageRgb8(img)
            .write_to(&mut Cursor::new(&mut png_bytes), ImageFormat::Png)
            .unwrap();
        BASE64_STANDARD.encode(&png_bytes)
    }

    #[test]
    fn png_base64_to_bmp_produces_valid_bmp_header() {
        let bmp = png_base64_to_bmp(&make_png_base64()).expect("should convert");
        assert_eq!(&bmp[0..2], b"BM"); // BITMAPFILEHEADERのマジックバイト
    }

    #[test]
    fn png_base64_to_bmp_roundtrips_through_image_crate() {
        let bmp = png_base64_to_bmp(&make_png_base64()).unwrap();
        let img = image::load_from_memory_with_format(&bmp, ImageFormat::Bmp)
            .expect("should decode back as bmp");
        assert_eq!(img.dimensions(), (2, 2));
    }

    #[test]
    fn png_base64_to_bmp_rejects_invalid_base64() {
        assert!(png_base64_to_bmp("not valid base64!!!").is_err());
    }

    #[test]
    fn png_base64_to_bmp_rejects_non_png_bytes() {
        let garbage = BASE64_STANDARD.encode(b"not a png");
        assert!(png_base64_to_bmp(&garbage).is_err());
    }
}
