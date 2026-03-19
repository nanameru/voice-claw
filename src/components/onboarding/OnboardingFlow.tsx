import { motion, AnimatePresence } from 'framer-motion'
import { useState, useEffect, useCallback, useRef } from 'react'
import { useSettingsStore } from '../../stores/settings'
import { useUIStore } from '../../stores/ui'

// ────────────────────────────────────────────────────────
// Types
// ────────────────────────────────────────────────────────

type Step = 'welcome' | 'cli' | 'gateway' | 'microphone' | 'ready'

interface CLIStatus {
  installed: boolean
  path?: string
  version?: string
}

interface InstallProgress {
  event: string
  message: string
}

type CLIState =
  | { phase: 'checking' }
  | { phase: 'found'; path: string; version: string }
  | { phase: 'not-found' }
  | { phase: 'installing'; message: string }
  | { phase: 'installed'; path: string; version: string }
  | { phase: 'error'; message: string }

type GatewayState =
  | { phase: 'idle' }
  | { phase: 'starting' }
  | { phase: 'started' }
  | { phase: 'connecting' }
  | { phase: 'connected' }
  | { phase: 'error'; message: string }

type MicState =
  | { phase: 'idle' }
  | { phase: 'checking' }
  | { phase: 'granted' }
  | { phase: 'denied' }
  | { phase: 'prompt' }

// ────────────────────────────────────────────────────────
// Animation variants
// ────────────────────────────────────────────────────────

const stepVariants = {
  enter: { opacity: 0, x: 30 },
  center: { opacity: 1, x: 0 },
  exit: { opacity: 0, x: -30 },
}

const transition = { duration: 0.25, ease: 'easeInOut' }

// ────────────────────────────────────────────────────────
// Shared UI components
// ────────────────────────────────────────────────────────

function PrimaryButton({
  onClick,
  disabled,
  children,
}: {
  onClick: () => void
  disabled?: boolean
  children: React.ReactNode
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className="px-6 py-2.5 bg-claw-accent hover:bg-claw-accent/80 disabled:opacity-40 disabled:cursor-not-allowed text-white rounded-lg text-sm font-medium transition-colors"
    >
      {children}
    </button>
  )
}

function SecondaryButton({
  onClick,
  children,
}: {
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      onClick={onClick}
      className="text-xs text-claw-text-dim hover:text-claw-text transition-colors"
    >
      {children}
    </button>
  )
}

function Spinner({ size = 20 }: { size?: number }) {
  return (
    <svg
      className="animate-spin text-claw-accent"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
    >
      <circle
        className="opacity-25"
        cx="12"
        cy="12"
        r="10"
        stroke="currentColor"
        strokeWidth="3"
      />
      <path
        className="opacity-75"
        fill="currentColor"
        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
      />
    </svg>
  )
}

function CheckIcon() {
  return (
    <div className="w-10 h-10 rounded-full bg-green-500/15 flex items-center justify-center">
      <svg
        className="w-5 h-5 text-green-400"
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
        strokeWidth={2.5}
      >
        <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
      </svg>
    </div>
  )
}

function ErrorIcon() {
  return (
    <div className="w-10 h-10 rounded-full bg-red-500/15 flex items-center justify-center">
      <svg
        className="w-5 h-5 text-red-400"
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
        strokeWidth={2.5}
      >
        <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
      </svg>
    </div>
  )
}

function StepIndicator({ current, total }: { current: number; total: number }) {
  return (
    <div className="flex items-center gap-1.5">
      {Array.from({ length: total }, (_, i) => (
        <div
          key={i}
          className={`h-1 rounded-full transition-all duration-300 ${
            i < current
              ? 'w-6 bg-claw-accent'
              : i === current
                ? 'w-6 bg-claw-accent/60'
                : 'w-3 bg-claw-border'
          }`}
        />
      ))}
    </div>
  )
}

// ────────────────────────────────────────────────────────
// Step 1: Welcome
// ────────────────────────────────────────────────────────

