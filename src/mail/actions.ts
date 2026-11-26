import { useMemo } from 'react'
import { useFeedback } from '../components/overlays'
import { invalidate, keys, updateCached, useBackend } from '../data/store'
import type { Project, Tag, ThreadSummary } from '../lib/types'

export const errorText = (error: unknown) => (error instanceof Error ? error.message : 'Something went wrong. Please try again.')

/** Mail actions with feedback, Undo where it makes sense, and fresh lists afterwards. */
export function useMailActions() {
  const backend = useBackend()
  const notify = useFeedback()

  return useMemo(() => {
    const refresh = () => invalidate(keys.threads, 'thread:', keys.projects)
    const patchLists = (id: string, patch: Partial<ThreadSummary>) =>
      updateCached<ThreadSummary[] | ThreadSummary>(keys.threads, (list) => (Array.isArray(list) ? list.map((t) => (t.id === id ? { ...t, ...patch } : t)) : list))
    // Takes a thread out of lists straight away; `everywhere` includes project lists.
    const dropFromLists = (id: string, everywhere: boolean) =>
      updateCached<ThreadSummary[]>(keys.threads, (list, key) => {
        if (!Array.isArray(list)) return list
        if (!everywhere && key.includes('"projectId"')) return list
        return list.filter((t) => t.id !== id)
      })

    async function run(task: () => Promise<unknown>, message?: string, undo?: () => Promise<unknown>) {
      try {
        await task()
        refresh()
        if (message) {
          notify(message, undo ? { action: { label: 'Undo', run: () => void undo().then(refresh, (e) => notify(errorText(e), { tone: 'error' })) } } : undefined)
        }
        return true
      } catch (error) {
        notify(errorText(error), { tone: 'error' })
        refresh()
        return false
      }
    }

    return {
      setTag(thread: ThreadSummary, tag: Tag) {
        patchLists(thread.id, { tag })
        return run(() => backend.setThreadTag(thread.id, tag))
      },
      setProject(thread: ThreadSummary, projectId: string | null, project?: Project) {
        return run(
          // Linked events follow the mail, so calendars refresh too.
          () => backend.setThreadProject(thread.id, projectId).then(() => invalidate(keys.events)),
          projectId ? `Added to ${project?.name ?? 'project'}` : 'Removed from project',
          () => backend.setThreadProject(thread.id, thread.projectId),
        )
      },
      setRead(thread: ThreadSummary, read: boolean) {
        patchLists(thread.id, { unread: !read })
        return run(() => backend.setThreadRead(thread.id, read))
      },
      toggleArchived(thread: ThreadSummary) {
        const archived = !thread.archived
        dropFromLists(thread.id, false)
        return run(() => backend.setThreadArchived(thread.id, archived), archived ? 'Archived' : 'Moved to inbox', () => backend.setThreadArchived(thread.id, !archived))
      },
      trash(thread: ThreadSummary) {
        dropFromLists(thread.id, true)
        return run(() => backend.trashThread(thread.id), 'Moved to trash')
      },
      toggleSpam(thread: ThreadSummary) {
        const spam = !thread.spam
        dropFromLists(thread.id, true)
        return run(() => backend.setThreadSpam(thread.id, spam), spam ? 'Reported as spam' : 'Not spam: moved to inbox', () => backend.setThreadSpam(thread.id, !spam))
      },
      async unsubscribe(thread: ThreadSummary) {
        try {
          const result = await backend.unsubscribe(thread.id)
          if ('open' in result) {
            window.open(result.open, '_blank', 'noopener,noreferrer')
            notify('Finish unsubscribing on the page that just opened')
          } else {
            notify(`Unsubscribed from ${thread.from.name || thread.from.email}`)
          }
          refresh()
        } catch (error) {
          notify(errorText(error), { tone: 'error' })
        }
      },
    }
  }, [backend, notify])
}
