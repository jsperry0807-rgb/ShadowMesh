import React, { useState, KeyboardEvent } from 'react'

interface Props {
  onSend: (text: string) => void
}

export const MessageInput: React.FC<Props> = ({ onSend }) => {
  const [input, setInput] = useState('')

  const handleKeyPress = (e: KeyboardEvent): void => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  const handleSend = (): void => {
    if (input.trim()) {
      onSend(input)
      setInput('')
    }
  }

  return (
    <div className="input-area">
      <input
        type="text"
        placeholder="Type a message..."
        value={input}
        onChange={(e) => setInput(e.target.value)}
        onKeyPress={handleKeyPress}
        className="chat-input"
      />
      <button onClick={handleSend} className="send-button">
        Send
      </button>
    </div>
  )
}
