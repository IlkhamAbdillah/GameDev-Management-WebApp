import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import AuthProvider from './components/AuthProvider'
import ErrorBoundary from './components/ErrorBoundary'
import Layout from './components/Layout'
import RequireAuth from './components/RequireAuth'
import AssetsPage from './pages/AssetsPage'
import ConnectivityPage from './pages/ConnectivityPage'
import DashboardPage from './pages/DashboardPage'
import DocsPage from './pages/DocsPage'
import LoginPage from './pages/LoginPage'
import TeamPage from './pages/TeamPage'
import TasksPage from './pages/TasksPage'
import TimelinePage from './pages/TimelinePage'

export default function App() {
  return (
    <ErrorBoundary>
    <AuthProvider>
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route element={<Layout />}>
          <Route index element={<Navigate to="/dashboard" replace />} />
          <Route element={<RequireAuth />}>
            <Route path="/dashboard" element={<DashboardPage />} />
            <Route path="/assets" element={<AssetsPage />} />
            <Route path="/tasks" element={<TasksPage />} />
            <Route path="/timeline" element={<TimelinePage />} />
          </Route>
          <Route element={<RequireAuth manager />}>
            <Route path="/team" element={<TeamPage />} />
          </Route>
          <Route path="/docs" element={<DocsPage />} />
          <Route path="/connectivity" element={<ConnectivityPage />} />
          <Route path="*" element={<Navigate to="/dashboard" replace />} />
        </Route>
      </Routes>
    </BrowserRouter>
    </AuthProvider>
    </ErrorBoundary>
  )
}
