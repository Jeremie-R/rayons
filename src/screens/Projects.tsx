import { useState } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router'
import { AddToProjectIcon, FilterIcon, ProjectsIcon } from '../components/icons'
import { Dialog, Menu, MenuHeading, MenuItem, MenuSeparator, useFeedback } from '../components/overlays'
import { Button, EmptyState, ErrorNote, IconButton, Loading, TagDot, TagDots } from '../components/ui'
import { invalidate, keys, useBackend, useQuery } from '../data/store'
import { useIsMobile } from '../lib/hooks'
import { TAG_INFO } from '../lib/tags'
import { TAGS, type Project, type TagId } from '../lib/types'
import { errorText } from '../mail/actions'
import { ThreadView } from '../mail/ThreadView'
import { ProjectDetail } from './ProjectDetail'

type Sort = 'recent' | 'name'

export function ProjectsScreen() {
  const backend = useBackend()
  const navigate = useNavigate()
  const mobile = useIsMobile()
  const { projectId, threadId } = useParams()
  const [params, setParams] = useSearchParams()
  const showArchived = params.get('archived') === '1'
  const [sort, setSort] = useState<Sort>('recent')
  const [tag, setTag] = useState<TagId | null>(null)
  const [creating, setCreating] = useState(false)
  const { data, error, reload } = useQuery(keys.projects, () => backend.listProjects())

  const projects = (data ?? [])
    .filter((p) => (showArchived ? p.status === 'archived' : p.status === 'active'))
    .filter((p) => !tag || p.tags.includes(tag))
    .sort((a, b) => (sort === 'name' ? a.name.localeCompare(b.name) : b.updatedAt.localeCompare(a.updatedAt)))
  const archivedWithNews = (data ?? []).filter((p) => p.status === 'archived' && p.unreadCount > 0).length

  const query = params.size ? `?${params}` : ''
  // On a phone, a conversation opened from a project gets the whole screen.
  if (mobile && projectId && threadId) {
    return (
      <div className="split">
        <section className="detail-pane">
          <ThreadView threadId={threadId} onBack={() => navigate(`/projects/${projectId}${query}`)} onGone={() => navigate(`/projects/${projectId}${query}`)} />
        </section>
      </div>
    )
  }

  const showList = !mobile || !projectId
  return (
    <div className="split">
      {showList && (
        <section className="list-pane" aria-label="Projects">
          <header className="list-pane__header list-pane__header--compact">
            <div className="list-pane__title">
              <h1>{showArchived ? 'Archived projects' : 'Projects'}</h1>
              <Menu label="Sort and filter" trigger={(props) => <IconButton {...props} icon={FilterIcon} label="Sort and filter" active={!!tag} />}>
                {(close) => (
                  <>
                    <MenuHeading>Sort</MenuHeading>
                    <MenuItem checked={sort === 'recent'} onSelect={() => (setSort('recent'), close())}>
                      Recently active
                    </MenuItem>
                    <MenuItem checked={sort === 'name'} onSelect={() => (setSort('name'), close())}>
                      Name
                    </MenuItem>
                    <MenuSeparator />
                    <MenuHeading>With tag</MenuHeading>
                    {TAGS.map((t) => (
                      <MenuItem key={t} checked={tag === t} onSelect={() => (setTag(tag === t ? null : t), close())}>
                        <span className="menu__tag">
                          <TagDot tag={t} title="" />
                          {TAG_INFO[t].label}
                        </span>
                      </MenuItem>
                    ))}
                  </>
                )}
              </Menu>
              <IconButton icon={AddToProjectIcon} label="New project" variant="round" onClick={() => setCreating(true)} />
            </div>
          </header>
          <div className="list-pane__body">
            {error && !data ? (
              <ErrorNote error={error} onRetry={reload} />
            ) : !data ? (
              <Loading label="Loading projects" />
            ) : projects.length === 0 ? (
              <EmptyState title={showArchived ? 'No archived projects' : tag ? `No projects with ${tag}` : 'No projects yet'} icon={ProjectsIcon}>
                {!showArchived && !tag && 'A project gathers the mail, events, files and notes about one thing in your life.'}
              </EmptyState>
            ) : (
              <ul className="project-list" role="list">
                {projects.map((project) => (
                  <li key={project.id}>
                    <button
                      type="button"
                      className={`project-row ${project.id === projectId ? 'is-selected' : ''}`}
                      aria-current={project.id === projectId ? 'true' : undefined}
                      onClick={() => navigate(`/projects/${project.id}${query}`)}
                    >
                      <span className="project-row__name">{project.name}</span>
                      {project.unreadCount > 0 && (
                        <span className="count-badge" title={`${project.unreadCount} unread`}>
                          {project.unreadCount} new
                        </span>
                      )}
                      <TagDots tags={project.tags} />
                    </button>
                  </li>
                ))}
              </ul>
            )}
            <div className="list-pane__footer">
              <Button onClick={() => setParams(showArchived ? {} : { archived: '1' }, { replace: true })}>
                {showArchived ? 'show active' : 'show archived'}
                {!showArchived && archivedWithNews > 0 && <span className="count-dot" aria-label={`${archivedWithNews} archived with new mail`} />}
              </Button>
            </div>
          </div>
        </section>
      )}

      {(!mobile || projectId) && (
        <section className="detail-pane" aria-label="Project">
          {projectId ? (
            <ProjectDetail key={projectId} projectId={projectId} threadId={threadId} onBack={() => navigate(`/projects${query}`)} />
          ) : (
            <EmptyState title="Pick a project" icon={ProjectsIcon}>
              Or start a new one. Add mail to a project from any conversation, with the{' '}
              <AddToProjectIcon size={16} style={{ display: 'inline', verticalAlign: '-3px' }} aria-label="add to project" /> button.
            </EmptyState>
          )}
        </section>
      )}

      <NewProjectDialog open={creating} onClose={() => setCreating(false)} onCreated={(project) => navigate(`/projects/${project.id}`)} />
    </div>
  )
}

function NewProjectDialog({ open, onClose, onCreated }: { open: boolean; onClose: () => void; onCreated: (project: Project) => void }) {
  const backend = useBackend()
  const notify = useFeedback()
  const [name, setName] = useState('')
  const [busy, setBusy] = useState(false)
  const submit = async () => {
    if (!name.trim() || busy) return
    setBusy(true)
    try {
      const project = await backend.createProject(name.trim())
      invalidate(keys.projects)
      setName('')
      onClose()
      onCreated(project)
    } catch (error) {
      notify(errorText(error), { tone: 'error' })
    } finally {
      setBusy(false)
    }
  }
  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="New project"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="accent" onClick={submit} disabled={!name.trim() || busy}>
            Create
          </Button>
        </>
      }
    >
      <form
        onSubmit={(e) => {
          e.preventDefault()
          void submit()
        }}
      >
        <label className="field">
          <span className="field__label">Name</span>
          <input className="field__input field__input--title" autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="House move, Lisbon trip…" />
        </label>
      </form>
    </Dialog>
  )
}
