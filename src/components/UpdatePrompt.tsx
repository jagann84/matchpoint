import { useEffect, useState } from 'react'
import { RefreshCw } from 'lucide-react'

// Service-worker update prompt.
//
// The PWA service worker (public/sw.js) intentionally does NOT call
// skipWaiting() on install, so when a new version is deployed the new
// SW sits in the 'waiting' state instead of clobbering the running
// page. This component listens for that waiting state and surfaces a
// user-visible banner that asks for consent to activate.
//
// The activation dance:
//   1. User clicks "Reload" → we post { type: 'SKIP_WAITING' } to the
//      waiting SW
//   2. The waiting SW calls self.skipWaiting(), activates, and claims
//      clients — this fires a 'controllerchange' event
//   3. On 'controllerchange' we reload the page
//
// Reloading BEFORE controllerchange can briefly re-load the page under
// the old SW, so we order the reload strictly after the handover.
export default function UpdatePrompt() {
  const [waitingWorker, setWaitingWorker] = useState<ServiceWorker | null>(null)

  useEffect(() => {
    if (!('serviceWorker' in navigator)) return

    let cancelled = false

    const promoteWaiting = (reg: ServiceWorkerRegistration) => {
      if (cancelled) return
      // Only surface the banner for *updates*, not first installs.
      // navigator.serviceWorker.controller is non-null iff the page is
      // already being controlled by an active SW; a first install has
      // no controller, so there's nothing to "update from".
      if (reg.waiting && navigator.serviceWorker.controller) {
        setWaitingWorker(reg.waiting)
      }
    }

    navigator.serviceWorker.getRegistration().then((reg) => {
      if (!reg || cancelled) return

      // Case A: a waiting worker already exists when the component
      // mounts (e.g. user hard-navigated after a deploy).
      promoteWaiting(reg)

      // Case B: a new worker starts installing while the app is open.
      // Watch its state transitions and promote it once it reaches
      // 'installed' (which is the waiting state when there's already
      // a controller).
      reg.addEventListener('updatefound', () => {
        const installing = reg.installing
        if (!installing) return
        installing.addEventListener('statechange', () => {
          if (installing.state === 'installed') {
            promoteWaiting(reg)
          }
        })
      })
    })

    // Once the new SW takes control, reload so the page runs under it.
    // Guard with a flag because controllerchange can fire more than
    // once in edge cases (dev tools "Update on reload", multi-tab).
    let reloaded = false
    const onControllerChange = () => {
      if (reloaded) return
      reloaded = true
      window.location.reload()
    }
    navigator.serviceWorker.addEventListener('controllerchange', onControllerChange)

    return () => {
      cancelled = true
      navigator.serviceWorker.removeEventListener('controllerchange', onControllerChange)
    }
  }, [])

  if (!waitingWorker) return null

  const handleReload = () => {
    waitingWorker.postMessage({ type: 'SKIP_WAITING' })
    // The actual reload happens in the controllerchange listener above.
  }

  return (
    <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-50 bg-green-600 text-white rounded-full shadow-lg px-4 py-2 flex items-center gap-3 text-sm">
      <span>New version available</span>
      <button
        onClick={handleReload}
        className="bg-white text-green-700 hover:bg-green-50 font-medium rounded-full px-3 py-1 flex items-center gap-1.5"
      >
        <RefreshCw size={14} />
        Reload
      </button>
    </div>
  )
}
