import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { useAuth } from '../lib/authContext'

/** Route guard. `manager` additionally requires the project-manager role. */
export default function RequireAuth({ manager = false }: { manager?: boolean }) {
  const { user, isManager } = useAuth()
  const location = useLocation()
  if (!user) return <Navigate to="/login" replace state={{ from: location.pathname + location.search }} />
  if (manager && !isManager) return <Navigate to="/dashboard" replace />
  return <Outlet />
}
