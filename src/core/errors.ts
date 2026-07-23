// core/errors.ts
// 「1キー壊れて起動不能」「同期がサイレントに止まる」の両方を潰す型。
// 原則: 非fatalエラーは握りつぶさず「集計してUIに見せる」。
// report.errors.length > 0 または defaulted.length > 0 なら
// UIは必ずトースト等で通知する(「一部のデータを初期値に戻しました」)。

export type ErrorScope = "restore" | "save" | "sync" | "engine" | "io";

export interface AppError {
  scope: ErrorScope;
  key?: string;      // どの状態キー/エンティティか
  message: string;
  cause?: unknown;
  at: number;        // Date.now()
  fatal: boolean;    // true: 起動中断 / false: 継続して報告
}

export interface RestoreReport {
  ok: boolean;            // fatalなエラーがない
  restored: string[];     // 正常復元できたキー
  defaulted: string[];    // defaultにフォールバックしたキー(理由つき)
  errors: AppError[];
}

interface TryMeta {
  scope: ErrorScope;
  key?: string;
  fatal?: boolean;
}

export class ErrorCollector {
  private _errors: AppError[] = [];
  private _restored: string[] = [];
  private _defaulted: string[] = [];

  /**
   * fnを実行。失敗したら集計に積み、fatal以外は続行(undefinedを返す)。
   * 成功時、keyがあれば restored に記録する。
   */
  trySync<T>(meta: TryMeta, fn: () => T): T | undefined {
    try {
      const r = fn();
      if (meta.key) this._restored.push(meta.key);
      return r;
    } catch (cause) {
      this._errors.push({
        scope: meta.scope,
        key: meta.key,
        message: cause instanceof Error ? cause.message : String(cause),
        cause,
        at: Date.now(),
        fatal: meta.fatal ?? false,
      });
      if (meta.key) this._defaulted.push(meta.key);
      if (meta.fatal) throw cause;
      return undefined;
    }
  }

  /** 非同期版(同期版と同じ規則) */
  async tryAsync<T>(meta: TryMeta, fn: () => Promise<T>): Promise<T | undefined> {
    try {
      const r = await fn();
      if (meta.key) this._restored.push(meta.key);
      return r;
    } catch (cause) {
      this._errors.push({
        scope: meta.scope,
        key: meta.key,
        message: cause instanceof Error ? cause.message : String(cause),
        cause,
        at: Date.now(),
        fatal: meta.fatal ?? false,
      });
      if (meta.key) this._defaulted.push(meta.key);
      if (meta.fatal) throw cause;
      return undefined;
    }
  }

  /** エラーではないが default にフォールバックしたことの記録(初回起動等) */
  defaulted(key: string, why: string): void {
    this._defaulted.push(`${key} (${why})`);
  }

  report(): RestoreReport {
    return {
      ok: !this._errors.some((e) => e.fatal),
      restored: [...this._restored],
      defaulted: [...this._defaulted],
      errors: [...this._errors],
    };
  }
}
