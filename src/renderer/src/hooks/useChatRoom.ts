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

  console.debug('[useChatRoom] Hook initialized, default myName =', myName)

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
    console.debug('[useChatRoom] Added system message:', text)
  }, [])

  const sendName = useCallback(
    (targetPeerId?: string) => {
      if (roomRef.current?.sendName) {
        console.debug('[useChatRoom] Sending name', myName, 'to peer', targetPeerId || 'all')
        roomRef.current.sendName(myName, targetPeerId || null)
      } else {
        console.debug('[useChatRoom] sendName not available (room not ready)')
      }
    },
    [myName]
  )

  const joinRoom = useCallback(() => {
    console.debug('[useChatRoom] joinRoom called with:', {
      roomId,
      selectedStrategy,
      anonymityMode,
      passwordProvided: !!password
    })

    if (!roomId.trim()) {
      console.debug('[useChatRoom] joinRoom aborted: roomId empty')
      return
    }
    if (!password.trim()) {
      console.debug('[useChatRoom] joinRoom aborted: no password')
      toast.error('Please enter a room password.')
      return
    }

    try {
      // Use Record<string, unknown> instead of any
      const config: Record<string, unknown> = {
        appId: 'your-secret-chat-app-2026',
        password: password,
        relays: [
          'wss://relay.nostr.band',
          'wss://nos.lol',
          'wss://relay.primal.net',
          'wss://relay.snort.social',
          'wss://offchain.pub'
        ]
      }
      console.debug('[useChatRoom] Base config:', {
        appId: config.appId,
        hasPassword: !!config.password
      })

      const isNode = typeof process !== 'undefined' && process.versions && process.versions.node
      console.debug('[useChatRoom] Running in Node environment?', isNode)

      if (anonymityMode === 'tor') {
        if (isNode) {
          try {
            // eslint-disable-next-line @typescript-eslint/no-require-imports
            const { SocksProxyAgent } = require('socks-proxy-agent')
            config.fetchOptions = { agent: new SocksProxyAgent('socks5://127.0.0.1:9050') }
            console.debug('[useChatRoom] Tor SOCKS proxy configured')
            toast.success('Tor routing enabled (SOCKS5 :9050)', { icon: '🧅' })
          } catch (err) {
            console.warn('[useChatRoom] socks-proxy-agent not available, Tor routing disabled', err)
            toast.error('Tor routing unavailable (install socks-proxy-agent)', { icon: '⚠️' })
          }
        } else {
          console.debug('[useChatRoom] Not in Node, Tor requires browser proxy')
          toast('Tor routing requires browser/system proxy set to SOCKS5 :9050', { icon: '⚠️' })
        }
      } else if (anonymityMode === 'i2p') {
        if (isNode) {
          try {
            // eslint-disable-next-line @typescript-eslint/no-require-imports
            const { HttpsProxyAgent } = require('https-proxy-agent')
            config.fetchOptions = { agent: new HttpsProxyAgent('http://127.0.0.1:4444') }
            console.debug('[useChatRoom] I2P HTTP proxy configured')
            toast.success('🕸️ I2P routing enabled (HTTP :4444)')
          } catch (err) {
            console.warn('[useChatRoom] https-proxy-agent not available, I2P routing disabled', err)
            toast.error('I2P routing unavailable (install https-proxy-agent)', { icon: '⚠️' })
          }
        } else {
          console.debug('[useChatRoom] Not in Node, I2P requires browser proxy')
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
      console.debug('[useChatRoom] Using joinRoomFn for strategy:', selectedStrategy)

      const room = joinRoomFn(config, roomId) as ChatRoom
      roomRef.current = room
      console.debug('[useChatRoom] Room object created, setting up event handlers')

      room.onPeerJoin((peerId: string) => {
        console.debug('[useChatRoom] Peer joined:', peerId)
        setPeers((prev) => [...prev, { id: peerId }])
        setTimeout(() => sendName(peerId), 500)
      })

      room.onPeerLeave((peerId: string) => {
        console.debug('[useChatRoom] Peer left:', peerId)
        setPeers((prev) => prev.filter((p) => p.id !== peerId))
        addSystemMessage(`Peer ${peerId} left`)
      })

      const [sendMessageAction, getMessage] = room.makeAction('chat')
      getMessage((data: DataPayload, peerId: string) => {
        const payload = data as ChatPayload
        console.debug('[useChatRoom] Received message from', peerId, 'payload:', {
          textLength: payload.text?.length,
          hasName: !!payload.name
        })
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
        console.debug('[useChatRoom] Received name from peer', peerId, ':', name)
        setPeers((prev) => prev.map((p) => (p.id === peerId ? { ...p, name } : p)))
        addSystemMessage(`${name || peerId} joined`)
      })

      roomRef.current.sendMessage = sendMessageAction
      roomRef.current.sendName = sendNameAction

      console.debug('[useChatRoom] Sending initial name to all peers')
      setTimeout(() => sendNameAction(myName, null), 1000)

      setIsJoined(true)
      addSystemMessage(
        `You joined "${roomId}" as ${myName} using ${selectedStrategy.toUpperCase()}`
      )
      console.debug('[useChatRoom] Successfully joined room')
    } catch (error) {
      console.error('[useChatRoom] Failed to join room:', error)
      toast.error('Failed to join room. Check console.')
    }
  }, [roomId, selectedStrategy, myName, password, anonymityMode, addSystemMessage, sendName])

  const leaveRoom = useCallback(() => {
    console.debug('[useChatRoom] leaveRoom called')
    if (roomRef.current) {
      roomRef.current.leave()
      roomRef.current = null
      setPeers([])
      setIsJoined(false)
      addSystemMessage('Left the room')
      console.debug('[useChatRoom] Room left, state reset')
    } else {
      console.debug('[useChatRoom] No active room to leave')
    }
  }, [addSystemMessage])

  const sendMessage = useCallback(
    (text: string) => {
      console.debug('[useChatRoom] sendMessage called, text length:', text.length)
      if (!text.trim() || !roomRef.current?.sendMessage) {
        console.debug('[useChatRoom] sendMessage aborted: empty text or no sendMessage function')
        return
      }

      const messageData: ChatPayload = {
        text,
        name: myName,
        timestamp: Date.now()
      }

      console.debug('[useChatRoom] Sending message to all peers')
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
