type TickIconProps = {
  status: 'SENT' | 'DELIVERED' | 'READ'
}

export default function TickIcon({ status }: TickIconProps) {
  if (status === 'SENT') {
    return <span className="text-white text-xs font-bold ml-1">✓</span>
  }
  if (status === 'DELIVERED') {
    return <span className="text-white text-xs font-bold ml-1">✓✓</span>
  }
  return <span className="text-blue-500 text-xs font-bold ml-1">✓✓</span>
}
