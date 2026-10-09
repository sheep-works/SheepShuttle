# SheepShuttle

SheepFamily の翻訳・ローカライゼーション支援コアライブラリおよび CLI ツール群。

## 構成

- `packages/types`: ShWvData をはじめとする共通型定義（Single Source of Truth）
- `packages/core`: XLIFF, TMX, TBX, DOCX 等の各種パーサー、QAチェック、差分計算ロジック
- `packages/cli`: ターミナルから利用可能なコマンドラインツール
- `packages/api`: Hono ベースのローカル/AI API サーバー

## 利用方法

他のリポジトリ（`SheepComb`, `SheepBobbin`, `SheepWeave`）からは Git Submodule または npm パッケージとして参照されます。

```bash
# 依存関係のインストール
pnpm install

# CLI の実行
pnpm cli

# テスト実行
pnpm test
```