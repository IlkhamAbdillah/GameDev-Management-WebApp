import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import ErrorBoundary from './components/ErrorBoundary'
import Layout from './components/Layout'
import AssetsPage from './pages/AssetsPage'
import ConnectivityPage from './pages/ConnectivityPage'
import DocsPage from './pages/DocsPage'
import TasksPage from './pages/TasksPage'
import TimelinePage from './pages/TimelinePage'

export default function App() {
  return (
    <ErrorBoundary>
    <BrowserRouter>
      <Routes>
        <Route element={<Layout />}>
          <Route index element={<Navigate to="/tasks" replace />} />
          <Route path="/assets" element={<AssetsPage />} />
          <Route path="/tasks" element={<TasksPage />} />
          <Route path="/timeline" element={<TimelinePage />} />
          <Route path="/docs" element={<DocsPage />} />
          <Route path="/connectivity" element={<ConnectivityPage />} />
          <Route path="*" element={<Navigate to="/tasks" replace />} />
        </Route>
      </Routes>
    </BrowserRouter>
    </ErrorBoundary>
  )
}
