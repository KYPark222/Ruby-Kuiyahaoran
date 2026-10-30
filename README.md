# Ruby-Kuiyahaoran

Rails 8.1.4 / Ruby 4.0.6 のパチンコシミュレーター開発用プロジェクトです。盤面の表示、Matter.js による玉の物理演算、ヘソ入賞から抽選までのゲーム進行を段階的に実装しています。

## 起動

```sh
bundle install
bundle exec rails server
```

ブラウザで <http://localhost:3000> を開いてください。

## テスト

```sh
bundle exec rails test
node --test test/javascript/
```

## パチンコスペック

  1/399 10凸 81%

  デカへそ

  初当たり 90% 500発 10% 10500発

  右 159回転 1/99

  右出玉  25% 1500 50% 6000 5% リセット 20% 10500+@

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
