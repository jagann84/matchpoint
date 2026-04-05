import { NavLink, Outlet, Link } from 'react-router-dom'
import { LayoutDashboard, PlusCircle, List, Users, Settings, LogOut, Calendar } from 'lucide-react'
import { useAuth } from '../contexts/AuthContext'

const navItems = [
  { to: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { to: '/log-match', label: 'Log Match', icon: PlusCircle },
  { to: '/history', label: 'History', icon: List },
  { to: '/calendar', label: 'Calendar', icon: Calendar },
  { to: '/players', label: 'Players', icon: Users },
  { to: '/settings', label: 'Settings', icon: Settings },
]

export default function AppLayout() {
  const { signOut } = useAuth()

  return (
    <div className="min-h-screen bg-gray-50 flex">
      {/* Desktop sidebar */}
      <aside className="hidden md:flex flex-col w-56 bg-white border-r border-gray-200 fixed h-full">
        <div className="px-5 py-6">
          <Link to="/dashboard" className="text-xl font-bold text-gray-900 hover:opacity-80 transition-opacity">
            Match<span className="text-green-600">Point</span>
          </Link>
        </div>
        <nav className="flex-1 px-3 space-y-1" aria-label="Main navigation">
          {navItems.map(({ to, label, icon: Icon }) => (
            <NavLink
              key={to}
              to={to}
              className={({ isActive }) =>
                `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-green-500 ${
                  isActive
                    ? 'bg-green-50 text-green-700'
                    : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
                }`
              }
            >
              <Icon size={20} aria-hidden="true" />
              {label}
            </NavLink>
          ))}
        </nav>
        <div className="px-3 pb-6">
          <button
            onClick={signOut}
            className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-gray-600 hover:bg-red-50 hover:text-red-600 transition-colors w-full focus:outline-none focus-visible:ring-2 focus-visible:ring-red-500"
          >
            <LogOut size={20} aria-hidden="true" />
            Sign Out
          </button>
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 md:ml-56 pb-20 md:pb-0 overflow-x-hidden">
        <Outlet />
      </main>

      {/* Mobile bottom nav */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 flex justify-around items-center h-16 z-50" aria-label="Main navigation">
        {navItems.map(({ to, label, icon: Icon }) => (
          <NavLink
            key={to}
            to={to}
            className={({ isActive }) =>
              `flex flex-col items-center gap-0.5 text-[11px] font-medium py-1 px-2 min-w-[56px] min-h-[44px] justify-center focus:outline-none focus-visible:ring-2 focus-visible:ring-green-500 rounded-lg ${
                isActive ? 'text-green-600' : 'text-gray-500'
              }`
            }
          >
            <Icon size={22} aria-hidden="true" />
            {label}
          </NavLink>
        ))}
      </nav>
    </div>
  )
}
