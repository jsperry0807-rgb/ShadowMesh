import React, { useRef, useEffect } from 'react'
import { Message } from '../types'
import { MessageBubble } from './MessageBubble'

interface Props {
  messages: Message[]
}

export const MessageList: React.FC<Props> = ({ messages }) => {
  const messagesEndRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  return (
    <div className="messages-container">
      {messages.map((msg) => (
        <MessageBubble key={msg.id} message={msg} />
      ))}
      <div ref={messagesEndRef} />
    </div>
  )
}
