import { useEffect, useState } from 'react'

export default function useAvailability(sessionId, revision) {
  const [data, setData] = useState(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [refresh, setRefresh] = useState(0)
  useEffect(() => {
    if (!sessionId) return
    let cancelled = false
    let timer
    async function load(force = false) {
      setLoading(true)
      try {
        const response = await fetch(`/api/sessions/${encodeURIComponent(sessionId)}/availability${force ? '?refresh=1' : ''}`, { credentials: 'include' })
        const result = await response.json()
        if (!response.ok) throw new Error(result.error || 'Could not load group availability.')
        if (!cancelled) { setData({ ...result, sessionId }); setError('') }
      } catch (err) { if (!cancelled) setError(err.message) }
      finally { if (!cancelled) { setLoading(false); timer = setTimeout(() => load(), 60000) } }
    }
    load(refresh > 0)
    return () => { cancelled = true; clearTimeout(timer) }
  }, [sessionId, revision, refresh])
  return { data: data?.sessionId === sessionId ? data : null, error, loading, refresh: () => setRefresh(value => value + 1) }
}

