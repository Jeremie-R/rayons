import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import type { Backend } from '../data/backend'
import { liveConfig } from '../data/config'
import { createDemoBackend, resetDemo } from '../data/demoBackend'
import type { Account } from '../lib/types'

type CloudModule = typeof import('./cloud')

export type AuthState =
  | { status: 'loading' }
  | { status: 'signedOut' }
  | { status: 'demo' }
  /** Signed in to Rayons, but Gmail and Calendar aren't connected (or were disconnected). */
  | { status: 'needsGoogle'; userId: string; email: string }
  | { status: 'signedIn'; userId: string; account: Account }

interface AuthValue {
  state: AuthState
  backend: Backend | null
  liveEnabled: boolean
  signInError: string | null
  /** Google refused the stored token: the person needs to sign in again. */
  reconnectNeeded: boolean
  signIn: (options?: { consent?: boolean }) => Promise<void>
  startDemo: () => void
  leaveDemo: () => void
  resetDemoData: () => void
  signOut: () => Promise<void>
  disconnectGoogle: () => Promise<void>
}

const DEMO_KEY = 'rayons:demo-mode'
const AuthContext = createContext<AuthValue | null>(null)

export function useAuth() {
  const value = useContext(AuthContext)
  if (!value) throw new Error('useAuth outside AuthProvider')
  return value
}

const demoChosen = () => {
  try {
    return localStorage.getItem(DEMO_KEY) === '1'
  } catch {
    return false
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>(() => (liveConfig ? { status: 'loading' } : { status: 'demo' }))
  const [cloud, setCloud] = useState<CloudModule | null>(null)
  const [signInError, setSignInError] = useState<string | null>(null)
  const [reconnectNeeded, setReconnectNeeded] = useState(false)
  const [demoGeneration, setDemoGeneration] = useState(0)

  useEffect(() => {
    if (!liveConfig) return
    let cancelled = false
    let unsubscribe = () => {}
    import('./cloud').then(async (mod) => {
      if (cancelled) return
      setCloud(mod)
      try {
        const next = await mod.finishGoogleSignIn()
        if (next && next !== '/') history.replaceState(null, '', next)
      } catch (error) {
        setSignInError(error instanceof Error ? error.message : 'Could not sign in.')
      }
      if (cancelled) return

      const resolve = async (session: import('@supabase/supabase-js').Session | null) => {
        if (!session) {
          setState(demoChosen() ? { status: 'demo' } : { status: 'signedOut' })
          return
        }
        const { data } = await mod.supabase().from('google_accounts').select('email, name, picture, status').eq('user_id', session.user.id).limit(1).maybeSingle()
        if (cancelled) return
        if (!data || data.status === 'reconnect') {
          setState({ status: 'needsGoogle', userId: session.user.id, email: session.user.email ?? '' })
        } else {
          setState({ status: 'signedIn', userId: session.user.id, account: { email: data.email, name: data.name ?? data.email, picture: data.picture ?? undefined } })
        }
      }
      const { data } = await mod.supabase().auth.getSession()
      await resolve(data.session)
      const { data: listener } = mod.supabase().auth.onAuthStateChange((event, session) => {
        // Token refreshes don't change who is signed in.
        if (event === 'SIGNED_IN' || event === 'SIGNED_OUT') void resolve(session)
      })
      const offReconnect = mod.onReconnectNeeded(() => setReconnectNeeded(true))
      unsubscribe = () => {
        listener.subscription.unsubscribe()
        offReconnect()
      }
    })
    return () => {
      cancelled = true
      unsubscribe()
    }
  }, [])

  const demoBackend = useMemo(() => (state.status === 'demo' ? createDemoBackend() : null), [state.status, demoGeneration])

  // The live backend loads only once someone signs in, so the demo never downloads it.
  const userId = state.status === 'signedIn' ? state.userId : null
  const account = state.status === 'signedIn' ? state.account : null
  const [liveBackend, setLiveBackend] = useState<Backend | null>(null)
  useEffect(() => {
    if (!userId || !account) {
      setLiveBackend(null)
      return
    }
    let cancelled = false
    import('../data/liveBackend').then((mod) => {
      if (!cancelled) setLiveBackend(mod.createLiveBackend(userId, account))
    })
    return () => {
      cancelled = true
    }
  }, [userId, account?.email])

  const signIn = useCallback(
    async (options: { consent?: boolean } = {}) => {
      setSignInError(null)
      const mod = cloud ?? (await import('./cloud'))
      await mod.startGoogleSignIn({ consent: options.consent, hint: state.status === 'needsGoogle' ? state.email : undefined })
    },
    [cloud, state],
  )

  const startDemo = useCallback(() => {
    try {
      localStorage.setItem(DEMO_KEY, '1')
    } catch {
      // Demo for this visit only.
    }
    setState({ status: 'demo' })
  }, [])

  const leaveDemo = useCallback(() => {
    try {
      localStorage.removeItem(DEMO_KEY)
    } catch {
      // Nothing stored.
    }
    if (liveConfig) setState({ status: 'signedOut' })
  }, [])

  const resetDemoData = useCallback(() => {
    resetDemo()
    setDemoGeneration((n) => n + 1)
  }, [])

  const signOut = useCallback(async () => {
    if (cloud) await cloud.supabase().auth.signOut()
    setReconnectNeeded(false)
    setState({ status: 'signedOut' })
  }, [cloud])

  const disconnectGoogle = useCallback(async () => {
    if (!cloud) return
    await cloud.api('google/disconnect', {})
    await signOut()
  }, [cloud, signOut])

  return (
    <AuthContext.Provider
      value={{
        state,
        backend: state.status === 'demo' ? demoBackend : liveBackend,
        liveEnabled: !!liveConfig,
        signInError,
        reconnectNeeded,
        signIn,
        startDemo,
        leaveDemo,
        resetDemoData,
        signOut,
        disconnectGoogle,
      }}
    >
      {children}
    </AuthContext.Provider>
  )
}
