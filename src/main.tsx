import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)

// Register service worker for PWA support.
//
// We also poll registration.update() so long-lived tabs (leave the app
// open on desktop for hours) actually notice new deploys without
// requiring a manual refresh. The browser does this on its own, but
// only on navigation events and at most every 24 hours — not enough
// for an app the user keeps pinned. Polling every 30 minutes is cheap
// (it's a single HEAD-ish request to /sw.js) and gives the UpdatePrompt
// component something to latch onto.
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').then((reg) => {
      setInterval(() => {
        reg.update().catch(() => { /* offline, transient — ignore */ })
      }, 30 * 60 * 1000)
    }).catch(() => {
      // SW registration failed — app still works without it
    })
  })
}
