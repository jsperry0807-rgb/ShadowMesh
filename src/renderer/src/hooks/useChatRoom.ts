import { useState, useRef, useCallback } from 'react'
import toast from 'react-hot-toast'
import { DataPayload } from 'trystero'
import { joinRoom as joinRoomMqtt } from 'trystero/mqtt'
import { joinRoom as joinRoomNostr } from 'trystero/nostr'
import { joinRoom as joinRoomTorrent } from 'trystero/torrent'
import { joinRoom as joinRoomIpfs } from 'trystero/ipfs'
import { Message, Peer, Strategy } from '../types'

interface ChatPayload {
  text?: string
  name?: string
  timestamp?: number
}

interface ChatRoom extends ReturnType<typeof joinRoomMqtt> {
  sendMessage?: (data: DataPayload, targetPeerId?: string | null) => void
  sendName?: (data: DataPayload, targetPeerId?: string | null) => void
}

interface UseChatRoomReturn {
  messages: Message[]
  peers: Peer[]
  isJoined: boolean
  roomId: string
  myName: string
  password: string
  selectedStrategy: Strategy
  anonymityMode: 'none' | 'tor' | 'i2p'
  setRoomId: (id: string) => void
  setMyName: (name: string) => void
  setPassword: (pwd: string) => void
  setSelectedStrategy: (strategy: Strategy) => void
  setAnonymityMode: (mode: 'none' | 'tor' | 'i2p') => void
  joinRoom: () => void
  leaveRoom: () => void
  sendMessage: (text: string) => void
}

