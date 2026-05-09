const API_URL = process.env.NEXT_PUBLIC_API_URL!

export async function apiPost(path: string, body: object) {
  const res = await fetch(`${API_URL}${path}`, {
    method: 'POST',
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(body)
  })
  if (!res.ok) {
    const error = await res.json()
    throw new Error(error.error || 'Request failed')
  }
  return res.json()
}

export async function apiGet(path: string) {
  const res = await fetch(`${API_URL}${path}`, {
    credentials: 'include'
  })
  if (!res.ok) {
    const error = await res.json()
    throw new Error(error.error || 'Request failed')
  }
  return res.json()
}
