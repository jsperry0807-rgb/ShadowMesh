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
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
    <div className="sidebar">
      <h3 className="sidebar-title">🔐 Secure P2P Chat</h3>

      {!isJoined ? (
        <div className="join-section">
          <div style={{ display: 'flex', gap: '8px', marginBottom: '8px' }}>
            <input
              type="text"
              placeholder="Your name"
              value={myName}
              onChange={(e) => onMyNameChange(e.target.value)}
              className="input"
              style={{ flex: 1 }}
            />
            <button
              type="button"
              onClick={() => onMyNameChange(generateRandomName())}
              className="random-name-button"
              title="Generate a random name"
              style={{
                padding: '8px 12px',
                background: '#f0f0f0',
                border: '1px solid #ccc',
                borderRadius: '4px',
                cursor: 'pointer'
              }}
            >
              🎲 Regenerate
            </button>
          </div>

          <input
            type="text"
            placeholder="Room ID"
            value={roomId}
            onChange={(e) => onRoomIdChange(e.target.value)}
            className="input"
            onKeyPress={(e) => e.key === 'Enter' && handleJoin()}
          />
          <input
            type="password"
            placeholder="Room password"
            value={password}
            onChange={(e) => onPasswordChange(e.target.value)}
            className="input"
            onKeyPress={(e) => e.key === 'Enter' && handleJoin()}
          />
          <select
            value={selectedStrategy}
            onChange={(e) => onStrategyChange(e.target.value as Strategy)}
            className="select"
          >
            <option value="mqtt">📡 MQTT (IoT-like)</option>
            <option value="nostr">🐦 Nostr (decentralized relays)</option>
            <option value="torrent">🌊 BitTorrent (public trackers)</option>
            <option value="ipfs">🪐 IPFS (completely decentralized)</option>
          </select>

          <div style={{ marginTop: '12px' }}>
            <label style={{ fontSize: '0.9rem', display: 'block', marginBottom: '4px' }}>
              🕵️ Anonymity network:
            </label>
            <select
              value={anonymityMode}
              onChange={(e) => onAnonymityChange(e.target.value as 'none' | 'tor' | 'i2p')}
              className="select"
              style={{ width: '100%' }}
            >
              <option value="none">🌐 Direct connection</option>
              <option value="tor">🧅 Route via Tor (SOCKS5 proxy)</option>
              <option value="i2p">🕸️ Route via I2P (HTTP proxy)</option>
            </select>
            <p className="note" style={{ marginTop: '4px', fontSize: '0.8rem' }}>
              {anonymityMode === 'tor' && 'Requires Tor running locally (SOCKS5 :9050)'}
              {anonymityMode === 'i2p' && 'Requires I2P running locally (HTTP :4444)'}
              {anonymityMode === 'none' && 'Direct connection (no extra proxy)'}
            </p>
          </div>

          {anonymityMode === 'tor' && (
            <div
              style={{
                marginTop: '12px',
                padding: '8px',
                border: '1px solid #ccc',
                borderRadius: '4px'
              }}
            >
              <p style={{ fontSize: '0.9rem', marginBottom: '8px' }}>
                <strong>Pluggable Transport:</strong> obfs4 (only supported)
              </p>

              <label style={{ display: 'block', marginBottom: '4px' }}>
                <span style={{ fontSize: '0.9rem' }}>Bridge lines (one per line):</span>
                <textarea
                  value={bridgeLines}
                  onChange={(e) => setBridgeLines(e.target.value)}
                  rows={3}
                  style={{ width: '100%', marginTop: '4px', padding: '4px' }}
                  placeholder="obfs4 198.51.100.1:443 0123456789ABCDEF... iat-mode=0"
                />
              </label>

              <div style={{ marginTop: '12px', borderTop: '1px solid #eee', paddingTop: '8px' }}>
                <div
                  style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}
                >
                  <span style={{ fontSize: '0.9rem' }}>Tor Process:</span>
                  {torStatus === null ? (
                    <span>Unknown</span>
                  ) : torStatus ? (
                    <span style={{ color: 'green' }}>✅ Running</span>
                  ) : (
                    <span style={{ color: 'red' }}>❌ Not Running</span>
                  )}
                  <button
                    onClick={checkTorStatus}
                    style={{ padding: '2px 8px', fontSize: '0.8rem' }}
                  >
                    Refresh
                  </button>
                </div>

                <button
                  onClick={handleStartTor}
                  disabled={isTorStarting || torStatus === true}
                  style={{
                    padding: '6px 12px',
                    marginBottom: '8px',
                    background: isTorStarting ? '#ccc' : '#4CAF50',
                    color: 'white',
                    border: 'none',
                    borderRadius: '4px',
                    cursor: isTorStarting || torStatus === true ? 'not-allowed' : 'pointer',
                    width: '100%'
                  }}
                >
                  {isTorStarting
                    ? 'Starting Tor...'
                    : torStatus === true
                      ? 'Tor Running'
                      : '🚀 Start & Join'}
                </button>

                <button
                  onClick={() => testTorConnection()}
                  style={{
                    padding: '4px 8px',
                    fontSize: '0.8rem',
                    background: '#f0f0f0',
                    border: '1px solid #ccc',
                    borderRadius: '4px',
                    cursor: 'pointer',
                    width: '100%'
                  }}
                >
                  🔍 Test Tor Connection (check.torproject.org)
                </button>
              </div>

              <p style={{ fontSize: '0.8rem', marginTop: '8px', color: '#666' }}>
                Get bridges from{' '}
                <a
                  href="https://bridges.torproject.org/options"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  Tor Project
                </a>
              </p>
            </div>
          )}

          <button
            onClick={handleJoin}
            className="join-button"
            disabled={isJoinDisabled || isTorStarting}
            style={{ opacity: isJoinDisabled ? 0.6 : 1 }}
          >
            {isTorStarting ? 'Starting Tor...' : 'Join Room'}
          </button>
          <p className="note">ℹ️ Others join with same Room ID and password</p>
        </div>
      ) : (
        <div className="room-info">
          <p className="room-label">
            Room: <strong>{roomId}</strong>
          </p>
          <p className="peer-count">👥 Peers online: {peers.length}</p>
          <button onClick={onLeave} className="leave-button">
            Leave Room
          </button>
          <PeerList peers={peers} myName={myName} />
        </div>
      )}

      <div className="strategy-info">
        <p>
          🛡️ <strong>Using:</strong> {selectedStrategy.toUpperCase()}
        </p>
        <p className="small-text">
          Server only used for discovery • Messages are P2P & end-to-end encrypted
        </p>
      </div>
    </div>
  )
}
