const DB_NAME = 'matchpoint-offline'
const DB_VERSION = 1
const STORE_NAME = 'pending-matches'

// How long we wait before reclaiming a `status: 'syncing'` item whose
// owning tab may have crashed. Must be > worst-case retry window
// (500+1000+2000 = 3.5s) by a comfortable margin.
const STALE_CLAIM_MS = 60_000

interface QueuedItem {
  id: number
  payload: object
  createdAt: string
  // Presence of `status: 'syncing'` + a recent `claimedAt` means another
  // caller (same tab, other tab) is currently processing this row. Absence
  // or a stale timestamp means it's available to claim.
  status?: 'syncing'
  claimedAt?: number
}

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION)
    request.onupgradeneeded = () => {
      const db = request.result
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'id', autoIncrement: true })
      }
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}

export async function enqueueMatch(payload: object): Promise<void> {
  const db = await openDB()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite')
    tx.objectStore(STORE_NAME).add({ payload, createdAt: new Date().toISOString() })
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
  })
}

/**
 * Atomically claim all unclaimed (or stale-claimed) pending items for sync.
 *
 * Uses a single `readwrite` transaction so that two concurrent callers
 * (multi-tab, or same tab racing itself) can't both claim the same rows:
 * IDB serializes readwrite transactions on a store across connections, so
 * whichever transaction commits first "wins" and writes the `syncing`
 * markers; the second transaction sees them and skips those rows.
 */
export async function claimPending(): Promise<QueuedItem[]> {
  const db = await openDB()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite')
    const store = tx.objectStore(STORE_NAME)
    const req = store.getAll()
    const claimed: QueuedItem[] = []
    req.onsuccess = () => {
      const now = Date.now()
      for (const item of req.result as QueuedItem[]) {
        const isStale = !item.claimedAt || (now - item.claimedAt) > STALE_CLAIM_MS
        if (item.status === 'syncing' && !isStale) continue // another caller owns it
        const updated: QueuedItem = { ...item, status: 'syncing', claimedAt: now }
        store.put(updated)
        claimed.push(updated)
      }
    }
    tx.oncomplete = () => resolve(claimed)
    tx.onerror = () => reject(tx.error)
  })
}

/**
 * Release a claim on an item (e.g. after all retries failed). Resets the
 * item's status so the next sync attempt can pick it up. Called only on
 * terminal failure — successful syncs go through `removeFromQueue` instead.
 */
export async function releasePending(id: number): Promise<void> {
  const db = await openDB()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite')
    const store = tx.objectStore(STORE_NAME)
    const getReq = store.get(id)
    getReq.onsuccess = () => {
      const item = getReq.result as QueuedItem | undefined
      if (!item) return // already removed; nothing to do
      const { status: _status, claimedAt: _claimedAt, ...rest } = item
      store.put(rest as QueuedItem)
    }
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
  })
}

export async function removeFromQueue(id: number): Promise<void> {
  const db = await openDB()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite')
    tx.objectStore(STORE_NAME).delete(id)
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
  })
}

export async function getPendingCount(): Promise<number> {
  const db = await openDB()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly')
    const request = tx.objectStore(STORE_NAME).count()
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}
