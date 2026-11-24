import type { TagId } from '../src/lib/types.js'
import { projectEventTags } from './calendar.js'
import { inParallel, type Google } from './google.js'
import { projectMailStats, projectsOf } from './mail.js'
import { adminClient } from './supabase.js'

const ORDER: TagId[] = ['admin', 'event', 'buy', 'knowledge']

/**
 * Re-counts a project's rolled-up tags and unread mail, and stores them on the project row
 * so the project list loads without asking Google.
 */
export async function refreshProjects(google: Google, userId: string, projectIds?: string[]) {
  const projects = (await projectsOf(userId)).filter((p) => !projectIds || projectIds.includes(p.id))
  await inParallel(projects, 3, async (project) => {
    const [mail, eventTags] = await Promise.all([projectMailStats(google, project), projectEventTags(google, project.id)])
    const tags = ORDER.filter((tag) => mail.tags.includes(tag) || eventTags.includes(tag))
    // The table's trigger leaves updated_at alone: counts changing isn't the project changing.
    const { error } = await adminClient().from('projects').update({ tags, unread_count: mail.unread }).eq('id', project.id)
    if (error) throw error
  })
}

/** Marks a project as recently active (mail or an event was added to it). */
export async function touchProjects(projectIds: (string | null | undefined)[]) {
  const ids = projectIds.filter((id): id is string => !!id)
  if (ids.length) await adminClient().from('projects').update({ updated_at: new Date().toISOString() }).in('id', ids)
}
