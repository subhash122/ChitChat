'use client'

import { useState } from 'react'
import { apiPost } from '@/lib/api'

type User = { id: string; name: string; email: string }

type CreateGroupModalProps = {
  users: User[]
  onClose: () => void
  onCreated: (group: unknown) => void
}

export default function CreateGroupModal({ users, onClose, onCreated }: CreateGroupModalProps) {
  const [name, setName] = useState('')
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  function toggleUser(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')

    if (!name.trim()) {
      setError('Group name is required')
      return
    }
    if (selectedIds.size === 0) {
      setError('Pick at least one member')
      return
    }

    setSubmitting(true)
    try {
      const group = await apiPost('/api/groups', {
        name: name.trim(),
        memberIds: Array.from(selectedIds)
      })
      onCreated(group)
      onClose()
    } catch (err: any) {
      setError(err.message || 'Failed to create group')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-md max-h-[80vh] flex flex-col">
        <div className="p-4 border-b flex items-center justify-between">
          <h2 className="font-bold text-lg">New Group</h2>
          <button onClick={onClose} className="text-gray-500 hover:text-gray-700">✕</button>
        </div>

        <form onSubmit={handleSubmit} className="flex-1 flex flex-col overflow-hidden">
          <div className="p-4 border-b">
            {error && <div className="bg-red-100 text-red-700 p-2 rounded mb-3 text-sm">{error}</div>}
            <label className="block text-sm font-medium text-gray-700 mb-1">Group name</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Team Alpha"
              className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-black"
            />
          </div>

          <div className="flex-1 overflow-y-auto">
            <div className="p-3 text-sm font-medium text-gray-500 bg-gray-50 sticky top-0">
              Select members ({selectedIds.size} selected)
            </div>
            {users.length === 0 ? (
              <div className="p-4 text-sm text-gray-500">No other users available</div>
            ) : (
              users.map((u) => (
                <label
                  key={u.id}
                  className="flex items-center gap-3 p-3 border-b cursor-pointer hover:bg-gray-50"
                >
                  <input
                    type="checkbox"
                    checked={selectedIds.has(u.id)}
                    onChange={() => toggleUser(u.id)}
                    className="h-4 w-4"
                  />
                  <div>
                    <div className="font-medium text-black">{u.name}</div>
                    <div className="text-xs text-gray-500">{u.email}</div>
                  </div>
                </label>
              ))
            )}
          </div>

          <div className="p-4 border-t flex gap-2 justify-end">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-gray-700 hover:bg-gray-100 rounded-lg"
              disabled={submitting}
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
            >
              {submitting ? 'Creating…' : 'Create'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