function WelcomeStep({ onNext }: { onNext: () => void }) {
  return (
    <motion.div
      key="welcome"
      variants={stepVariants}
      initial="enter"
      animate="center"
      exit="exit"
      transition={transition}
      className="text-center space-y-6 max-w-sm"
    >
      <div className="w-16 h-16 mx-auto rounded-2xl bg-claw-accent/10 flex items-center justify-center">
        <svg className="w-8 h-8 text-claw-accent" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 18.75a6 6 0 006-6v-1.5m-6 7.5a6 6 0 01-6-6v-1.5m6 7.5v3.75m-3.75 0h7.5M12 15.75a3 3 0 01-3-3V4.5a3 3 0 116 0v8.25a3 3 0 01-3 3z" />
        </svg>
      </div>

      <div className="space-y-2">
        <h1 className="text-2xl font-bold text-claw-text">Welcome to VoiceClaw</h1>
        <p className="text-sm text-claw-text-dim">
          音声でAIアシスタントを操作するデスクトップアプリ
        </p>
      </div>

      <PrimaryButton onClick={onNext}>セットアップを開始</PrimaryButton>
    </motion.div>
  )
}

// ────────────────────────────────────────────────────────
// Step 2: CLI Setup
// ────────────────────────────────────────────────────────

function CLIStep({ onNext }: { onNext: () => void }) {
  const [state, setState] = useState<CLIState>({ phase: 'checking' })
  const autoAdvanceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Auto-check on mount
  useEffect(() => {
    let cancelled = false

    async function check() {
      try {
        const result: CLIStatus = await window.voiceClaw.setup.checkCLI()
        if (cancelled) return
        if (result.installed && result.path && result.version) {
          setState({ phase: 'found', path: result.path, version: result.version })
        } else {
          setState({ phase: 'not-found' })
        }
      } catch {
        if (!cancelled) setState({ phase: 'not-found' })
      }
    }

    check()
    return () => { cancelled = true }
  }, [])

  // Auto-advance when CLI found
  useEffect(() => {
    if (state.phase === 'found' || state.phase === 'installed') {
      autoAdvanceRef.current = setTimeout(onNext, 1500)
      return () => {
        if (autoAdvanceRef.current) clearTimeout(autoAdvanceRef.current)
      }
    }
  }, [state.phase, onNext])

  const handleInstall = useCallback(async () => {
    setState({ phase: 'installing', message: 'OpenClaw CLIをインストール中...' })

    const unsubscribe = window.voiceClaw.setup.onInstallProgress((progress: InstallProgress) => {
      setState((prev) => {
        if (prev.phase !== 'installing') return prev
        return { phase: 'installing', message: progress.message }
      })
    })

    try {
      const result = await window.voiceClaw.setup.installCLI()
      unsubscribe()
      if (result.success && result.path && result.version) {
        setState({ phase: 'installed', path: result.path, version: result.version })
      } else {
        setState({ phase: 'error', message: result.error || 'インストールに失敗しました' })
      }
    } catch (err) {
      unsubscribe()
      setState({ phase: 'error', message: String(err) })
    }
  }, [])

  const handleRetry = useCallback(() => {
    setState({ phase: 'checking' })
    window.voiceClaw.setup.checkCLI().then((result: CLIStatus) => {
      if (result.installed && result.path && result.version) {
        setState({ phase: 'found', path: result.path, version: result.version })
      } else {
        setState({ phase: 'not-found' })
      }
    }).catch(() => {
      setState({ phase: 'not-found' })
    })
  }, [])

  return (
    <motion.div
      key="cli"
      variants={stepVariants}
      initial="enter"
      animate="center"
      exit="exit"
      transition={transition}
      className="space-y-5 w-full max-w-sm"
    >
      <div className="space-y-1">
        <h2 className="text-lg font-semibold text-claw-text">OpenClaw CLI</h2>
        <p className="text-xs text-claw-text-dim">
          VoiceClawの動作にはOpenClaw CLIが必要です
        </p>
      </div>

      <div className="bg-claw-surface rounded-xl p-4 space-y-3">
        {/* Checking */}
        {state.phase === 'checking' && (
          <div className="flex items-center gap-3">
            <Spinner />
            <span className="text-sm text-claw-text-dim">CLIを検出中...</span>
          </div>
        )}

        {/* Found */}
        {(state.phase === 'found' || state.phase === 'installed') && (
          <div className="space-y-2">
            <div className="flex items-center gap-3">
              <CheckIcon />
              <div>
                <p className="text-sm font-medium text-green-400">
                  {state.phase === 'installed' ? 'インストール完了' : 'CLI検出済み'}
                </p>
                <p className="text-xs text-claw-text-dim">
                  v{state.version} - {state.path}
                </p>
              </div>
            </div>
            <p className="text-xs text-claw-text-dim">自動的に次へ進みます...</p>
          </div>
        )}

        {/* Not found */}
        {state.phase === 'not-found' && (
          <div className="space-y-3">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-yellow-500/15 flex items-center justify-center">
                <svg className="w-5 h-5 text-yellow-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
                </svg>
              </div>
              <p className="text-sm text-claw-text">OpenClaw CLIが必要です</p>
            </div>

            <PrimaryButton onClick={handleInstall}>自動インストール</PrimaryButton>

            <div className="pt-2 border-t border-claw-border">
              <p className="text-xs text-claw-text-dim mb-1.5">手動インストール:</p>
              <code className="block text-xs bg-claw-bg rounded-md px-3 py-2 text-claw-text-dim font-mono break-all select-all">
                curl -fsSL https://openclaw.bot/install-cli.sh | bash -s -- --prefix ~/.openclaw
              </code>
            </div>
          </div>
        )}

        {/* Installing */}
        {state.phase === 'installing' && (
          <div className="flex items-center gap-3">
            <Spinner />
            <span className="text-sm text-claw-text-dim">{state.message}</span>
          </div>
        )}

        {/* Error */}
        {state.phase === 'error' && (
          <div className="space-y-3">
            <div className="flex items-center gap-3">
              <ErrorIcon />
              <div>
                <p className="text-sm font-medium text-red-400">インストールエラー</p>
                <p className="text-xs text-claw-text-dim break-all">{state.message}</p>
              </div>
            </div>
            <PrimaryButton onClick={handleRetry}>再試行</PrimaryButton>
          </div>
        )}
      </div>
    </motion.div>
  )
}

