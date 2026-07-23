// commands/safe_write.rs
// tmpに書く → 読み戻して検証 → rename(原子的置換)。
// 検証に失敗したら元ファイルは無傷のまま。
// エクスポート・スナップショット・バックアップJSON用(主ストレージはSQLite。R1)。

use std::fs;
use std::path::PathBuf;

/// 実体(テスト可能な純粋関数)。コマンドはこれを包むだけ。
pub fn safe_write_json_impl(path: &str, contents: &str) -> Result<(), String> {
    let target = PathBuf::from(path);
    let tmp = target.with_extension("tmp");

    // 1. tmpへ書き込み
    fs::write(&tmp, contents.as_bytes()).map_err(|e| format!("write: {e}"))?;

    // 2. 検証: 読み戻し一致 + JSONとしてパース可能
    let back = fs::read_to_string(&tmp).map_err(|e| format!("readback: {e}"))?;
    if back != contents {
        let _ = fs::remove_file(&tmp);
        return Err("verify: 読み戻し不一致".into());
    }
    if let Err(e) = serde_json::from_str::<serde_json::Value>(&back) {
        let _ = fs::remove_file(&tmp);
        return Err(format!("verify: JSONパース失敗 {e}"));
    }

    // 3. rename(同一ボリューム内なら原子的)
    fs::rename(&tmp, &target).map_err(|e| format!("rename: {e}"))?;
    Ok(())
}

#[tauri::command]
pub async fn safe_write_json(path: String, contents: String) -> Result<(), String> {
    safe_write_json_impl(&path, &contents)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;

    /// 【受け入れ確認】検証失敗時(壊れたJSON)に元ファイルが無傷で残ること
    #[test]
    fn broken_json_leaves_original_intact() {
        let dir = std::env::temp_dir().join("annystation_safe_write_test");
        let _ = fs::create_dir_all(&dir);
        let target = dir.join("save.json");
        let original = r#"{"ok":true}"#;
        fs::write(&target, original).unwrap();

        // 壊れたJSONを書かせる → エラーになる
        let result = safe_write_json_impl(target.to_str().unwrap(), "{broken json!");
        assert!(result.is_err());

        // 元ファイルは無傷・tmpも残っていない
        assert_eq!(fs::read_to_string(&target).unwrap(), original);
        assert!(!target.with_extension("tmp").exists());

        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn valid_json_replaces_atomically() {
        let dir = std::env::temp_dir().join("annystation_safe_write_test2");
        let _ = fs::create_dir_all(&dir);
        let target = dir.join("save.json");
        fs::write(&target, r#"{"old":1}"#).unwrap();

        safe_write_json_impl(target.to_str().unwrap(), r#"{"new":2}"#).unwrap();

        assert_eq!(fs::read_to_string(&target).unwrap(), r#"{"new":2}"#);
        assert!(!target.with_extension("tmp").exists());

        let _ = fs::remove_dir_all(&dir);
    }
}
