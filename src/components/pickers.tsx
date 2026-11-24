import { useState, type ReactNode } from 'react'
import { keys, useBackend, useQuery } from '../data/store'
import { TAG_INFO } from '../lib/tags'
import { TAGS, type Project, type Tag } from '../lib/types'
import { CloseIcon, FolderIcon, PlusIcon } from './icons'
import { Menu, MenuHeading, MenuItem, MenuSeparator } from './overlays'
import { TagDot } from './ui'

type Trigger = Parameters<typeof Menu>[0]['trigger']

/** Choose one of the four tags, or none. */
export function TagPicker({ value, onChange, trigger, label = 'Tag' }: { value: Tag; onChange: (tag: Tag) => void; trigger: Trigger; label?: string }) {
  return (
    <Menu label={label} trigger={trigger} align="start">
      {(close) => (
        <>
          {TAGS.map((tag) => (
            <MenuItem
              key={tag}
              checked={value === tag}
              onSelect={() => {
                onChange(tag)
                close()
              }}
            >
              <span className="menu__tag">
                <TagDot tag={tag} title="" />
                {TAG_INFO[tag].label}
              </span>
            </MenuItem>
          ))}
          <MenuSeparator />
          <MenuItem
            checked={value === null}
            onSelect={() => {
              onChange(null)
              close()
            }}
          >
            <span className="menu__tag">
              <TagDot tag={null} title="" />
              no tag
            </span>
          </MenuItem>
        </>
      )}
    </Menu>
  )
}

/** Attach to a project, start a new one, or detach. */
export function ProjectPicker({
  value,
  onChange,
  trigger,
  label = 'Add to project',
}: {
  value: string | null
  onChange: (projectId: string | null, project?: Project) => void
  trigger: Trigger
  label?: string
}) {
  const backend = useBackend()
  const { data: projects } = useQuery(keys.projects, () => backend.listProjects())
  const active = (projects ?? []).filter((project) => project.status === 'active' || project.id === value)

  return (
    <Menu label={label} trigger={trigger}>
      {(close) => (
        <>
          <MenuHeading>Projects</MenuHeading>
          {active.length === 0 && <p className="menu__note">No projects yet.</p>}
          {active.map((project) => (
            <MenuItem
              key={project.id}
              icon={FolderIcon}
              checked={project.id === value}
              onSelect={() => {
                onChange(project.id, project)
                close()
              }}
            >
              {project.name}
            </MenuItem>
          ))}
          <MenuSeparator />
          <NewProjectItem
            onCreate={async (name) => {
              const project = await backend.createProject(name)
              onChange(project.id, project)
              close()
            }}
          />
          {value && (
            <MenuItem
              icon={CloseIcon}
              onSelect={() => {
                onChange(null)
                close()
              }}
            >
              Remove from project
            </MenuItem>
          )}
        </>
      )}
    </Menu>
  )
}

function NewProjectItem({ onCreate }: { onCreate: (name: string) => Promise<void> }): ReactNode {
  const [editing, setEditing] = useState(false)
  const [name, setName] = useState('')
  const [busy, setBusy] = useState(false)
  if (!editing) {
    return (
      <MenuItem icon={PlusIcon} onSelect={() => setEditing(true)}>
        New project…
      </MenuItem>
    )
  }
  return (
    <form
      className="menu__form"
      onSubmit={async (event) => {
        event.preventDefault()
        if (!name.trim() || busy) return
        setBusy(true)
        try {
          await onCreate(name.trim())
        } finally {
          setBusy(false)
        }
      }}
    >
      <input className="field__input" autoFocus placeholder="Project name" value={name} onChange={(e) => setName(e.target.value)} aria-label="Project name" />
      <button type="submit" className="button button--accent button--sm" disabled={!name.trim() || busy}>
        Create
      </button>
    </form>
  )
}
