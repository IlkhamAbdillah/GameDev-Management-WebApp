import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import Layout from './components/Layout'
import ComingSoonPage from './pages/ComingSoonPage'
import TasksPage from './pages/TasksPage'

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route element={<Layout />}>
          <Route index element={<Navigate to="/tasks" replace />} />
          <Route path="/assets" element={<ComingSoonPage title="Assets" phase="Phase 4" />} />
          <Route path="/tasks" element={<TasksPage />} />
          <Route path="/timeline" element={<ComingSoonPage title="Timeline" phase="Phase 3" />} />
          <Route path="*" element={<Navigate to="/tasks" replace />} />
        </Route>
      </Routes>
    </BrowserRouter>
  )
}