// ────────────────────────────────────────────────────────
// Step 3: Gateway Connection
// ────────────────────────────────────────────────────────

function GatewayStep({ onNext }: { onNext: () => void }) {
  const [state, setState] = useState<GatewayState>({ phase: 'idle' })
  const autoAdvanceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Auto-start on mount
  useEffect(() => {
    let cancelled = false

    async function startAndConnect() {
      setState({ phase: 'starting' })

      try {
        const startResult = await window.voiceClaw.setup.startGateway()
        if (cancelled) return
        if (!startResult.ok) {
          setState({ phase: 'error', message: startResult.error || 'Gateway起動に失敗しました' })
          return
        }

        setState({ phase: 'started' })
        // Brief pause to show started state
        await new Promise((r) => setTimeout(r, 500))
        if (cancelled) return

        setState({ phase: 'connecting' })
        const connectResult = await window.voiceClaw.setup.connectGateway()
        if (cancelled) return

        if (connectResult.ok) {
          setState({ phase: 'connected' })
        } else {
          setState({ phase: 'error', message: connectResult.error || '接続に失敗しました' })
        }
      } catch (err) {
        if (!cancelled) {
          setState({ phase: 'error', message: String(err) })
        }
      }
    }

    startAndConnect()
    return () => { cancelled = true }
  }, [])

  // Auto-advance on connected
  useEffect(() => {
    if (state.phase === 'connected') {
      autoAdvanceRef.current = setTimeout(onNext, 1500)
      return () => {
        if (autoAdvanceRef.current) clearTimeout(autoAdvanceRef.current)
      }
    }
  }, [state.phase, onNext])

  const handleRetry = useCallback(() => {
    setState({ phase: 'idle' })
    // Re-trigger the effect by setting idle, then starting
    setTimeout(async () => {
      setState({ phase: 'starting' })
      try {
        const startResult = await window.voiceClaw.setup.startGateway()
        if (!startResult.ok) {
          setState({ phase: 'error', message: startResult.error || 'Gateway起動に失敗しました' })
          return
        }
        setState({ phase: 'connecting' })
        const connectResult = await window.voiceClaw.setup.connectGateway()
        if (connectResult.ok) {
          setState({ phase: 'connected' })
        } else {
          setState({ phase: 'error', message: connectResult.error || '接続に失敗しました' })
        }
      } catch (err) {
        setState({ phase: 'error', message: String(err) })
      }
    }, 100)
  }, [])

  return (
    <motion.div
      key="gateway"
      variants={stepVariants}
      initial="enter"
      animate="center"
      exit="exit"
      transition={transition}
      className="space-y-5 w-full max-w-sm"
    >
      <div className="space-y-1">
        <h2 className="text-lg font-semibold text-claw-text">Gateway接続</h2>
        <p className="text-xs text-claw-text-dim">
          OpenClaw Gatewayを起動して接続します
        </p>
      </div>

      <div className="bg-claw-surface rounded-xl p-4 space-y-3">
        {/* Starting */}
        {(state.phase === 'idle' || state.phase === 'starting') && (
          <div className="flex items-center gap-3">
            <Spinner />
            <span className="text-sm text-claw-text-dim">Gatewayを起動中...</span>
          </div>
        )}

        {/* Started */}
        {state.phase === 'started' && (
          <div className="flex items-center gap-3">
            <CheckIcon />
            <span className="text-sm text-claw-text">Gateway起動完了</span>
          </div>
        )}

        {/* Connecting */}
        {state.phase === 'connecting' && (
          <div className="space-y-2">
            <div className="flex items-center gap-3">
              <CheckIcon />
              <span className="text-sm text-claw-text">Gateway起動完了</span>
            </div>
            <div className="flex items-center gap-3">
              <Spinner />
              <span className="text-sm text-claw-text-dim">接続中...</span>
            </div>
          </div>
        )}

        {/* Connected */}
        {state.phase === 'connected' && (
          <div className="space-y-2">
            <div className="flex items-center gap-3">
              <CheckIcon />
              <span className="text-sm text-claw-text">Gateway起動完了</span>
            </div>
            <div className="flex items-center gap-3">
              <CheckIcon />
              <span className="text-sm font-medium text-green-400">接続完了!</span>
            </div>
            <p className="text-xs text-claw-text-dim">自動的に次へ進みます...</p>
          </div>
        )}

        {/* Error */}
        {state.phase === 'error' && (
          <div className="space-y-3">
            <div className="flex items-center gap-3">
              <ErrorIcon />
              <div>
                <p className="text-sm font-medium text-red-400">接続エラー</p>
                <p className="text-xs text-claw-text-dim break-all">{state.message}</p>
              </div>
            </div>
            <PrimaryButton onClick={handleRetry}>再試行</PrimaryButton>
          </div>
        )}
      </div>
    </motion.div>
  )
}

