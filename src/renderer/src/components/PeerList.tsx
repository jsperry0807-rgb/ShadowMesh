import React from 'react'
import { Peer } from '../types'

interface Props {
  peers: Peer[]
  myName: string
}

const getInitials = (name: string): string => name.charAt(0).toUpperCase()

const getColorClass = (id: string): string => {
  const colors = [
    'bg-red-400',
    'bg-blue-400',
    'bg-green-400',
    'bg-yellow-400',
    'bg-purple-400',
    'bg-pink-400'
  ]
  const index = id.charCodeAt(0) % colors.length
  return colors[index]
}

export const PeerList: React.FC<Props> = ({ peers, myName }) => (
  <div className="space-y-2">
    <h4 className="text-sm font-semibold text-gray-700 flex items-center gap-1">
      <span>👥</span> Participants
    </h4>
    <ul className="space-y-2">
      {/* Self peer */}
      <li className="flex items-center gap-3 p-2 bg-indigo-50 rounded-xl border border-indigo-100">
        <div
          className={`w-8 h-8 rounded-full flex items-center justify-center text-white font-bold ${getColorClass('self')}`}
        >
          {getInitials(myName)}
        </div>
        <div className="flex-1">
          <p className="text-sm font-medium text-gray-800">{myName}</p>
          <p className="text-xs text-indigo-600">you</p>
        </div>
      </li>

      {/* Other peers */}
      {peers.map((peer) => (
        <li
          key={peer.id}
          className="flex items-center gap-3 p-2 bg-gray-50 rounded-xl border border-gray-100"
        >
          <div
            className={`w-8 h-8 rounded-full flex items-center justify-center text-white font-bold ${getColorClass(peer.id)}`}
          >
            {getInitials(peer.name || peer.id)}
          </div>
          <div className="flex-1">
            <p className="text-sm text-gray-700">{peer.name || `${peer.id.substring(0, 8)}...`}</p>
          </div>
        </li>
      ))}
    </ul>
  </div>
)
