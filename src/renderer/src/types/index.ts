// types.ts
export interface Message {
  id: string
  text: string
  sender: string
  timestamp: number
  isSelf: boolean
}

export interface Peer {
  id: string
  name?: string
}

export type Strategy = 'mqtt' | 'nostr' | 'torrent' | 'ipfs'
