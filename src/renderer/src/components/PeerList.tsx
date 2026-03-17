import React from 'react'
import { Peer } from '../types'

interface Props {
  peers: Peer[]
  myName: string
}

export const PeerList: React.FC<Props> = ({ peers, myName }) => (
  <div className="peer-list">
    <h4>Participants:</h4>
    <ul className="peer-list-items">
      <li className="self-peer">✅ {myName} (you)</li>
      {peers.map((peer) => (
        <li key={peer.id} className="peer-item">
          👤 {peer.name || peer.id.substring(0, 8)}...
        </li>
      ))}
    </ul>
  </div>
)
