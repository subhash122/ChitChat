'use client'

import { useEffect, useState, useCallback, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { useSocket } from '@/hooks/useSocket'
import { apiGet, apiPost } from '@/lib/api'
import ChatSidebar from '@/components/ChatSidebar'
import MessageBubble from '@/components/MessageBubble'
import MessageInput from '@/components/MessageInput'

type User = { id: string; name: string; email: string }
type Message = {
  id: string; content: string; senderId: string; receiverId: string
  status: 'SENT' | 'DELIVERED' | 'READ'; createdAt: string; tempId?: string
}
type Conversation = {
  id: string; user1: User; user2: User
  messages: { content: string; createdAt: string; senderId: string; status: string }[]
}

export default function ChatPage() {
  const router = useRouter()
  const { socket, isConnected } = useSocket()
  const [currentUser, setCurrentUser] = useState<User | null>(null)
  const [conversations, setConversations] = useState<Conversation[]>([])
  const [users, setUsers] = useState<User[]>([])
  const [activeConversation, setActiveConversation] = useState<Conversation | null>(null)
  const [messages, setMessages] = useState<Message[]>([])
  const messagesEndRef = useRef<HTMLDivElement>(null)

  // Load current user from /api/auth/me (authenticated via cookie)
  useEffect(() => {
    async function loadUser() {
      try {
        const user = await apiGet('/api/auth/me')
        setCurrentUser(user)
      } catch {
        router.push('/')
      }
    }
    loadUser()
  }, [router])

  const handleLogout = useCallback(async () => {
    try {
      await apiPost('/api/auth/logout', {})
    } catch {
      // ignore — we're logging out anyway
    }
    socket?.disconnect()
    router.push('/')
  }, [router, socket])

  // Load conversations and users
  useEffect(() => {
    if (!currentUser) return
    async function loadSidebar() {
      try {
        const [convs, allUsers] = await Promise.all([
          apiGet('/api/conversations'),
          apiGet('/api/users')
        ])
        setConversations(convs)
        setUsers(allUsers)
      } catch (err) {
        console.error(err)
      }
    }
    loadSidebar()
  }, [currentUser])

  // Load messages when conversation changes
  useEffect(() => {
    if (!activeConversation) return
    async function loadMessages() {
      try {
        const data = await apiGet(`/api/messages/${activeConversation!.id}`)
        setMessages(data.messages)
      } catch (err) {
        console.error(err)
      }
    }
    loadMessages()
  }, [activeConversation])

  // Mark messages as read when opening a conversation
  useEffect(() => {
    if (!activeConversation || !currentUser || !socket) return
    const unreadIds = messages
      .filter(m => m.receiverId === currentUser.id && m.status !== 'READ')
      .map(m => m.id)
    if (unreadIds.length > 0) {
      socket.emit('message_read', {
        messageIds: unreadIds,
        conversationId: activeConversation.id
      })
    }
  }, [messages, activeConversation, currentUser, socket])

  // Socket event listeners
  useEffect(() => {
    if (!socket) return

    socket.on('message_ack', (data: {
      tempId: string; messageId: string; status: string; createdAt: string
    }) => {
      setMessages(prev => prev.map(m =>
        m.tempId === data.tempId
          ? { ...m, id: data.messageId, status: data.status as Message['status'], createdAt: data.createdAt }
          : m
      ))
    })

    socket.on('new_message', async (data: {
      messageId: string; conversationId: string; senderId: string
      content: string; createdAt: string
    }) => {
      const newMsg: Message = {
        id: data.messageId, content: data.content, senderId: data.senderId,
        receiverId: currentUser?.id || '', status: 'DELIVERED', createdAt: data.createdAt
      }

      if (activeConversation?.id === data.conversationId) {
        setMessages(prev => [...prev, newMsg])
        socket.emit('message_delivered', { messageIds: [data.messageId] })
        socket.emit('message_read', {
          messageIds: [data.messageId], conversationId: data.conversationId
        })
      } else {
        socket.emit('message_delivered', { messageIds: [data.messageId] })
      }

      try {
        const convs = await apiGet('/api/conversations')
        setConversations(convs)
      } catch (err) {
        console.error(err)
      }
    })

    socket.on('status_update', (data: { messageIds: string[]; status: string }) => {
      setMessages(prev => prev.map(m =>
        data.messageIds.includes(m.id)
          ? { ...m, status: data.status as Message['status'] }
          : m
      ))
    })

    return () => {
      socket.off('message_ack')
      socket.off('new_message')
      socket.off('status_update')
    }
  }, [socket, activeConversation, currentUser])

  // Auto-scroll to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  const handleSendMessage = useCallback((content: string) => {
    if (!socket || !activeConversation || !currentUser) return
    const otherUser = activeConversation.user1.id === currentUser.id
      ? activeConversation.user2 : activeConversation.user1
    const tempId = `temp_${Date.now()}_${Math.random().toString(36).slice(2)}`

    const optimisticMsg: Message = {
      id: tempId, content, senderId: currentUser.id, receiverId: otherUser.id,
      status: 'SENT', createdAt: new Date().toISOString(), tempId
    }
    setMessages(prev => [...prev, optimisticMsg])

    socket.emit('send_message', {
      conversationId: activeConversation.id, receiverId: otherUser.id, content, tempId
    })
  }, [socket, activeConversation, currentUser])

  const handleStartConversation = useCallback(async (userId: string) => {
    const conv = await apiPost('/api/conversations', { userId })
    setConversations(prev => [conv, ...prev])
    setActiveConversation(conv)
  }, [])

  if (!currentUser) return null

  function getOtherUser(conv: Conversation) {
    return conv.user1.id === currentUser!.id ? conv.user2 : conv.user1
  }

  return (
    <div className="flex h-screen bg-green-50">
      <ChatSidebar conversations={conversations} users={users}
        currentUser={currentUser} activeConversationId={activeConversation?.id || null}
        onSelectConversation={setActiveConversation} onStartConversation={handleStartConversation}
        onLogout={handleLogout} />

      <div className="flex-1 flex flex-col">
        {activeConversation ? (
          <>
            <div className="p-4 border-b bg-white flex items-center gap-3">
              <div>
                <div className="font-bold">{getOtherUser(activeConversation).name}</div>
                <div className="text-xs text-black">{isConnected ? 'Connected' : 'Connecting...'}</div>
              </div>
            </div>
            <div className="flex-1 overflow-y-auto p-4">
              {messages.map((msg) => (
                <MessageBubble key={msg.id} content={msg.content}
                  isMine={msg.senderId === currentUser.id} status={msg.status}
                  time={new Date(msg.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} />
              ))}
              <div ref={messagesEndRef} />
            </div>
            <MessageInput onSend={handleSendMessage} disabled={!isConnected} />
          </>
        ) : (
          <div className="flex-1 flex items-center justify-center text-black">
            Select a conversation to start chatting
          </div>
        )}
      </div>
    </div>
  )
}
