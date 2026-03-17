import React from 'react'
import { Message } from '../types'

interface Props {
  message: Message
}

export const MessageBubble: React.FC<Props> = ({ message }) => {
  const { sender, text, timestamp, isSelf } = message

  if (sender === 'system') {
    return (
      <div className="flex justify-center my-3">
        <div className="bg-gray-200 text-gray-700 text-xs px-4 py-1.5 rounded-full shadow-sm">
          {text}
        </div>
      </div>
    )
  }

  const isOwn = isSelf
  return (
    <div className={`flex ${isOwn ? 'justify-end' : 'justify-start'} mb-3`}>
      <div
        className={`
          max-w-xs md:max-w-md lg:max-w-lg xl:max-w-xl 
          rounded-2xl px-4 py-2 shadow-sm
          ${
            isOwn
              ? 'bg-indigo-600 text-white rounded-br-none'
              : 'bg-white border border-gray-200 text-gray-800 rounded-bl-none'
          }
        `}
      >
        {!isOwn && <p className="text-xs font-semibold text-indigo-600 mb-1">{sender}</p>}
        <p className="text-sm break-words leading-relaxed">{text}</p>
        <p className={`text-xs text-right mt-1 ${isOwn ? 'text-indigo-200' : 'text-gray-400'}`}>
          {new Date(timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
        </p>
      </div>
    </div>
  )
}
