import { StrictMode, type ReactNode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import App from './App'
import { apiReady } from './lib/api'
import { AuthProvider } from './lib/auth'
import { ConferenceProvider } from './lib/conference'
import { ArtifactRouter } from './lib/hashRouter'
import { isArtifact } from './lib/platform'
import { initTimeFromUrl } from './lib/time'
import './index.css'

initTimeFromUrl()

function Router({ children }: { children: ReactNode }) {
  if (isArtifact) return <ArtifactRouter>{children}</ArtifactRouter>
  return <BrowserRouter basename={import.meta.env.BASE_URL.replace(/\/$/, '')}>{children}</BrowserRouter>
}

apiReady.finally(() => {
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <Router>
        <ConferenceProvider>
          <AuthProvider>
            <App />
          </AuthProvider>
        </ConferenceProvider>
      </Router>
    </StrictMode>,
  )
})
