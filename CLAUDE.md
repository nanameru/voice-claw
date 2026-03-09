# VoiceClaw - 開発ドキュメント

## 🔧 最新の修正履歴
- 2026-03-09: Gatewayエージェントイベントパーサーを修正（stream/data構造に対応）
- 2026-03-09: MediaRecorder + Whisper APIによる音声入力を実装（Web Speech API置換）
- 2026-03-09: LiveKit Aura風WebGLシェーダービジュアライザー実装
- 2026-03-09: ClawX互換Gateway認証（Ed25519デバイスID + チャレンジ-レスポンス）
- 2026-03-09: 初期プロジェクト構築（Electron + React + TypeScript + Tailwind CSS）

## 🏗️ ディレクトリの目的と責務
音声起動型AIアシスタントデスクトップアプリ。グローバルショートカットでSpotlight風フローティングオーバーレイを呼び出し、音声入力→OpenClaw実行→レスポンス表示を実現する。

## 📁 主要ファイルの説明
- `electron/main/index.ts` - Electronメインプロセスエントリ
- `electron/main/overlay-window.ts` - フローティングオーバーレイウィンドウ管理
- `electron/main/shortcut.ts` - グローバルショートカット（Alt+Space）
- `electron/main/tray.ts` - システムトレイ
- `electron/gateway/connection.ts` - OpenClaw Gateway WebSocket接続（ClawX互換プロトコル）
- `electron/utils/device-identity.ts` - Ed25519デバイスID生成・署名
- `electron/preload/index.ts` - contextBridge API
- `src/App.tsx` - React ルートコンポーネント
- `src/components/overlay/AuraVisualizer.tsx` - WebGLシェーダーオーラビジュアライザー
- `src/components/overlay/ReactShaderToy.tsx` - WebGLレンダリングエンジン
- `src/components/overlay/VoiceInput.tsx` - 音声入力UI（Auraオーブ + マイク）
- `electron/audio/whisper.ts` - OpenAI Whisper API音声文字起こし
- `src/hooks/useAuraVisualizer.ts` - 状態・音量→シェーダーユニフォーム変換
- `src/stores/` - Zustand状態管理（voice, gateway, conversation, settings, ui）

## ⚙️ 技術的な実装詳細
| レイヤー | 技術 |
|---------|------|
| ランタイム | Electron 28 |
| UI | React 18 + TypeScript |
| 状態管理 | Zustand |
| スタイリング | Tailwind CSS (ダークテーマ) |
| アニメーション | Framer Motion |
| ビジュアライザー | WebGL GLSL シェーダー（LiveKit Aura風） |
| 音声認識 | MediaRecorder + OpenAI Whisper API |
| WebSocket | ws パッケージ |
| Gateway認証 | Ed25519署名 + チャレンジ-レスポンス |
| ビルド | Vite + electron-builder |

## 🔐 Gateway接続プロトコル（ClawX互換）
1. WebSocket接続: `ws://localhost:18789/ws`
2. サーバーから`connect.challenge`イベント受信（nonce付き）
3. nonceを使ってEd25519署名を生成
4. `connect`リクエスト送信（device ID + 署名 + gateway token）
5. Gateway tokenは`~/.openclaw/openclaw.json`から自動読み取り
6. リクエスト形式: `{ type: "req", id, method, params }`
7. チャット送信: `chat.send({ sessionKey, message, deliver, idempotencyKey })`
8. ストリーミング: `event` type で `agent` イベント
   - `stream: "assistant"` + `data.delta` = インクリメンタルテキスト
   - `stream: "lifecycle"` + `data.phase: "start"|"end"|"done"` = ライフサイクル管理

## 🎨 実装パターンとベストプラクティス
- ESM形式（package.jsonに`"type": "module"`）
- `__dirname`の代わりに`fileURLToPath(import.meta.url)`を使用
- wsパッケージはvite.config.tsでexternalに指定
- electron-storeで設定永続化
- デバイスIDは`userData/device-identity.json`に永続化

## 🛠️ トラブルシューティング
- GPU関連エラー（transparent window）: macOSでは正常。機能に影響なし
- `ws`モジュール: external指定必須。バンドルするとElectronで動作しない
- Gateway token: `~/.openclaw/openclaw.json` > `gateway.auth.token`
- デバイスID: Ed25519鍵ペア、`app.getPath('userData')/device-identity.json`に保存
