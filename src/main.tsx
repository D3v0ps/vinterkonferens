import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import App from './App'
import { AuthProvider } from './lib/auth'
import { ConferenceProvider } from './lib/conference'
import { initTimeFromUrl } from './lib/time'
import './index.css'

initTimeFromUrl()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter basename={import.meta.env.BASE_URL.replace(/\/$/, '')}>
      <ConferenceProvider>
        <AuthProvider>
          <App />
        </AuthProvider>
      </ConferenceProvider>
    </BrowserRouter>
  </StrictMode>,
)
