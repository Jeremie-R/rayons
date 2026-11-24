import './styles/tokens.css'
import './styles/base.css'
import './styles/components.css'
import './styles/layout.css'
import './styles/mail.css'
import './styles/projects.css'
import './styles/calendar.css'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from './App'
import { AuthProvider } from './auth/AuthProvider'
import { FeedbackProvider } from './components/overlays'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AuthProvider>
      <FeedbackProvider>
        <App />
      </FeedbackProvider>
    </AuthProvider>
  </StrictMode>,
)
