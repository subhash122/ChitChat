import TickIcon from './TickIcon'

type MessageBubbleProps = {
  content: string
  isMine: boolean
  status: 'SENT' | 'DELIVERED' | 'READ'
  time: string
}

export default function MessageBubble({ content, isMine, status, time }: MessageBubbleProps) {
  return (
    <div className={`flex ${isMine ? 'justify-end' : 'justify-start'} mb-2`}>
      <div className={`max-w-xs px-4 py-2 rounded-lg ${
        isMine ? 'bg-green-600 text-white rounded-br-none' : 'bg-green-100 text-black rounded-bl-none'
      }`}>
        <p className="text-sm">{content}</p>
        <div className={`flex items-center justify-end mt-1 gap-1 ${isMine ? 'text-green-100' : 'text-black'}`}>
          <span className="text-[10px]">{time}</span>
          {isMine && <TickIcon status={status} />}
        </div>
      </div>
    </div>
  )
}
