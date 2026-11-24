import type { ReactNode } from 'react'
import { NavLink, Outlet, useLocation } from 'react-router'
import { useIsMobile } from '../lib/hooks'
import { CalendarIcon, InboxIcon, ProjectsIcon, UserIcon } from './icons'
import type { IconComponent } from './ui'

const NAV: { to: string; label: string; icon: IconComponent }[] = [
  { to: '/inbox', label: 'Inbox', icon: InboxIcon },
  { to: '/calendar', label: 'Calendar', icon: CalendarIcon },
  { to: '/projects', label: 'Projects', icon: ProjectsIcon },
]
const ACCOUNT = { to: '/you', label: 'You', icon: UserIcon }

/** Desktop: a 64px rail on the left. Phone: a tab bar at the bottom, hidden on detail screens. */
export function Shell({ banner }: { banner?: ReactNode }) {
  const mobile = useIsMobile()
  const { pathname } = useLocation()
  const detail = /^\/(inbox|projects)\/[^/]+/.test(pathname)

  return (
    <div className={`shell ${mobile ? 'shell--mobile' : ''} ${mobile && detail ? 'shell--detail' : ''}`}>
      {!mobile && (
        <nav className="rail" aria-label="Main">
          {NAV.map((item) => (
            <RailLink key={item.to} {...item} />
          ))}
          <span className="rail__spacer" />
          <RailLink {...ACCOUNT} />
        </nav>
      )}
      <div className="shell__main">
        {banner}
        <Outlet />
      </div>
      {mobile && !detail && (
        <nav className="tabbar" aria-label="Main">
          {[...NAV, ACCOUNT].map(({ to, label, icon: Icon }) => (
            <NavLink key={to} to={to} className="tabbar__item">
              <Icon size={20} />
              <span>{label}</span>
            </NavLink>
          ))}
        </nav>
      )}
    </div>
  )
}

function RailLink({ to, label, icon: Icon }: { to: string; label: string; icon: IconComponent }) {
  return (
    <NavLink to={to} className="rail__item" aria-label={label} title={label}>
      <Icon size={16} />
    </NavLink>
  )
}
