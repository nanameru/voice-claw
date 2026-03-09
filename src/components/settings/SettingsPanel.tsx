import { motion } from 'framer-motion'
import { useState, useEffect } from 'react'
import { useSettingsStore } from '../../stores/settings'
import { useUIStore } from '../../stores/ui'
import { useGatewayStore } from '../../stores/gateway'

export function SettingsPanel() {
  const settings = useSettingsStore()
  const { setView } = useUIStore()
  const { status } = useGatewayStore()

  const [host, setHost] = useState(settings.gatewayHost)
  const [port, setPort] = useState(String(settings.gatewayPort))
  const [shortcut, setShortcut] = useState(settings.shortcut)
  const [engine, setEngine] = useState(settings.audioEngine)
  const [whisperKey, setWhisperKey] = useState(settings.whisperApiKey)
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([])
  const [selectedDevice, setSelectedDevice] = useState(settings.audioDeviceId || '')

  useEffect(() => {
    navigator.mediaDevices.enumerateDevices().then((allDevices) => {
      setDevices(allDevices.filter((d) => d.kind === 'audioinput'))
    })
  }, [])

  const handleSaveGateway = async () => {
    await settings.updateGateway(host, parseInt(port, 10))
    window.voiceClaw.gateway.connect()
  }

  const handleSaveShortcut = async () => {
    const success = await settings.updateShortcut(shortcut)
    if (!success) {
      alert('Failed to register shortcut. It may conflict with another app.')
    }
  }

  const handleSaveAudio = async () => {
    await settings.updateAudioEngine(engine)
    if (selectedDevice) {
      await settings.updateAudioDevice(selectedDevice)
    }
    if (engine === 'whisper') {
      await settings.updateWhisperApiKey(whisperKey)
    }
  }

  const inputClass =
    'w-full bg-claw-bg border border-claw-border rounded-md px-3 py-2 text-sm text-claw-text focus:outline-none focus:border-claw-accent'
  const labelClass = 'text-xs text-claw-text-dim font-medium uppercase tracking-wide'
  const sectionClass = 'space-y-3'

  return (
    <motion.div
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: 20 }}
      className="w-full h-full flex flex-col p-4 overflow-y-auto"
    >
      {/* Header - draggable region */}
      <div className="flex items-center justify-between mb-6" style={{ WebkitAppRegion: 'drag' } as React.CSSProperties}>
        <h2 className="text-lg font-semibold text-claw-text">Settings</h2>
        <button
          onClick={() => setView('overlay')}
          className="text-xs text-claw-text-dim hover:text-claw-text transition-colors"
          style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
        >
          Back
        </button>
      </div>

      <div className="space-y-6">
        {/* Gateway */}
        <div className={sectionClass}>
          <div className="flex items-center justify-between">
            <label className={labelClass}>Gateway Connection</label>
            <div
              className={`w-2 h-2 rounded-full ${
                status === 'connected' ? 'bg-claw-success' : 'bg-claw-error'
              }`}
            />
          </div>
          <div className="flex gap-2">
            <input
              className={`${inputClass} flex-1`}
              value={host}
              onChange={(e) => setHost(e.target.value)}
              placeholder="localhost"
            />
            <input
              className={`${inputClass} w-24`}
              value={port}
              onChange={(e) => setPort(e.target.value)}
              placeholder="18789"
            />
          </div>
          <button
            onClick={handleSaveGateway}
            className="text-xs px-3 py-1.5 bg-claw-accent/20 hover:bg-claw-accent/30 text-claw-accent rounded transition-colors"
          >
            Save & Reconnect
          </button>
        </div>

        {/* Shortcut */}
        <div className={sectionClass}>
          <label className={labelClass}>Global Shortcut</label>
          <input
            className={inputClass}
            value={shortcut}
            onChange={(e) => setShortcut(e.target.value)}
            placeholder="Alt+Space"
          />
          <button
            onClick={handleSaveShortcut}
            className="text-xs px-3 py-1.5 bg-claw-accent/20 hover:bg-claw-accent/30 text-claw-accent rounded transition-colors"
          >
            Update Shortcut
          </button>
        </div>

        {/* Audio */}
        <div className={sectionClass}>
          <label className={labelClass}>Audio Input</label>
          <select
            className={inputClass}
            value={selectedDevice}
            onChange={(e) => setSelectedDevice(e.target.value)}
          >
            <option value="">Default</option>
            {devices.map((d) => (
              <option key={d.deviceId} value={d.deviceId}>
                {d.label || `Microphone ${d.deviceId.slice(0, 8)}`}
              </option>
            ))}
          </select>

          <label className={labelClass}>Recognition Engine</label>
          <select
            className={inputClass}
            value={engine}
            onChange={(e) => setEngine(e.target.value as 'webspeech' | 'whisper')}
          >
            <option value="webspeech">Web Speech API</option>
            <option value="whisper">Whisper API</option>
          </select>

          {engine === 'whisper' && (
            <input
              className={inputClass}
              type="password"
              value={whisperKey}
              onChange={(e) => setWhisperKey(e.target.value)}
              placeholder="OpenAI API Key for Whisper"
            />
          )}

          <button
            onClick={handleSaveAudio}
            className="text-xs px-3 py-1.5 bg-claw-accent/20 hover:bg-claw-accent/30 text-claw-accent rounded transition-colors"
          >
            Save Audio Settings
          </button>
        </div>
      </div>
    </motion.div>
  )
}
