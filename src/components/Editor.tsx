import { lazy, Suspense, type Ref } from 'react'
import type { RichEditorHandle, RichEditorProps } from './RichEditor'

// The editor (TipTap) is about as big as the rest of the app, so it loads on its own, shortly
// after start-up, rather than slowing down the first screen.

const load = () => import('./RichEditor')
const Rich = lazy(() => load().then((module) => ({ default: module.RichEditor })))

if (typeof window !== 'undefined') {
  const idle = window.requestIdleCallback ?? ((run: () => void) => window.setTimeout(run, 2000))
  idle(() => void load())
}

export function Editor({ ref, ...props }: RichEditorProps & { ref?: Ref<RichEditorHandle> }) {
  return (
    <Suspense
      fallback={
        <div className={`rich-editor ${props.className ?? ''}`}>
          <div className="rich" aria-busy="true" />
        </div>
      }
    >
      <Rich ref={ref} {...props} />
    </Suspense>
  )
}