// ────────────────────────────────────────────────────────
// Step 4: Microphone
// ────────────────────────────────────────────────────────

function MicrophoneStep({ onNext }: { onNext: () => void }) {
  const [state, setState] = useState<MicState>({ phase: 'idle' })

  // Check current permission status on mount
  useEffect(() => {
    let cancelled = false

    async function check() {
      setState({ phase: 'checking' })
      try {
        const status = await window.voiceClaw.mic.checkPermission()
        if (cancelled) return
        if (status === 'granted') {
          setState({ phase: 'granted' })
        } else if (status === 'denied') {
          setState({ phase: 'denied' })
        } else {
          setState({ phase: 'prompt' })
        }
      } catch {
        if (!cancelled) setState({ phase: 'prompt' })
      }
    }

    check()
    return () => { cancelled = true }
  }, [])

  // Auto-advance if already granted
  useEffect(() => {
    if (state.phase === 'granted') {
      const timer = setTimeout(onNext, 1500)
      return () => clearTimeout(timer)
    }
  }, [state.phase, onNext])

  const handleRequest = useCallback(async () => {
    try {
      const granted = await window.voiceClaw.mic.requestPermission()
      setState(granted ? { phase: 'granted' } : { phase: 'denied' })
    } catch {
      setState({ phase: 'denied' })
    }
  }, [])

  return (
    <motion.div
      key="microphone"
      variants={stepVariants}
      initial="enter"
      animate="center"
      exit="exit"
      transition={transition}
      className="space-y-5 w-full max-w-sm"
    >
      <div className="space-y-1">
        <h2 className="text-lg font-semibold text-claw-text">マイクアクセス</h2>
        <p className="text-xs text-claw-text-dim">
          音声入力にはマイクの許可が必要です
        </p>
      </div>

      <div className="bg-claw-surface rounded-xl p-4 space-y-3">
        {/* Checking */}
        {(state.phase === 'idle' || state.phase === 'checking') && (
          <div className="flex items-center gap-3">
            <Spinner />
            <span className="text-sm text-claw-text-dim">マイクの状態を確認中...</span>
          </div>
        )}

        {/* Prompt to request */}
        {state.phase === 'prompt' && (
          <div className="space-y-3">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-claw-accent/15 flex items-center justify-center">
                <svg className="w-5 h-5 text-claw-accent" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 18.75a6 6 0 006-6v-1.5m-6 7.5a6 6 0 01-6-6v-1.5m6 7.5v3.75m-3.75 0h7.5M12 15.75a3 3 0 01-3-3V4.5a3 3 0 116 0v8.25a3 3 0 01-3 3z" />
                </svg>
              </div>
              <p className="text-sm text-claw-text">マイクの使用を許可してください</p>
            </div>
            <PrimaryButton onClick={handleRequest}>マイクを許可</PrimaryButton>
          </div>
        )}

        {/* Granted */}
        {state.phase === 'granted' && (
          <div className="space-y-2">
            <div className="flex items-center gap-3">
              <CheckIcon />
              <span className="text-sm font-medium text-green-400">マイクアクセス許可済み</span>
            </div>
            <p className="text-xs text-claw-text-dim">自動的に次へ進みます...</p>
          </div>
        )}

        {/* Denied */}
        {state.phase === 'denied' && (
          <div className="space-y-3">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-yellow-500/15 flex items-center justify-center">
                <svg className="w-5 h-5 text-yellow-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
                </svg>
              </div>
              <div>
                <p className="text-sm text-claw-text">マイクが拒否されました</p>
                <p className="text-xs text-claw-text-dim">
                  システム環境設定からVoiceClawのマイクアクセスを許可できます
                </p>
              </div>
            </div>
            <PrimaryButton onClick={handleRequest}>再試行</PrimaryButton>
          </div>
        )}
      </div>

      {/* Skip option */}
      {(state.phase === 'prompt' || state.phase === 'denied') && (
        <div className="text-center">
          <SecondaryButton onClick={onNext}>スキップ</SecondaryButton>
        </div>
      )}
    </motion.div>
  )
}

