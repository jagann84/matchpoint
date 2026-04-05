import { useState, useEffect } from 'react'
import { WifiOff, RefreshCw } from 'lucide-react'
import { getPendingCount } from '../lib/offlineQueue'
import { syncPendingMatches } from '../lib/matchService'
import { showToast } from './Toast'

export default function OfflineBanner() {
  const [isOffline, setIsOffline] = useState(!navigator.onLine)
  const [pendingCount, setPendingCount] = useState(0)
  const [syncing, setSyncing] = useState(false)

  useEffect(() => {
    const goOffline = () => setIsOffline(true)
    const goOnline = () => {
      setIsOffline(false)
      handleSync()
    }
    window.addEventListener('offline', goOffline)
    window.addEventListener('online', goOnline)
    return () => {
      window.removeEventListener('offline', goOffline)
      window.removeEventListener('online', goOnline)
    }
  }, [])

  useEffect(() => {
    const checkPending = async () => {
      const count = await getPendingCount()
      setPendingCount(count)
    }
    checkPending()
    const interval = setInterval(checkPending, 5000)
    return () => clearInterval(interval)
  }, [])

  const handleSync = async () => {
    setSyncing(true)
    try {
      const synced = await syncPendingMatches()
      if (synced > 0) {
        showToast(`Synced ${synced} match${synced > 1 ? 'es' : ''}`, 'success')
        setPendingCount(prev => Math.max(0, prev - synced))
      }
    } catch {
      // Silent fail, will retry
    }
    setSyncing(false)
  }

  if (!isOffline && pendingCount === 0) return null

  return (
    <div className={`fixed top-0 left-0 right-0 z-[60] px-4 py-2 text-center text-sm font-medium ${
      isOffline ? 'bg-amber-500 text-white' : 'bg-blue-500 text-white'
    }`}>
      {isOffline ? (
        <span className="flex items-center justify-center gap-2">
          <WifiOff size={14} />
          You're offline — matches will sync when you're back online
          {pendingCount > 0 && ` (${pendingCount} pending)`}
        </span>
      ) : pendingCount > 0 ? (
        <button
          onClick={handleSync}
          disabled={syncing}
          className="flex items-center justify-center gap-2 mx-auto"
        >
          <RefreshCw size={14} className={syncing ? 'animate-spin' : ''} />
          {syncing ? 'Syncing...' : `${pendingCount} match${pendingCount > 1 ? 'es' : ''} to sync — tap to sync now`}
        </button>
      ) : null}
    </div>
  )
}
