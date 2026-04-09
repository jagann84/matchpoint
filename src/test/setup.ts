// Vitest setup — runs once per worker before any test module loads.
//
// fake-indexeddb/auto installs a full in-memory IDB polyfill on the
// global object. Without it, `indexedDB` is undefined in jsdom and
// any test that touches offlineQueue throws at import time.
//
// Each test that cares about IDB state should start from a clean
// database by opening a fresh connection and deleting any prior
// state. See src/lib/offlineQueue.test.ts for the reset helper.
import 'fake-indexeddb/auto'
