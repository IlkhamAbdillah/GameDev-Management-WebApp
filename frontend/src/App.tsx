import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import Layout from './components/Layout'
import ComingSoonPage from './pages/ComingSoonPage'
import TasksPage from './pages/TasksPage'
import TimelinePage from './pages/TimelinePage'

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route element={<Layout />}>
          <Route index element={<Navigate to="/tasks" replace />} />
          <Route path="/assets" element={<ComingSoonPage title="Assets" phase="Phase 4" />} />
          <Route path="/tasks" element={<TasksPage />} />
          <Route path="/timeline" element={<TimelinePage />} />
          <Route path="*" element={<Navigate to="/tasks" replace />} />
        </Route>
      </Routes>
    </BrowserRouter>
  )
}
