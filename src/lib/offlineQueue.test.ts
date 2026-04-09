import { describe, it, expect, beforeEach } from 'vitest'
import { IDBFactory } from 'fake-indexeddb'
import {
  enqueueMatch,
  claimPending,
  releasePending,
  removeFromQueue,
  getPendingCount,
} from './offlineQueue'

// These tests exercise the real IDB-backed offlineQueue against an
// in-memory fake-indexeddb. The stakes: this code handles the offline
// sync race condition (two tabs, or online event + manual click)
// that was the subject of P0-1. If a regression lets the claim
// machinery slip, matches could double-submit.
//
// Each test gets a brand-new IDBFactory so there's no cross-test
// contamination. We can't just deleteDatabase() between tests because
// offlineQueue.ts opens a new connection on every call and never
// closes it, which would block the delete. Swapping the whole factory
// sidesteps that entirely: the old factory (and all its lingering
// connections) is GC'd, and the new one is a fresh in-memory universe.
beforeEach(() => {
  globalThis.indexedDB = new IDBFactory()
})

describe('offlineQueue', () => {
  describe('enqueueMatch + getPendingCount', () => {
    it('starts empty', async () => {
      expect(await getPendingCount()).toBe(0)
    })

    it('increments the count after each enqueue', async () => {
      await enqueueMatch({ user_id: 'u1', date: '2026-04-08' })
      await enqueueMatch({ user_id: 'u1', date: '2026-04-07' })
      expect(await getPendingCount()).toBe(2)
    })
  })

  describe('claimPending', () => {
    it('returns all items and marks them syncing', async () => {
      await enqueueMatch({ tag: 'one' })
      await enqueueMatch({ tag: 'two' })

      const claimed = await claimPending()
      expect(claimed).toHaveLength(2)
      expect(claimed.every(c => c.status === 'syncing')).toBe(true)
      expect(claimed.every(c => typeof c.claimedAt === 'number')).toBe(true)
    })

    it('skips items that are already claimed (simulated second caller)', async () => {
      await enqueueMatch({ tag: 'one' })

      // First caller claims everything.
      const first = await claimPending()
      expect(first).toHaveLength(1)

      // Second caller — same tab, racing — should get nothing because
      // the first claim is fresh.
      const second = await claimPending()
      expect(second).toHaveLength(0)
    })

    it('still claims items whose claim is older than the stale threshold', async () => {
      // Simulate a crashed prior caller: put a claim directly into the
      // DB via enqueue + claim, then rewind claimedAt past the 60s
      // stale window by reaching into IDB directly.
      await enqueueMatch({ tag: 'orphan' })
      await claimPending() // mark it syncing with a fresh claimedAt

      // Rewind claimedAt to an hour ago.
      await new Promise<void>((resolve, reject) => {
        const req = indexedDB.open('matchpoint-offline', 1)
        req.onsuccess = () => {
          const db = req.result
          const tx = db.transaction('pending-matches', 'readwrite')
          const store = tx.objectStore('pending-matches')
          const getReq = store.getAll()
          getReq.onsuccess = () => {
            for (const item of getReq.result) {
              item.claimedAt = Date.now() - 60 * 60 * 1000
              store.put(item)
            }
          }
          tx.oncomplete = () => { db.close(); resolve() }
          tx.onerror = () => reject(tx.error)
        }
        req.onerror = () => reject(req.error)
      })

      // Now the stale-recovery path should pick it up.
      const recovered = await claimPending()
      expect(recovered).toHaveLength(1)
      expect(recovered[0].status).toBe('syncing')
    })
  })

  describe('releasePending', () => {
    it('strips status and claimedAt so the next claim picks it up again', async () => {
      await enqueueMatch({ tag: 'retry-me' })
      const [claimed] = await claimPending()

      // Release — simulating a failed sync that exhausted retries.
      await releasePending(claimed.id)

      // The next claim should succeed because the item is no longer marked syncing.
      const reClaimed = await claimPending()
      expect(reClaimed).toHaveLength(1)
      expect(reClaimed[0].id).toBe(claimed.id)
    })

    it('is a no-op if the item was already removed', async () => {
      // Should not throw.
      await expect(releasePending(99999)).resolves.toBeUndefined()
    })
  })

  describe('removeFromQueue', () => {
    it('drops the item permanently', async () => {
      await enqueueMatch({ tag: 'done' })
      const [claimed] = await claimPending()
      await removeFromQueue(claimed.id)
      expect(await getPendingCount()).toBe(0)
    })
  })
})
