// core/types.ts
// ClipMaru のデータモデル。仕様書「データモデル(参考)」を、テンプレートの
// スキーマ駆動KV(deepMergeは配列を丸ごと置換)へ翻訳した形。
//
// ・順序は配列のindexで表現する(order列は持たない)。
// ・カテゴリは items を内包する(動的キーMapにすると復元時に全消えするため)。
// ・「グループN」採番・見た目連番は保存しない(phrasebook.ts で描画時に導出)。

/** 定型文の1件(実際にコピーされる中身を持つ) */
export interface PhraseEntry {
  type: "phrase";
  id: string;
  /** 一覧に出る見出し。labelIsAuto の場合は content 先頭から自動生成した値 */
  label: string;
  /** true = 見出しは content から自動生成(編集で空保存すると true に戻る) */
  labelIsAuto: boolean;
  /** 実際にコピー・貼り付けされる中身(長文可) */
  content: string;
}

/** グループ分けの区切り線。配下の定型文は削除しても消えない */
export interface DividerEntry {
  type: "divider";
  id: string;
  /** 手動編集されたラベル。labelIsAuto の間は空(表示は「グループN」) */
  label: string;
  /** true = 自動採番中(手動編集されると false に固定) */
  labelIsAuto: boolean;
  /** この区切り線〜次の区切り線までの定型文に見た目連番を出すか(見た目だけ) */
  numbered: boolean;
}

export type PhraseItem = PhraseEntry | DividerEntry;

/** カテゴリ。items を内包し、並び順は items の index で表現する */
export interface Category {
  id: string;
  name: string;
  items: PhraseItem[];
}

export type TabName = "history" | "phrases" | "folders";

/**
 * ピン留めフォルダ/ショートカット。path はフォルダに限らずファイル・.exe・.lnk・
 * URL(http/https/mailto/tel)も許容し、開く側(storage/opener.ts)が種別を判定する。
 */
export interface FolderEntry {
  id: string;
  label: string;
  path: string;
}

/** メイン書体の選択肢。theme.css の :root[data-font="..."] と対応 */
export type FontFamilyKey = "maru" | "gothic" | "mincho";

/** 文字サイズ段階。theme.css の :root[data-scale="..."](--font-scale)と対応 */
export type FontScaleKey = "small" | "medium" | "large";

/** 共有設定(単一ユーザーなので全て shared スコープ) */
export interface Settings {
  /** 配色テーマ名。theme.css の変数セットと対応(既定はクリーム×オレンジ) */
  theme: string;
  /** 常に最前面(Tauri always-on-top と同期) */
  alwaysOnTop: boolean;
  /** 起動時に開くタブ */
  activeTab: TabName;
  /** ダイヤルの選択位置復元用に、最後に開いていたカテゴリID */
  activeCategoryId: string;
  /** メイン書体(丸ゴシック同梱 / システムのゴシック・明朝から選択) */
  fontFamily: FontFamilyKey;
  /** 文字サイズ(UI全体を段階ズーム。theme.css の --font-scale) */
  fontScale: FontScaleKey;
}

/** クリップボードのフォーマット種別 */
export type ClipFormat = "plain" | "rich" | "image";

/** 履歴の1件(relationalテーブル history と1:1。PERSIST_SCHEMA には載せない) */
export interface HistoryItem {
  id: string;
  /** プレーンテキスト(常に存在)。format='image' のときは "画像 (幅×高さ)" 等の表示用文言 */
  content: string;
  /** リッチ本文(HTML/RTF)。format が plain/image のときは null */
  contentRich: string | null;
  format: ClipFormat;
  /** 行トグル: リッチでもプレーンとしてコピーする指定(画像には使わない) */
  forcePlain: boolean;
  /** 記録時刻(表示はしないが将来の整理機能のため保持) */
  createdAt: number;
  /**
   * format='image' のときだけ値を持つ、表示・コピー用の data URL
   * (`data:image/png;base64,...`)。実データは blobs テーブルにありここでは
   * list() 時に組み立てたもの(R1: 本文には参照IDのみ、というのは history 行自体の話で、
   * これは表示用に一時的に組み立てた値であり保存はしない)。
   */
  imageDataUrl: string | null;
}
