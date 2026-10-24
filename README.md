# Ruby-Kuiyahaoran

## パチンコシミュレーター STEP 1

Rails 8.1.4 / Ruby 4.0.6 の開発用プロジェクトです。ゲーム状態の永続化や物理演算はまだ実装していません。トップページはレイアウト確認用の仮画面です。

### 起動

```sh
bundle install
bundle exec rails server
```

ブラウザで <http://localhost:3000> を開いてください。

### テスト

```sh
bundle exec rails test
```

### STEP 2 の候補

- Ruby 側にゲーム状態を集約する設計と JSON エンドポイントを決める
- セッション内での初期状態・玉数・投資情報の保持方法を実装する
- Matter.js の導入範囲と盤面座標の設計を決める
- 玉の発射、衝突、入賞判定を小さな単位で追加する
