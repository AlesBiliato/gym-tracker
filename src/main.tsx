import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { HashRouter } from 'react-router-dom'
import './index.css'
import App from './App'
import { db } from './db/db'
import { ensureSeed } from './db/seed'
import { todayISO } from './domain/format'
import { RestTimerProvider } from './components/RestTimer'
import { initUpdates } from './update'

initUpdates()

// Pide almacenamiento persistente para que iOS/Android no borren IndexedDB.
navigator.storage?.persist?.().catch(() => {})

ensureSeed(db, todayISO()).finally(() => {
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <HashRouter>
        <RestTimerProvider>
          <App />
        </RestTimerProvider>
      </HashRouter>
    </StrictMode>,
  )
})
