import React from 'react'
import { useChatRoom } from '../hooks/useChatRoom'
import { Sidebar } from '../components/Sidebar'
import { MessageList } from '../components/MessageList'
import { MessageInput } from '../components/MessageInput'
import '../assets/chat.css'

export const Chat: React.FC = () => {
  const {
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
    joinRoom,
    leaveRoom,
    sendMessage,
    setAnonymityMode
  } = useChatRoom()

  return (
    <div className="container">
      <Sidebar
        isJoined={isJoined}
        roomId={roomId}
        myName={myName}
        password={password}
        selectedStrategy={selectedStrategy}
        peers={peers}
        onRoomIdChange={setRoomId}
        onMyNameChange={setMyName}
        onPasswordChange={setPassword}
        onStrategyChange={setSelectedStrategy}
        onJoin={joinRoom}
        onLeave={leaveRoom}
        anonymityMode={anonymityMode}
        onAnonymityChange={setAnonymityMode}
      />
      <div className="chat-area">
        <MessageList messages={messages} />
        {isJoined && <MessageInput onSend={sendMessage} />}
      </div>
    </div>
  )
}

export default Chat
