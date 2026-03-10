# VoiceClaw - 開発ドキュメント

## 🔧 最新の修正履歴
- 2026-03-09: Skills管理パネル + Cronスケジュールタスク管理パネルを追加
- 2026-03-09: Gateway RPC基盤をPromiseベースに拡張（rpcGateway関数追加）
- 2026-03-09: セキュリティ修正（safeStorage平文フォールバック廃止、デッドコード削除、型安全性向上）
- 2026-03-09: Electron 28→33にアップグレード
- 2026-03-09: Gatewayエージェントイベントパーサーを修正（stream/data構造に対応）
- 2026-03-09: MediaRecorder + Whisper APIによる音声入力を実装（Web Speech API置換）
- 2026-03-09: LiveKit Aura風WebGLシェーダービジュアライザー実装
- 2026-03-09: ClawX互換Gateway認証（Ed25519デバイスID + チャレンジ-レスポンス）
- 2026-03-09: 初期プロジェクト構築（Electron + React + TypeScript + Tailwind CSS）

## 🏗️ ディレクトリの目的と責務
音声起動型AIアシスタントデスクトップアプリ。グローバルショートカットでSpotlight風フローティングオーバーレイを呼び出し、音声入力→OpenClaw実行→レスポンス表示を実現する。Skills管理・Cronタスク管理にも対応。

## 📁 主要ファイルの説明
- `electron/main/index.ts` - Electronメインプロセスエントリ
- `electron/main/overlay-window.ts` - フローティングオーバーレイウィンドウ管理
- `electron/main/ipc-handlers.ts` - IPC通信ハンドラー（Gateway RPC、Skills、Cron対応）
- `electron/main/shortcut.ts` - グローバルショートカット（Alt+Space）
- `electron/main/tray.ts` - システムトレイ
- `electron/gateway/connection.ts` - OpenClaw Gateway WebSocket接続 + Promise RPC基盤
- `electron/gateway/process.ts` - Gatewayプロセスのライフサイクル管理
- `electron/utils/device-identity.ts` - Ed25519デバイスID生成・署名
- `electron/utils/store.ts` - electron-store + safeStorage暗号化
- `electron/preload/index.ts` - contextBridge API（IPCチャネルホワイトリスト）
- `electron/audio/whisper.ts` - OpenAI Whisper API音声文字起こし
- `electron/audio/tts.ts` - OpenAI TTS音声合成
- `src/App.tsx` - React ルートコンポーネント
- `src/components/overlay/VoiceOverlay.tsx` - メインオーバーレイUI
- `src/components/overlay/AuraVisualizer.tsx` - WebGLシェーダーオーラビジュアライザー
- `src/components/skills/SkillsPanel.tsx` - Skills管理パネル
- `src/components/cron/CronPanel.tsx` - Cronスケジュールタスク管理パネル
- `src/stores/` - Zustand状態管理（voice, gateway, conversation, settings, ui, tts, activity, skills, cron）
- `src/types/` - 型定義（electron.d.ts, skill.ts, cron.ts）

## ⚙️ 技術的な実装詳細
| レイヤー | 技術 |
|---------|------|
| ランタイム | Electron 33 |
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
7. Fire-and-forget: `sendToGateway(method, params)` — 戻り値なし
8. Promise RPC: `rpcGateway(method, params, timeoutMs)` — レスポンス待ち
9. チャット送信: `chat.send({ sessionKey, message, deliver, idempotencyKey })`
10. Skills管理: `skills.status`, `skills.update`
11. Cron管理: `cron.list`, `cron.add`, `cron.update`, `cron.remove`, `cron.run`
12. ストリーミング: `event` type で `agent` イベント
   - `stream: "assistant"` + `data.delta` = インクリメンタルテキスト
   - `stream: "lifecycle"` + `data.phase: "start"|"end"|"done"` = ライフサイクル管理

## 🎨 実装パターンとベストプラクティス
- ESM形式（package.jsonに`"type": "module"`）
- `__dirname`の代わりに`fileURLToPath(import.meta.url)`を使用
- wsパッケージはvite.config.tsでexternalに指定
- electron-storeで設定永続化、APIキーはsafeStorageで暗号化
- デバイスIDは`userData/device-identity.json`に永続化
- IPCチャネルはSet型ホワイトリストで厳密制御
- Gateway RPCメソッドもホワイトリスト制御（GATEWAY_RPC_ALLOWED_METHODS）

## 🛠️ トラブルシューティング
- GPU関連エラー（transparent window）: macOSでは正常。機能に影響なし
- `ws`モジュール: external指定必須。バンドルするとElectronで動作しない
- Gateway token: `~/.openclaw/openclaw.json` > `gateway.auth.token`
- デバイスID: Ed25519鍵ペア、`app.getPath('userData')/device-identity.json`に保存
- safeStorage未対応環境: APIキー保存がエラーになる（暗号化必須に変更済み）
