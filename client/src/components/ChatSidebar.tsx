'use client'

type User = { id: string; name: string; email: string }
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

export type ActiveChat = { type: 'direct'; id: string } | { type: 'group'; id: string } | null

type ChatSidebarProps = {
  conversations: Conversation[]
  groups: Group[]
  users: User[]
  currentUser: User
  activeChat: ActiveChat
  onSelectConversation: (conv: Conversation) => void
  onSelectGroup: (group: Group) => void
  onStartConversation: (userId: string) => void
  onCreateGroup: () => void
  onLogout: () => void
}

export default function ChatSidebar({
  conversations, groups, users, currentUser, activeChat,
  onSelectConversation, onSelectGroup, onStartConversation, onCreateGroup, onLogout
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
        <div className="flex items-center gap-3">
          <button
            onClick={onCreateGroup}
            className="text-sm text-blue-600 hover:text-blue-800 hover:underline"
          >
            + Group
          </button>
          <button
            onClick={onLogout}
            className="text-sm text-red-600 hover:text-red-800 hover:underline"
          >
            Logout
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">
        {groups.length > 0 && (
          <>
            <div className="p-3 border-b text-xs font-semibold text-gray-500 bg-gray-50 uppercase tracking-wide">
              Groups
            </div>
            {groups.map((group) => {
              const lastMsg = group.messages[0]
              const isActive = activeChat?.type === 'group' && activeChat.id === group.id
              return (
                <div
                  key={group.id}
                  onClick={() => onSelectGroup(group)}
                  className={`p-4 cursor-pointer hover:bg-green-50 border-b ${isActive ? 'bg-blue-50' : ''}`}
                >
                  <div className="font-medium">{group.name}</div>
                  <div className="text-xs text-gray-500">
                    {group.members.length} member{group.members.length === 1 ? '' : 's'}
                  </div>
                  {lastMsg && <div className="text-sm text-black truncate mt-1">{lastMsg.content}</div>}
                </div>
              )
            })}
          </>
        )}

        {conversations.length > 0 && (
          <>
            <div className="p-3 border-b text-xs font-semibold text-gray-500 bg-gray-50 uppercase tracking-wide">
              Direct
            </div>
            {conversations.map((conv) => {
              const other = getOtherUser(conv)
              const lastMsg = conv.messages[0]
              const isActive = activeChat?.type === 'direct' && activeChat.id === conv.id
              return (
                <div key={conv.id} onClick={() => onSelectConversation(conv)}
                  className={`p-4 cursor-pointer hover:bg-green-50 border-b ${isActive ? 'bg-blue-50' : ''}`}>
                  <div className="font-medium">{other.name}</div>
                  {lastMsg && <div className="text-sm text-black truncate">{lastMsg.content}</div>}
                </div>
              )
            })}
          </>
        )}

        {newUsers.length > 0 && (
          <>
            <div className="p-3 border-b text-xs font-semibold text-gray-500 bg-gray-50 uppercase tracking-wide">
              Start a conversation
            </div>
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