export const useChatRoom = (): UseChatRoomReturn => {
  const [messages, setMessages] = useState<Message[]>([])
  const [peers, setPeers] = useState<Peer[]>([])
  const [isJoined, setIsJoined] = useState(false)
  const [roomId, setRoomId] = useState('default-room')
  const [myName, setMyName] = useState(() => `User-${Math.floor(Math.random() * 1000)}`)
  const [password, setPassword] = useState('')
  const [selectedStrategy, setSelectedStrategy] = useState<Strategy>('mqtt')
  const [anonymityMode, setAnonymityMode] = useState<'none' | 'tor' | 'i2p'>('none')

  const roomRef = useRef<ChatRoom | null>(null)

  // Add a system message to the chat (e.g., peer joined/left, self join/left)
  const addSystemMessage = useCallback((text: string) => {
    const systemMsg: Message = {
      id: `system-${Date.now()}-${Math.random()}`,
      text: `🔷 ${text}`,
      sender: 'system',
      timestamp: Date.now(),
      isSelf: false
    }
    setMessages((prev) => [...prev, systemMsg])
  }, [])

  const sendName = useCallback(
    (targetPeerId?: string) => {
      if (roomRef.current?.sendName) {
        roomRef.current.sendName(myName, targetPeerId || null)
      }
    },
    [myName]
  )

  const joinRoom = useCallback(() => {
    if (!roomId.trim()) return
    if (!password.trim()) {
      toast.error('Please enter a room password.')
      return
    }

    try {
      // Use Record<string, unknown> instead of any
      const config: Record<string, unknown> = {
        appId: 'your-secret-chat-app-2026',
        password: password
      }

      const isNode = typeof process !== 'undefined' && process.versions && process.versions.node

      if (anonymityMode === 'tor') {
        if (isNode) {
          try {
            // eslint-disable-next-line @typescript-eslint/no-require-imports
            const { SocksProxyAgent } = require('socks-proxy-agent')
            config.fetchOptions = { agent: new SocksProxyAgent('socks5://127.0.0.1:9050') }
            toast.success('Tor routing enabled (SOCKS5 :9050)', { icon: '🧅' })
          } catch {
            console.warn('socks-proxy-agent not available, Tor routing disabled')
            toast.error('Tor routing unavailable (install socks-proxy-agent)', { icon: '⚠️' })
          }
        } else {
          toast('Tor routing requires browser/system proxy set to SOCKS5 :9050', { icon: '⚠️' })
        }
      } else if (anonymityMode === 'i2p') {
        if (isNode) {
          try {
            // eslint-disable-next-line @typescript-eslint/no-require-imports
            const { HttpsProxyAgent } = require('https-proxy-agent')
            config.fetchOptions = { agent: new HttpsProxyAgent('http://127.0.0.1:4444') }
            toast.success('🕸️ I2P routing enabled (HTTP :4444)')
          } catch {
            console.warn('https-proxy-agent not available, I2P routing disabled')
            toast.error('I2P routing unavailable (install https-proxy-agent)', { icon: '⚠️' })
          }
        } else {
          toast('I2P routing requires browser/system proxy set to HTTP :4444', { icon: '⚠️' })
        }
      }

      let joinRoomFn
      switch (selectedStrategy) {
        case 'mqtt':
          joinRoomFn = joinRoomMqtt
          break
        case 'nostr':
          joinRoomFn = joinRoomNostr
          break
        case 'torrent':
          joinRoomFn = joinRoomTorrent
          break
        case 'ipfs':
          joinRoomFn = joinRoomIpfs
          break
        default:
          joinRoomFn = joinRoomMqtt
      }

      const room = joinRoomFn(config, roomId) as ChatRoom
      roomRef.current = room

      room.onPeerJoin((peerId: string) => {
        setPeers((prev) => [...prev, { id: peerId }])
        setTimeout(() => sendName(peerId), 500)
      })

      room.onPeerLeave((peerId: string) => {
        setPeers((prev) => prev.filter((p) => p.id !== peerId))
        addSystemMessage(`Peer ${peerId} left`)
      })

      const [sendMessageAction, getMessage] = room.makeAction('chat')
      getMessage((data: DataPayload, peerId: string) => {
        const payload = data as ChatPayload
        const newMessage: Message = {
          id: `${peerId}-${Date.now()}-${Math.random()}`,
          text: payload.text || '',
          sender: payload.name || peerId,
          timestamp: payload.timestamp || Date.now(),
          isSelf: false
        }
        setMessages((prev) => [...prev, newMessage])
      })

      const [sendNameAction, getName] = room.makeAction('name')
      getName((data: DataPayload, peerId: string) => {
        const name = typeof data === 'string' ? data : String(data)
        setPeers((prev) => prev.map((p) => (p.id === peerId ? { ...p, name } : p)))
        addSystemMessage(`${name || peerId} joined`)
      })

      roomRef.current.sendMessage = sendMessageAction
      roomRef.current.sendName = sendNameAction

      setTimeout(() => sendNameAction(myName, null), 1000)

      setIsJoined(true)
      addSystemMessage(
        `You joined "${roomId}" as ${myName} using ${selectedStrategy.toUpperCase()}`
      )
    } catch (error) {
      console.error('Failed to join room:', error)
      toast.error('Failed to join room. Check console.')
    }
  }, [roomId, selectedStrategy, myName, password, anonymityMode, addSystemMessage, sendName])

  const leaveRoom = useCallback(() => {
    if (roomRef.current) {
      roomRef.current.leave()
      roomRef.current = null
      setPeers([])
      setIsJoined(false)
      addSystemMessage('Left the room')
    }
  }, [addSystemMessage])

  const sendMessage = useCallback(
    (text: string) => {
      if (!text.trim() || !roomRef.current?.sendMessage) return

      const messageData: ChatPayload = {
        text,
        name: myName,
        timestamp: Date.now()
      }

      roomRef.current.sendMessage(messageData as DataPayload, null)

      const newMessage: Message = {
        id: `self-${Date.now()}-${Math.random()}`,
        text,
        sender: myName,
        timestamp: Date.now(),
        isSelf: true
      }
      setMessages((prev) => [...prev, newMessage])
    },
    [myName]
  )

  return {
    messages,
    peers,
    isJoined,
    roomId,
    myName,
    password,
    selectedStrategy,
    anonymityMode,
    setRoomId,
    setMyName,
    setPassword,
    setSelectedStrategy,
    setAnonymityMode,
    joinRoom,
    leaveRoom,
    sendMessage
  }
}
