'use client'

type User = { id: string; name: string; email: string }
type Conversation = {
  id: string
  user1: User
  user2: User
  messages: { content: string; createdAt: string; senderId: string; status: string }[]
}

type ChatSidebarProps = {
  conversations: Conversation[]
  users: User[]
  currentUser: User
  activeConversationId: string | null
  onSelectConversation: (conv: Conversation) => void
  onStartConversation: (userId: string) => void
  onLogout: () => void
}

export default function ChatSidebar({
  conversations, users, currentUser, activeConversationId,
  onSelectConversation, onStartConversation, onLogout
}: ChatSidebarProps) {
  const conversationUserIds = conversations.flatMap(c => [c.user1.id, c.user2.id])
  const newUsers = users.filter(u => !conversationUserIds.includes(u.id))

  function getOtherUser(conv: Conversation) {
    return conv.user1.id === currentUser.id ? conv.user2 : conv.user1
  }

  return (
    <div className="w-80 border-r bg-white flex flex-col h-full">
      <div className="p-4 border-b flex items-center justify-between">
        <div>
          <div className="font-bold text-lg">Chats</div>
          <div className="text-xs text-black truncate">{currentUser.name}</div>
        </div>
        <button
          onClick={onLogout}
          className="text-sm text-red-600 hover:text-red-800 hover:underline"
        >
          Logout
        </button>
      </div>
      <div className="flex-1 overflow-y-auto">
        {conversations.map((conv) => {
          const other = getOtherUser(conv)
          const lastMsg = conv.messages[0]
          const isActive = conv.id === activeConversationId
          return (
            <div key={conv.id} onClick={() => onSelectConversation(conv)}
              className={`p-4 cursor-pointer hover:bg-green-50 border-b ${isActive ? 'bg-blue-50' : ''}`}>
              <div className="font-medium">{other.name}</div>
              {lastMsg && <div className="text-sm text-black truncate">{lastMsg.content}</div>}
            </div>
          )
        })}
        {newUsers.length > 0 && (
          <>
            <div className="p-4 border-b text-sm font-medium text-black bg-green-50">Start a conversation</div>
            {newUsers.map((user) => (
              <div key={user.id} onClick={() => onStartConversation(user.id)}
                className="p-4 cursor-pointer hover:bg-green-50 border-b">
                <div className="font-medium">{user.name}</div>
                <div className="text-sm text-black">{user.email}</div>
              </div>
            ))}
          </>
        )}
      </div>
    </div>
  )
}
