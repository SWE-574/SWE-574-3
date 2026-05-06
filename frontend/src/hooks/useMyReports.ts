import { useEffect, useState } from 'react'
import { userAPI, type MyReport } from '@/services/userAPI'

export function useMyReports() {
  const [reports, setReports] = useState<MyReport[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const ac = new AbortController()
    userAPI.getMyReports(ac.signal)
      .then(setReports)
      .catch((err) => {
        if (ac.signal.aborted) return
        setError(err instanceof Error ? err.message : 'Failed to load reports')
        setReports([])
      })
    return () => ac.abort()
  }, [])

  return { reports, error }
}
