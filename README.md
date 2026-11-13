# Ruby-Kuiyahaoran

Rails 8.1.4 / Ruby 4.0.6 のパチンコシミュレーター開発用プロジェクトです。盤面の表示、Matter.js による玉の物理演算、ヘソ入賞から抽選までのゲーム進行を段階的に実装しています。

## 必要環境

- Ruby 4.0.6
- Node.js 24 LTS（`.nvmrc` を参照）
- npm

## セットアップ

```sh
bundle install
npm ci
npm run build
```

## 起動

```sh
bundle exec rails server
```

ブラウザで <http://localhost:3000> を開いてください。

## テスト

```sh
bundle exec rails test
node --test test/javascript/*_test.js
npm test
```

`npm run check` で型検査・ESLint・Vitest・既存JSテスト・Viteビルドをまとめて実行できます。

## TypeScript ゲームコア

- `src/core/` はDOM・Vue・Railsに依存しないゲームルール層です。
- `src/integration/browserAdapter.ts` が `window.PachinkoGameCore` としてブラウザへ公開します。
- `npm run build` で `app/assets/builds/game_core.js` を生成し、Propshaft が配信します。
- 抽選はヘソ入賞時に1回だけ実行し、結果を保留に保存します。保留消化時に再抽選しません。
- `?core=0` で従来のRails抽選へフォールバックできます。`?seed=任意の文字列` で乱数を固定できます。
- コア有効時も Rails セッションは表示用に同期し、`/pachinko/consume` は `draw: false` で呼び出します。

## 遊技ダッシュボード

- `src/core/stats/sessionStats.ts` が投資・打ち出し・払出・大当たり履歴・収支をDOM非依存で集計します。
- `src/integration/sessionStatsStore.ts` が `window.PachinkoSessionStats` として公開し、`sessionStorage` に保存します。
- 初期投資は ¥3,000（750玉）、「追加投資」は1回 ¥1,000（250玉）です。持ち玉が0になると自動発射を止めます。
- 自動発射は0.6秒間隔（1分間100発）です。「打ち出し停止」は最低0.6秒間は発射を継続し、保留4個で自動停止、3個以下で自動再開します。
- 収支は `差玉 × 4円`、持ち玉は `投資玉 + 払出 − 打ち出し` で算出します。
- 大当たり時はスペックの `roundCount` / `jackpotBalls` を払出として記録し、履歴と収支グラフへ即時反映します。
- リセット時はゲームコアとダッシュボードの両方のセッション保存を消去します。

## パチンコスペック

1/399 10凸 81%

デカへそ

初当たり 90% 500発 10% 10500発

右 159回転 1/99

右出玉 25% 1500 50% 6000 5% リセット 20% 10500+@

1図柄 ひかる
2図柄　せいご
3図柄　清田
4図柄　亮太
5図柄　聖
6図柄　岩崎晴也
7図柄　おがゆう
8図柄　野崎
9図柄　こがゆう

## ドキュメント

- 盤面物理の設定と挙動: `docs/pachinko-physics.md`
