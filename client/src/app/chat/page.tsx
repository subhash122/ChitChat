'use client'

import { useEffect, useState, useCallback, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { useSocket } from '@/hooks/useSocket'
import { apiGet, apiPost } from '@/lib/api'
import ChatSidebar, { ActiveChat } from '@/components/ChatSidebar'
import MessageBubble from '@/components/MessageBubble'
import GroupMessageBubble from '@/components/GroupMessageBubble'
import MessageInput from '@/components/MessageInput'
import CreateGroupModal from '@/components/CreateGroupModal'

type User = { id: string; name: string; email: string }

type DirectMessage = {
  kind: 'direct'
  id: string
  content: string
  senderId: string
  receiverId: string
  status: 'SENT' | 'DELIVERED' | 'READ'
  createdAt: string
  tempId?: string
}

type GroupChatMessage = {
  kind: 'group'
  id: string
  content: string
  senderId: string
  senderName: string
  createdAt: string
  tempId?: string
}

type ChatMessage = DirectMessage | GroupChatMessage

type Conversation = {
  id: string
  user1: User
  user2: User
  messages: { content: string; createdAt: string; senderId: string; status: string }[]
}

type GroupMember = { user: User }
type Group = {
  id: string
  name: string
  createdBy: string
  members: GroupMember[]
  messages: { content: string; createdAt: string; senderId: string }[]
}

export default function ChatPage() {
  const router = useRouter()
  const { socket, isConnected } = useSocket()

  const [currentUser, setCurrentUser] = useState<User | null>(null)
  const [conversations, setConversations] = useState<Conversation[]>([])
  const [groups, setGroups] = useState<Group[]>([])
  const [users, setUsers] = useState<User[]>([])
  const [activeChat, setActiveChat] = useState<ActiveChat>(null)
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [showCreateGroup, setShowCreateGroup] = useState(false)

  const messagesEndRef = useRef<HTMLDivElement>(null)

  // Load current user
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
    try { await apiPost('/api/auth/logout', {}) } catch {}
    socket?.disconnect()
    router.push('/')
  }, [router, socket])

  // Load sidebar (conversations, groups, users)
  useEffect(() => {
    if (!currentUser) return
    async function loadSidebar() {
      try {
        const [convs, grps, allUsers] = await Promise.all([
          apiGet('/api/conversations'),
          apiGet('/api/groups'),
          apiGet('/api/users')
        ])
        setConversations(convs)
        setGroups(grps)
        setUsers(allUsers)
      } catch (err) {
        console.error(err)
      }
    }
    loadSidebar()
  }, [currentUser])

  // Load messages when active chat changes
  useEffect(() => {
    if (!activeChat) {
      setMessages([])
      return
    }
    async function loadMessages() {
      try {
        if (activeChat!.type === 'direct') {
          const data = await apiGet(`/api/messages/${activeChat!.id}`)
          setMessages(
            data.messages.map((m: any) => ({ kind: 'direct', ...m }))
          )
        } else {
          const data = await apiGet(`/api/groups/${activeChat!.id}/messages`)
          setMessages(
            data.messages.map((m: any) => ({
              kind: 'group',
              id: m.id,
              content: m.content,
              senderId: m.senderId,
              senderName: m.sender?.name ?? 'Unknown',
              createdAt: m.createdAt
            }))
          )
        }
      } catch (err) {
        console.error(err)
      }
    }
    loadMessages()
  }, [activeChat])

  // Mark direct messages as read when opening a 1:1 conversation
  useEffect(() => {
    if (!activeChat || activeChat.type !== 'direct' || !currentUser || !socket) return
    const unreadIds = messages
      .filter((m): m is DirectMessage =>
        m.kind === 'direct' && m.receiverId === currentUser.id && m.status !== 'READ'
      )
      .map((m) => m.id)
    if (unreadIds.length > 0) {
      socket.emit('message_read', {
        messageIds: unreadIds,
        conversationId: activeChat.id
      })
    }
  }, [messages, activeChat, currentUser, socket])

  // Socket listeners
  useEffect(() => {
    if (!socket) return

    socket.on('message_ack', (data: {
      tempId: string; messageId: string; status?: string; createdAt: string
    }) => {
      setMessages((prev) =>
        prev.map((m) => {
          if (m.tempId !== data.tempId) return m
          if (m.kind === 'direct') {
            return {
              ...m,
              id: data.messageId,
              status: (data.status as DirectMessage['status']) ?? m.status,
              createdAt: data.createdAt
            }
          }
          return { ...m, id: data.messageId, createdAt: data.createdAt }
        })
      )
    })

    socket.on('new_message', async (data: {
      messageId: string; conversationId: string; senderId: string
      content: string; createdAt: string
    }) => {
      const newMsg: DirectMessage = {
        kind: 'direct',
        id: data.messageId,
        content: data.content,
        senderId: data.senderId,
        receiverId: currentUser?.id || '',
        status: 'DELIVERED',
        createdAt: data.createdAt
      }

      if (activeChat?.type === 'direct' && activeChat.id === data.conversationId) {
        setMessages((prev) => [...prev, newMsg])
        socket.emit('message_delivered', { messageIds: [data.messageId] })
        socket.emit('message_read', {
          messageIds: [data.messageId],
          conversationId: data.conversationId
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

    socket.on('new_group_message', async (data: {
      messageId: string; groupId: string; senderId: string; senderName: string
      content: string; createdAt: string
    }) => {
      const newMsg: GroupChatMessage = {
        kind: 'group',
        id: data.messageId,
        content: data.content,
        senderId: data.senderId,
        senderName: data.senderName,
        createdAt: data.createdAt
      }

      if (activeChat?.type === 'group' && activeChat.id === data.groupId) {
        setMessages((prev) => [...prev, newMsg])
      }

      // Refresh groups list to update last-message preview
      try {
        const grps = await apiGet('/api/groups')
        setGroups(grps)
      } catch (err) {
        console.error(err)
      }
    })

    socket.on('group_added', async (_data: { group: Group }) => {
      try {
        const grps = await apiGet('/api/groups')
        setGroups(grps)
      } catch (err) {
        console.error(err)
      }
    })

    socket.on('status_update', (data: { messageIds: string[]; status: string }) => {
      setMessages((prev) =>
        prev.map((m) => {
          if (m.kind !== 'direct') return m
          if (!data.messageIds.includes(m.id)) return m
          return { ...m, status: data.status as DirectMessage['status'] }
        })
      )
    })

    return () => {
      socket.off('message_ack')
      socket.off('new_message')
      socket.off('new_group_message')
      socket.off('group_added')
      socket.off('status_update')
    }
  }, [socket, activeChat, currentUser])

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  const handleSendMessage = useCallback((content: string) => {
    if (!socket || !activeChat || !currentUser) return
    const tempId = `temp_${Date.now()}_${Math.random().toString(36).slice(2)}`

    if (activeChat.type === 'direct') {
      const conv = conversations.find((c) => c.id === activeChat.id)
      if (!conv) return
      const otherUser = conv.user1.id === currentUser.id ? conv.user2 : conv.user1

      const optimisticMsg: DirectMessage = {
        kind: 'direct',
        id: tempId,
        content,
        senderId: currentUser.id,
        receiverId: otherUser.id,
        status: 'SENT',
        createdAt: new Date().toISOString(),
        tempId
      }
      setMessages((prev) => [...prev, optimisticMsg])
      socket.emit('send_message', {
        conversationId: activeChat.id,
        receiverId: otherUser.id,
        content,
        tempId
      })
    } else {
      const optimisticMsg: GroupChatMessage = {
        kind: 'group',
        id: tempId,
        content,
        senderId: currentUser.id,
        senderName: currentUser.name,
        createdAt: new Date().toISOString(),
        tempId
      }
      setMessages((prev) => [...prev, optimisticMsg])
      socket.emit('send_group_message', {
        groupId: activeChat.id,
        content,
        tempId
      })
    }
  }, [socket, activeChat, currentUser, conversations])

  const handleStartConversation = useCallback(async (userId: string) => {
    const conv = await apiPost('/api/conversations', { userId })
    setConversations((prev) => [conv, ...prev])
    setActiveChat({ type: 'direct', id: conv.id })
  }, [])

  const handleSelectConversation = useCallback((conv: Conversation) => {
    setActiveChat({ type: 'direct', id: conv.id })
  }, [])

  const handleSelectGroup = useCallback((group: Group) => {
    setActiveChat({ type: 'group', id: group.id })
  }, [])

  const handleGroupCreated = useCallback((group: unknown) => {
    setGroups((prev) => [group as Group, ...prev])
    setActiveChat({ type: 'group', id: (group as Group).id })
  }, [])

  if (!currentUser) return null

  const activeConversation =
    activeChat?.type === 'direct' ? conversations.find((c) => c.id === activeChat.id) : null
  const activeGroup =
    activeChat?.type === 'group' ? groups.find((g) => g.id === activeChat.id) : null

  function getOtherUser(conv: Conversation) {
    return conv.user1.id === currentUser!.id ? conv.user2 : conv.user1
  }

  return (
    <div className="flex h-screen bg-green-50">
      <ChatSidebar
        conversations={conversations}
        groups={groups}
        users={users}
        currentUser={currentUser}
        activeChat={activeChat}
        onSelectConversation={handleSelectConversation}
        onSelectGroup={handleSelectGroup}
        onStartConversation={handleStartConversation}
        onCreateGroup={() => setShowCreateGroup(true)}
        onLogout={handleLogout}
      />

      <div className="flex-1 flex flex-col">
        {activeChat ? (
          <>
            <div className="p-4 border-b bg-white flex items-center gap-3">
              <div>
                {activeChat.type === 'direct' && activeConversation && (
                  <>
                    <div className="font-bold">{getOtherUser(activeConversation).name}</div>
                    <div className="text-xs text-black">
                      {isConnected ? 'Connected' : 'Connecting...'}
                    </div>
                  </>
                )}
                {activeChat.type === 'group' && activeGroup && (
                  <>
                    <div className="font-bold">{activeGroup.name}</div>
                    <div className="text-xs text-black">
                      {activeGroup.members.length} members ·{' '}
                      {isConnected ? 'Connected' : 'Connecting...'}
                    </div>
                  </>
                )}
              </div>
            </div>

            <div className="flex-1 overflow-y-auto p-4">
              {messages.map((msg) =>
                msg.kind === 'direct' ? (
                  <MessageBubble
                    key={msg.id}
                    content={msg.content}
                    isMine={msg.senderId === currentUser.id}
                    status={msg.status}
                    time={new Date(msg.createdAt).toLocaleTimeString([], {
                      hour: '2-digit',
                      minute: '2-digit'
                    })}
                  />
                ) : (
                  <GroupMessageBubble
                    key={msg.id}
                    content={msg.content}
                    isMine={msg.senderId === currentUser.id}
                    senderName={msg.senderName}
                    time={new Date(msg.createdAt).toLocaleTimeString([], {
                      hour: '2-digit',
                      minute: '2-digit'
                    })}
                  />
                )
              )}
              <div ref={messagesEndRef} />
            </div>

            <MessageInput onSend={handleSendMessage} disabled={!isConnected} />
          </>
        ) : (
          <div className="flex-1 flex items-center justify-center text-black">
            Select a conversation or group to start chatting
          </div>
        )}
      </div>

      {showCreateGroup && (
        <CreateGroupModal
          users={users}
          onClose={() => setShowCreateGroup(false)}
          onCreated={handleGroupCreated}
        />
      )}
    </div>
  )
}
