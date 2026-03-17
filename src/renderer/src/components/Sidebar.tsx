import React, { useState, useEffect } from 'react'
import toast from 'react-hot-toast'
import { Peer, Strategy } from '../types'
import { PeerList } from './PeerList'

interface Props {
  isJoined: boolean
  roomId: string
  myName: string
  password: string
  selectedStrategy: Strategy
  peers: Peer[]
  anonymityMode: 'none' | 'tor' | 'i2p'
  onRoomIdChange: (id: string) => void
  onMyNameChange: (name: string) => void
  onPasswordChange: (pwd: string) => void
  onStrategyChange: (s: Strategy) => void
  onAnonymityChange: (mode: 'none' | 'tor' | 'i2p') => void
  onJoin: () => void
  onLeave: () => void
}

export const Sidebar: React.FC<Props> = ({
  isJoined,
  roomId,
  myName,
  password,
  selectedStrategy,
  peers,
  anonymityMode,
  onRoomIdChange,
  onMyNameChange,
  onPasswordChange,
  onStrategyChange,
  onAnonymityChange,
  onJoin,
  onLeave
}) => {
  const [bridgeLines, setBridgeLines] = useState('')
  const [isTorStarting, setIsTorStarting] = useState(false)
  const [torStatus, setTorStatus] = useState<boolean | null>(null)

  const generateRandomName = (): string => {
    const adjectives = ['Happy', 'Clever', 'Brave', 'Calm', 'Eager', 'Kind', 'Witty', 'Bright']
    const nouns = ['Panda', 'Tiger', 'Eagle', 'Dolphin', 'Wolf', 'Fox', 'Lion', 'Hawk']
    const randomAdj = adjectives[Math.floor(Math.random() * adjectives.length)]
    const randomNoun = nouns[Math.floor(Math.random() * nouns.length)]
    const randomNum = Math.floor(Math.random() * 100)
    return `${randomAdj}${randomNoun}${randomNum}`
  }

  const checkTorStatus = async (): Promise<void> => {
    if (!window.api || typeof window.api.getTorStatus !== 'function') {
      console.warn('Tor status API not available')
      setTorStatus(false)
      return
    }
    try {
      const status = await window.api.getTorStatus()
      setTorStatus(status)
    } catch (error) {
      console.error('Error checking Tor status:', error)
      setTorStatus(false)
    }
  }

  const stopTor = async (): Promise<void> => {
    if (!window.api || typeof window.api.stopTor !== 'function') return
    try {
      await window.api.stopTor()
      setTorStatus(false)
    } catch (error) {
      console.error('Error stopping Tor:', error)
    }
  }

  const testTorConnection = async (retries = 3): Promise<void> => {
    for (let i = 0; i < retries; i++) {
      try {
        const data = await window.api.testTor()
        if (data.IsTor) {
          toast.success(`✅ Tor is working! Your IP appears as ${data.IP}`)
        } else {
          toast.error(`❌ Not using Tor. Your IP: ${data.IP}`)
        }
        return
      } catch (error) {
        if (i < retries - 1) {
          console.log(`Tor test attempt ${i + 1} failed, retrying in 5s...`)
          await new Promise((resolve) => setTimeout(resolve, 5000))
        } else {
          toast.error('Error testing Tor connection: ' + error)
        }
      }
    }
  }

  useEffect(() => {
    if (anonymityMode === 'tor') {
      checkTorStatus()
    } else {
      if (torStatus === true) {
        stopTor()
      } else {
        setTorStatus(null)
      }
    }
  }, [anonymityMode])

  const handleStartTor = async (): Promise<void> => {
    if (!window.api || typeof window.api.startTor !== 'function') {
      toast.error('Tor integration not available. Please check the preload script.')
      return
    }

    const bridges = bridgeLines
      .split('\n')
      .map((l) => l.trim())
      .filter(Boolean)

    if (bridges.length === 0) {
      toast.error('Please enter at least one bridge line for Tor connection.')
      return
    }

    if (torStatus === true) {
      onJoin()
      return
    }

    setIsTorStarting(true)
    try {
      const started = await window.api.startTor(bridges, 'obfs4')
      if (!started) {
        toast.error('Failed to start Tor. Check the console for details.')
        setIsTorStarting(false)
        return
      }

      setTorStatus(true)
      toast.success('Tor is now ready. Joining room...')
      onJoin()
    } catch (error) {
      console.error('Error starting Tor or waiting for activation:', error)
      toast.error('Tor could not be started or activated. Please check your configuration.')
    } finally {
      setIsTorStarting(false)
    }
  }

  const handleJoin = async (): Promise<void> => {
    if (anonymityMode === 'tor') {
      if (torStatus !== true) {
        await handleStartTor()
      } else {
        onJoin()
      }
    } else {
      onJoin()
    }
  }

  const isJoinDisabled = anonymityMode === 'tor' && torStatus !== true && !isTorStarting

  return (
    <aside className="w-full md:w-80 bg-white border-b md:border-r border-gray-200 shadow-sm md:shadow-lg p-5 overflow-y-auto flex flex-col max-h-[40vh] md:max-h-screen">
      <h3 className="text-xl font-bold mb-5 flex items-center gap-2 text-indigo-700">
        <span>🔐</span> Secure P2P Chat
      </h3>

      {!isJoined ? (
        <div className="space-y-4">
          {/* Name input with random generator */}
          <div className="flex gap-2">
            <input
              type="text"
              placeholder="Your name"
              value={myName}
              onChange={(e) => onMyNameChange(e.target.value)}
              className="flex-1 px-4 py-2 border border-gray-300 rounded-xl shadow-sm focus:outline-none focus:ring-2 focus:ring-indigo-400 focus:border-indigo-400"
            />
            <button
              type="button"
              onClick={() => onMyNameChange(generateRandomName())}
              className="px-3 py-2 bg-gray-100 border border-gray-300 rounded-xl hover:bg-gray-200 focus:outline-none focus:ring-2 focus:ring-indigo-400"
              title="Generate a random name"
            >
              🎲
            </button>
          </div>

          <input
            type="text"
            placeholder="Room ID"
            value={roomId}
            onChange={(e) => onRoomIdChange(e.target.value)}
            onKeyPress={(e) => e.key === 'Enter' && handleJoin()}
            className="w-full px-4 py-2 border border-gray-300 rounded-xl shadow-sm focus:outline-none focus:ring-2 focus:ring-indigo-400 focus:border-indigo-400"
          />

          <input
            type="password"
            placeholder="Room password"
            value={password}
            onChange={(e) => onPasswordChange(e.target.value)}
            onKeyPress={(e) => e.key === 'Enter' && handleJoin()}
            className="w-full px-4 py-2 border border-gray-300 rounded-xl shadow-sm focus:outline-none focus:ring-2 focus:ring-indigo-400 focus:border-indigo-400"
          />

          <select
            value={selectedStrategy}
            onChange={(e) => onStrategyChange(e.target.value as Strategy)}
            className="w-full px-4 py-2 border border-gray-300 rounded-xl shadow-sm focus:outline-none focus:ring-2 focus:ring-indigo-400 focus:border-indigo-400 bg-white"
          >
            <option value="mqtt">📡 MQTT (IoT-like)</option>
            <option value="nostr">🐦 Nostr (decentralized relays)</option>
            <option value="torrent">🌊 BitTorrent (public trackers)</option>
            <option value="ipfs">🪐 IPFS (completely decentralized)</option>
          </select>

          {/* Anonymity selector */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              🕵️ Anonymity network
            </label>
            <select
              value={anonymityMode}
              onChange={(e) => onAnonymityChange(e.target.value as 'none' | 'tor' | 'i2p')}
              className="w-full px-4 py-2 border border-gray-300 rounded-xl shadow-sm focus:outline-none focus:ring-2 focus:ring-indigo-400 focus:border-indigo-400 bg-white"
            >
              <option value="none">🌐 Direct connection</option>
              <option value="tor">🧅 Route via Tor (SOCKS5 proxy)</option>
              <option value="i2p">🕸️ Route via I2P (HTTP proxy)</option>
            </select>
            <p className="mt-1 text-xs text-gray-500">
              {anonymityMode === 'tor' && 'Requires Tor running locally (SOCKS5 :9050)'}
              {anonymityMode === 'i2p' && 'Requires I2P running locally (HTTP :4444)'}
              {anonymityMode === 'none' && 'Direct connection (no extra proxy)'}
            </p>
          </div>

          {/* Tor advanced settings (only when Tor selected) */}
          {anonymityMode === 'tor' && (
            <div className="p-4 border border-gray-200 rounded-xl bg-gray-50 space-y-3">
              <p className="text-sm font-medium text-gray-700">
                Pluggable Transport: <span className="font-mono">obfs4</span>
              </p>

              <label className="block">
                <span className="text-sm text-gray-600">Bridge lines (one per line):</span>
                <textarea
                  value={bridgeLines}
                  onChange={(e) => setBridgeLines(e.target.value)}
                  rows={3}
                  className="mt-1 w-full px-3 py-2 border border-gray-300 rounded-lg shadow-sm focus:outline-none focus:ring-2 focus:ring-indigo-400 focus:border-indigo-400 text-sm"
                  placeholder="obfs4 198.51.100.1:443 0123456789ABCDEF... iat-mode=0"
                />
              </label>

              <div className="pt-2 border-t border-gray-200">
                <div className="flex items-center justify-between text-sm">
                  <span>Tor Process:</span>
                  <div className="flex items-center gap-2">
                    {torStatus === null ? (
                      <span className="text-gray-500">Unknown</span>
                    ) : torStatus ? (
                      <span className="text-green-600 font-medium flex items-center gap-1">
                        <span className="w-2 h-2 bg-green-500 rounded-full"></span> Running
                      </span>
                    ) : (
                      <span className="text-red-600 font-medium flex items-center gap-1">
                        <span className="w-2 h-2 bg-red-500 rounded-full"></span> Not Running
                      </span>
                    )}
                    <button
                      onClick={checkTorStatus}
                      className="px-2 py-1 text-xs bg-gray-200 rounded-md hover:bg-gray-300"
                    >
                      Refresh
                    </button>
                  </div>
                </div>

                <button
                  onClick={handleStartTor}
                  disabled={isTorStarting || torStatus === true}
                  className={`w-full mt-3 px-4 py-2 rounded-xl text-white font-medium transition ${
                    isTorStarting || torStatus === true
                      ? 'bg-gray-400 cursor-not-allowed'
                      : 'bg-green-600 hover:bg-green-700'
                  }`}
                >
                  {isTorStarting
                    ? 'Starting Tor...'
                    : torStatus === true
                      ? 'Tor Running'
                      : '🚀 Start & Join'}
                </button>

                <button
                  onClick={() => testTorConnection()}
                  className="w-full mt-2 px-4 py-2 text-sm bg-gray-200 hover:bg-gray-300 rounded-xl"
                >
                  🔍 Test Tor Connection
                </button>
              </div>

              <p className="text-xs text-gray-500">
                Get bridges from{' '}
                <a
                  href="https://bridges.torproject.org/options"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-indigo-600 hover:underline"
                >
                  Tor Project
                </a>
              </p>
            </div>
          )}

          <button
            onClick={handleJoin}
            disabled={isJoinDisabled || isTorStarting}
            className={`w-full px-4 py-3 rounded-xl text-white font-medium transition ${
              isJoinDisabled || isTorStarting
                ? 'bg-indigo-300 cursor-not-allowed'
                : 'bg-indigo-600 hover:bg-indigo-700 shadow-md'
            }`}
          >
            {isTorStarting ? 'Starting Tor...' : 'Join Room'}
          </button>
          <p className="text-xs text-gray-500 text-center">
            ℹ️ Others join with same Room ID and password
          </p>
        </div>
      ) : (
        <div className="space-y-5">
          <div className="p-4 bg-indigo-50 rounded-xl border border-indigo-100">
            <p className="text-sm flex items-center gap-2">
              <span className="font-medium text-indigo-700">Room:</span>
              <span className="font-mono text-indigo-900 bg-white px-2 py-1 rounded-md text-xs">
                {roomId}
              </span>
            </p>
            <p className="text-sm mt-2 flex items-center gap-1 text-gray-600">
              <span>👥</span> Peers online: <span className="font-bold">{peers.length}</span>
            </p>
          </div>

          <PeerList peers={peers} myName={myName} />

          <button
            onClick={onLeave}
            className="w-full px-4 py-3 bg-red-500 text-white rounded-xl hover:bg-red-600 transition shadow-md"
          >
            Leave Room
          </button>
        </div>
      )}

      {/* Strategy info footer */}
      <div className="mt-6 pt-4 border-t border-gray-200 text-xs text-gray-500">
        <p className="flex items-center gap-1">
          <span>🛡️</span> <strong>Using:</strong> {selectedStrategy.toUpperCase()}
        </p>
        <p className="mt-1 leading-relaxed">
          Server only used for discovery • Messages are P2P & end-to-end encrypted
        </p>
      </div>
    </aside>
  )
}
