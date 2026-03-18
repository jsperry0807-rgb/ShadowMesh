import React from 'react'
import { useChatRoom } from '../hooks/useChatRoom'
import { Sidebar } from '../components/Sidebar'
import { MessageList } from '../components/MessageList'
import { MessageInput } from '../components/MessageInput'

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
    <div className="flex flex-col md:flex-row h-screen bg-gray-100">
      {/* Sidebar – full width on mobile, fixed width on desktop */}
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

      {/* Chat area – takes remaining height/width */}
      <div className="flex flex-col flex-1 overflow-hidden bg-white md:rounded-l-none md:shadow-inner">
        <MessageList messages={messages} className="flex-1 overflow-y-auto px-4 py-6 space-y-4" />

        {isJoined && (
          <div className="border-t border-gray-200 bg-gray-50 p-4 md:p-6">
            <MessageInput onSend={sendMessage} />
          </div>
        )}
      </div>
    </div>
  )
}

export default Chat
