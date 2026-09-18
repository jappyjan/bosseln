import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { registerSW } from 'virtual:pwa-register'
import App from './App'
import './index.css'

const container = document.getElementById('root')
if (container) {
  createRoot(container).render(
    <StrictMode>
      <App />
    </StrictMode>,
  )
}

// offline-first: the service worker keeps the whole app on the device
registerSW({ immediate: true })

/** keep the layout stable when the mobile keyboard opens */
window.addEventListener('focusout', () => {
  window.scrollTo({ top: window.scrollY })
})
