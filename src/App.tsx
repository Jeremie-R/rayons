import { BrowserRouter, Navigate, Route, Routes } from 'react-router'
import { useAuth } from './auth/AuthProvider'
import { Shell } from './components/Shell'
import { Button } from './components/ui'
import { BackendProvider } from './data/store'
import { CalendarScreen } from './screens/Calendar'
import { InboxScreen } from './screens/Inbox'
import { ProjectsScreen } from './screens/Projects'
import { Welcome } from './screens/Welcome'
import { YouScreen } from './screens/You'

export function App() {
  const { state, backend, reconnectNeeded, signIn } = useAuth()

  if (state.status === 'loading') return <div className="splash" aria-busy="true" />
  if (state.status === 'signedOut' || state.status === 'needsGoogle') return <Welcome />
  if (!backend) return <div className="splash" aria-busy="true" />

  const banner = reconnectNeeded ? (
    <div className="banner-bar" role="alert">
      <span>Google needs you to sign in again before Rayons can show your mail and calendar.</span>
      <Button variant="accent" onClick={() => signIn({ consent: true })}>
        Sign in again
      </Button>
    </div>
  ) : undefined

  return (
    <BackendProvider backend={backend}>
      <BrowserRouter>
        <Routes>
          <Route element={<Shell banner={banner} />}>
            <Route index element={<Navigate to="/inbox" replace />} />
            <Route path="inbox/:threadId?" element={<InboxScreen />} />
            <Route path="calendar" element={<CalendarScreen />} />
            <Route path="projects/:projectId?" element={<ProjectsScreen />} />
            <Route path="projects/:projectId/mail/:threadId" element={<ProjectsScreen />} />
            <Route path="you/:section?" element={<YouScreen />} />
            <Route path="*" element={<Navigate to="/inbox" replace />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </BackendProvider>
  )
}
