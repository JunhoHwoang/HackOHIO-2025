const API = import.meta.env.VITE_API_BASE || 'http://localhost:4000'

export async function getLots(params?: { permit?: string; near?: string; radius?: number }) {
  const qs = new URLSearchParams()
  if (params?.permit) qs.set('permit', params.permit)
  if (params?.near) qs.set('near', params.near)
  if (params?.radius) qs.set('radius', String(params.radius))
  const query = qs.toString()
  const res = await fetch(`${API}/api/lots${query ? `?${query}` : ''}`)
  if (!res.ok) throw new Error('Failed to fetch lots')
  return res.json()
}

export async function getLot(id: string) {
  const res = await fetch(`${API}/api/lots/${id}`)
  if (!res.ok) throw new Error('Failed to fetch lot')
  return res.json()
}

export async function getStalls(lotId: string) {
  const res = await fetch(`${API}/api/lots/${lotId}/stalls?snapshot=latest`)
  if (!res.ok) throw new Error('Failed to fetch stalls')
  return res.json()
}

export async function saveStalls(lotId: string, stalls: any[]) {
  const res = await fetch(`${API}/api/lots/${lotId}/stalls`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(stalls),
  })
  if (!res.ok) throw new Error('Failed to save stalls')
  return res.json()
}
