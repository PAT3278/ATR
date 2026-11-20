# 手元（VS Code）での開発

ゲーム（このリポジトリ）とショップ API（nshack）を並べて置き、VS Code のワークスペースで一緒に開きます。

```
<好きなフォルダ>/
  ATR/      このリポジトリ（git clone https://github.com/PAT3278/ATR）
  nshack/   NS HACK のサイト（git clone https://github.com/PAT3278/nshack）
```

## 最初に一度だけ

1. 両方とも作業ブランチに切り替える（`git checkout claude/affectionate-noether-nceryn`）。
2. 未発表の mp3（field / ohh / shot）を `ATR/SoundWalk/audio/` に置く（git には入らない）。
3. VS Code で `ATR/soundwalk.code-workspace` を開く（File > Open Workspace from File）。右下に出るおすすめ拡張（Claude Code、Stripe、ESLint）を入れる。
4. ターミナルで:
   - `cd SoundWalk && npm run setup`（テスト用のブラウザを入れる）
   - `cd ../../nshack && npm install && cp .env.example .env.local`、`.env.local` に Stripe の**テスト用**キーを書く
   - Stripe CLI を入れて `stripe login`（Webhook を手元に転送するため）

## すぐ試運転（ミュートで開く）

- `SoundWalk\play.cmd` をダブルクリック（または `npm run play`）。サーバーを立ててブラウザでゲームを開きます。音は消えた状態で始まり、右上のスピーカーで戻せます（URL の `?mute=1`）。サーバーは裏で動き続けるので、2回目からはすぐ開きます。止めるときは `npm run stop`。音ありで開くなら `npm run play -- --sound`。
- コードを直したら、開いているタブで再読み込み（Ctrl+R）。
- 動きのカクつきを測るなら `npm run perf`（窓が開いて約30秒自動で歩き、fps と、50ms・100ms を超えて止まったフレームの数と場所を出します）。
## 遊ぶ・デバッグする（F5）

左の「実行とデバッグ」から選んで F5:

- **Play SoundWalk** — ゲームだけ。`SoundWalk/src` の JS に VS Code でブレークポイントを置いて止められる。保存して再読み込み（Ctrl+R）で反映。
- **Play SoundWalk + shop (Stripe test mode)** — ゲーム・nshack・`stripe listen` をまとめて起動し、購入ボタンが手元の API につながる。テストカード `4242 4242 4242 4242`（期限は未来の日付、CVC は何でも）で買って、戻ってきたらフルで聴けるか確認できる。
- **Play SoundWalk on a phone-sized window** — 縦長の窓で。実機で見るなら、同じ Wi-Fi のスマホで `http://<PCのIP>:8000/` を開く。

ゲームの `?api=...` は localhost のときだけ効き、その PC に記憶されます（Stripe から戻っても続く）。`?api=off` で解除。

## テスト

- コマンドパレット > Tasks: Run Test Task（または `cd SoundWalk && npm test`）。PC とスマホの画面で、読み込み・歩く・地図・「眺める」を実際のブラウザで通し、エラーがあれば FAIL。スクリーンショットは `SoundWalk/tests/out/`。`npm run test:headed` で動くところを見られる。
- Claude Code に頼むときは「直したら `npm test` を回して」と言えば、手元の GPU で速く確認できる。

## 公開

- ゲームはビルド不要のただのファイル。Vercel / GitHub Pages / 今のアーティファクトにそのまま置ける。
- nshack は Vercel に。本番の環境変数は `nshack/SETUP.md`。ゲームの `src/songs.js` の `SW.CONFIG.api` を本番の URL にする。
