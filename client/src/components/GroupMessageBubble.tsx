type GroupMessageBubbleProps = {
  content: string
  isMine: boolean
  senderName: string
  time: string
}

export default function GroupMessageBubble({ content, isMine, senderName, time }: GroupMessageBubbleProps) {
  return (
    <div className={`flex ${isMine ? 'justify-end' : 'justify-start'} mb-2`}>
      <div className={`max-w-xs px-4 py-2 rounded-lg ${
        isMine ? 'bg-blue-600 text-white rounded-br-none' : 'bg-gray-200 text-gray-900 rounded-bl-none'
      }`}>
        {!isMine && (
          <div className="text-xs font-semibold text-blue-700 mb-1">{senderName}</div>
        )}
        <p className="text-sm">{content}</p>
        <div className={`flex items-center justify-end mt-1 ${isMine ? 'text-blue-200' : 'text-gray-500'}`}>
          <span className="text-[10px]">{time}</span>
        </div>
      </div>
    </div>
  )
}