// ────────────────────────────────────────────────────────
// Step 5: Ready
// ────────────────────────────────────────────────────────

function ReadyStep({ onComplete }: { onComplete: () => void }) {
  const features = [
    {
      icon: (
        <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M6.75 7.5l3 2.25-3 2.25m4.5 0h3m-9 8.25h13.5A2.25 2.25 0 0021 18V6a2.25 2.25 0 00-2.25-2.25H5.25A2.25 2.25 0 003 6v12a2.25 2.25 0 002.25 2.25z" />
        </svg>
      ),
      text: 'Option+Space を長押しで音声入力',
    },
    {
      icon: (
        <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M8.625 12a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0H8.25m4.125 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0H12m4.125 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0h-.375M21 12c0 4.556-4.03 8.25-9 8.25a9.764 9.764 0 01-2.555-.337A5.972 5.972 0 015.41 20.97a5.969 5.969 0 01-.474-.065 4.48 4.48 0 00.978-2.025c.09-.457-.133-.901-.467-1.226C3.93 16.178 3 14.189 3 12c0-4.556 4.03-8.25 9-8.25s9 3.694 9 8.25z" />
        </svg>
      ),
      text: '話しかけるだけでAIが応答',
    },
    {
      icon: (
        <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M6.827 6.175A2.31 2.31 0 015.186 7.23c-.38.054-.757.112-1.134.175C2.999 7.58 2.25 8.507 2.25 9.574V18a2.25 2.25 0 002.25 2.25h15A2.25 2.25 0 0021.75 18V9.574c0-1.067-.75-1.994-1.802-2.169a47.865 47.865 0 00-1.134-.175 2.31 2.31 0 01-1.64-1.055l-.822-1.316a2.192 2.192 0 00-1.736-1.039 48.774 48.774 0 00-5.232 0 2.192 2.192 0 00-1.736 1.039l-.821 1.316z" />
          <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 12.75a4.5 4.5 0 11-9 0 4.5 4.5 0 019 0zM18.75 10.5h.008v.008h-.008V10.5z" />
        </svg>
      ),
      text: 'スクリーンショットも自動で取得',
    },
  ]

  return (
    <motion.div
      key="ready"
      variants={stepVariants}
      initial="enter"
      animate="center"
      exit="exit"
      transition={transition}
      className="text-center space-y-6 max-w-sm"
    >
      <div className="w-16 h-16 mx-auto rounded-2xl bg-green-500/10 flex items-center justify-center">
        <svg
          className="w-8 h-8 text-green-400"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={1.5}
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
      </div>

      <div className="space-y-2">
        <h1 className="text-2xl font-bold text-claw-text">セットアップ完了!</h1>
        <p className="text-sm text-claw-text-dim">VoiceClawの準備が整いました</p>
      </div>

      <div className="bg-claw-surface rounded-xl p-4 space-y-3 text-left">
        {features.map((feature, i) => (
          <div key={i} className="flex items-center gap-3">
            <div className="text-claw-accent flex-shrink-0">{feature.icon}</div>
            <span className="text-sm text-claw-text">{feature.text}</span>
          </div>
        ))}
      </div>

      <PrimaryButton onClick={onComplete}>使い始める</PrimaryButton>
    </motion.div>
  )
}

