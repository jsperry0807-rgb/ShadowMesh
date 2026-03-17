import React from 'react'
import { Message } from '../types'

interface Props {
  message: Message
}

export const MessageBubble: React.FC<Props> = ({ message }) => {
  const { sender, text, timestamp, isSelf } = message

  // Determine the message class based on type
  let messageClass = 'message'
  if (sender === 'system') {
    messageClass += ' system-message'
  } else if (isSelf) {
    messageClass += ' self-message'
  } else {
    messageClass += ' peer-message'
  }

  return (
    <div className={messageClass}>
      {sender !== 'system' && <span className="message-sender">{sender}:</span>}
      <span className="message-text">{text}</span>
      <span className="message-time">{new Date(timestamp).toLocaleTimeString()}</span>
    </div>
  )
}
