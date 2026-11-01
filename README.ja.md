# shadowinput

キーボードを中心に、入力中の文章を整え、別の言語を読むためのオープンソースプロジェクトです。

[ウェブサイトとダウンロード](https://shadowinput.com/#download) · [GitHub](https://github.com/simpledavid/shadowinput-app) · [简体中文](README.zh-CN.md) · [日本語](README.ja.md)

- **入力メソッド**：macOS / Windows の拼音入力とローカルモデルによる候補。Tab で採用します。Windows の完全なインストールとエディター互換性は未検証です。
- **Chrome 拡張機能**：ChatGPT ログイン、対訳表示、選択・ホバー・入力欄の翻訳プレビュー。ログインとモデル一覧は確認済みですが、翻訳の完了と実際のページの互換性は未検証です。利用にはアカウントの権限と利用枠が必要です。
- **中国語サイト**：製品紹介と DMG / EXE / ZIP。既存の公開バージョンは旧リポジトリから配布します。

自動入力候補はローカルモデルで処理します。長文編集と個人スタイル設定もデスクトップツールに残っています。

## 開発

Node、Go、各プラットフォームのツールチェーンと pnpm 10.33.0 を使用します。必要なバージョンと設定は構築文書を参照してください。

```sh
pnpm install --frozen-lockfile
node scripts/shadowinput.mjs check
node scripts/shadowinput.mjs dev
node scripts/shadowinput.mjs build macos
node scripts/shadowinput.mjs build windows
pnpm extension:check
```

`apps/desktop` は Go + MyGo と IMK / TSF 入力メソッド、`apps/extension` は Chrome 拡張機能、`apps/shadowinput-site` は中国語サイトです。

本リポジトリは独立した初期コミットから管理します。Arion を再利用した AGPL-3.0 派生プロジェクトであり、上流・第三者の著作権表示とライセンスを保持します。互換性の識別子と過去の技術文書は必要に応じて保持しています。

## 資料

- [输入法与构建说明](docs/project/shadowinput.md)
- [系统输入法使用与验收](docs/project/shadowinput-ime.md)
- [浏览器插件使用与验收](docs/project/shadowinput-extension.md)
- [仓库迁移记录](docs/project/shadowinput-repository.md)
- [编码规范](docs/quality/ub-mode.md)
- [开发指南](AGENTS.md) · [文档索引](docs/README.md)
- [开源协议](LICENSE) · [来源与致谢](NOTICE.md)
