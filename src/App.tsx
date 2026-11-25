import { NavLink, Route, Routes } from 'react-router-dom'
import TodayPage from './pages/TodayPage'
import SessionPage from './pages/SessionPage'
import SummaryPage from './pages/SummaryPage'
import TemplatesPage from './pages/TemplatesPage'
import TemplateEditorPage from './pages/TemplateEditorPage'
import CatalogPage from './pages/CatalogPage'
import ProgressPage from './pages/ProgressPage'
import WeekPage from './pages/WeekPage'
import MorePage from './pages/MorePage'

const TABS = [
  { to: '/', label: 'Hoy', icon: '🏋️', end: true },
  { to: '/semana', label: 'Semana', icon: '📅' },
  { to: '/progreso', label: 'Progreso', icon: '📈' },
  { to: '/plantillas', label: 'Plantillas', icon: '📋' },
  { to: '/mas', label: 'Más', icon: '⚙️' },
]

export default function App() {
  return (
    <div className="mx-auto min-h-dvh max-w-md pb-[calc(9rem+env(safe-area-inset-bottom))]">
      <Routes>
        <Route path="/" element={<TodayPage />} />
        <Route path="/sesion/:id" element={<SessionPage />} />
        <Route path="/sesion/:id/resumen" element={<SummaryPage />} />
        <Route path="/semana" element={<WeekPage />} />
        <Route path="/progreso" element={<ProgressPage />} />
        <Route path="/plantillas" element={<TemplatesPage />} />
        <Route path="/plantillas/:id" element={<TemplateEditorPage />} />
        <Route path="/catalogo" element={<CatalogPage />} />
        <Route path="/mas" element={<MorePage />} />
      </Routes>
      <nav className="fixed inset-x-0 bottom-0 z-30 border-t border-slate-200 bg-white/95 pb-[env(safe-area-inset-bottom)] backdrop-blur dark:border-slate-800 dark:bg-slate-900/95">
        <div className="mx-auto grid max-w-md grid-cols-5">
          {TABS.map((t) => (
            <NavLink
              key={t.to}
              to={t.to}
              end={t.end}
              className={({ isActive }) =>
                `flex min-h-[4.5rem] flex-col items-center justify-center gap-0.5 text-xs font-semibold ${
                  isActive ? 'text-sky-500' : 'text-slate-500 dark:text-slate-400'
                }`
              }
            >
              <span className="text-2xl leading-none">{t.icon}</span>
              {t.label}
            </NavLink>
          ))}
        </div>
      </nav>
    </div>
  )
}
