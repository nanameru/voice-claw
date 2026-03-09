# VoiceClaw - 開発ドキュメント

## 🔧 最新の修正履歴
- 2026-03-09: 初期プロジェクト構築（Electron + React + TypeScript + Tailwind CSS）

## 🏗️ ディレクトリの目的と責務
音声起動型AIアシスタントデスクトップアプリ。グローバルショートカットでSpotlight風フローティングオーバーレイを呼び出し、音声入力→OpenClaw実行→レスポンス表示を実現する。

## 📁 主要ファイルの説明
- `electron/main/index.ts` - Electronメインプロセスエントリ
- `electron/main/overlay-window.ts` - フローティングオーバーレイウィンドウ管理
- `electron/main/shortcut.ts` - グローバルショートカット（Alt+Space）
- `electron/main/tray.ts` - システムトレイ
- `electron/gateway/connection.ts` - OpenClaw Gateway WebSocket接続
- `electron/preload/index.ts` - contextBridge API
- `src/App.tsx` - React ルートコンポーネント
- `src/components/overlay/` - オーバーレイUI（VoiceInput, Transcription, ResponsePanel, WaveformVisualizer）
- `src/stores/` - Zustand状態管理（voice, gateway, conversation, settings, ui）

## ⚙️ 技術的な実装詳細
| レイヤー | 技術 |
|---------|------|
| ランタイム | Electron 28 |
| UI | React 18 + TypeScript |
| 状態管理 | Zustand |
| スタイリング | Tailwind CSS (ダークテーマ) |
| アニメーション | Framer Motion |
| 音声認識 | Web Speech API |
| WebSocket | ws パッケージ |
| ビルド | Vite + electron-builder |

## 🎨 実装パターンとベストプラクティス
- ESM形式（package.jsonに`"type": "module"`）
- `__dirname`の代わりに`fileURLToPath(import.meta.url)`を使用
- wsパッケージはvite.config.tsでexternalに指定
- electron-storeで設定永続化

## 🛠️ トラブルシューティング
- GPU関連エラー（transparent window）: macOSでは正常。機能に影響なし
- `ws`モジュール: external指定必須。バンドルするとElectronで動作しない