// ────────────────────────────────────────────────────────
// Main: OnboardingFlow
// ────────────────────────────────────────────────────────

const STEPS: Step[] = ['welcome', 'cli', 'gateway', 'microphone', 'ready']

export function OnboardingFlow() {
  const [step, setStep] = useState<Step>('welcome')
  const settings = useSettingsStore()
  const { setView } = useUIStore()

  const currentIndex = STEPS.indexOf(step)

  const goNext = useCallback(() => {
    const idx = STEPS.indexOf(step)
    if (idx < STEPS.length - 1) {
      setStep(STEPS[idx + 1])
    }
  }, [step])

  const handleComplete = useCallback(async () => {
    await settings.updateGateway('localhost', 18789)
    await settings.setOnboarded(true)
    window.voiceClaw.gateway.connect()
    setView('overlay')
  }, [settings, setView])

  return (
    <div className="w-full h-full flex flex-col items-center justify-center p-8">
      <div className="flex-1 flex items-center justify-center w-full">
        <AnimatePresence mode="wait">
          {step === 'welcome' && <WelcomeStep onNext={goNext} />}
          {step === 'cli' && <CLIStep onNext={goNext} />}
          {step === 'gateway' && <GatewayStep onNext={goNext} />}
          {step === 'microphone' && <MicrophoneStep onNext={goNext} />}
          {step === 'ready' && <ReadyStep onComplete={handleComplete} />}
        </AnimatePresence>
      </div>

      {/* Step indicator at bottom */}
      <div className="pt-4">
        <StepIndicator current={currentIndex} total={STEPS.length} />
      </div>
    </div>
  )
}
