import { lazy, Suspense } from 'react'
import { Navigate, Route, Routes } from 'react-router-dom'
import { Spinner } from './components/ui'
import { DialogHost } from './components/dialogs'
import ExternalLayout from './components/ExternalLayout'
import InternalLayout from './components/InternalLayout'
import Home from './pages/external/Home'
import Program from './pages/external/Program'
import Kids from './pages/external/Kids'
import Kitchen from './pages/external/Kitchen'

// Interna sidor laddas först när någon loggar in
const Dashboard = lazy(() => import('./pages/internal/Dashboard'))
const Committees = lazy(() => import('./pages/internal/Committees'))
const CommitteePage = lazy(() => import('./pages/internal/CommitteePage'))
const MySchedule = lazy(() => import('./pages/internal/MySchedule'))
const Posts = lazy(() => import('./pages/internal/Posts'))
const Notes = lazy(() => import('./pages/internal/Notes'))
const Purchases = lazy(() => import('./pages/internal/Purchases'))
const Inventory = lazy(() => import('./pages/internal/Inventory'))
const Counting = lazy(() => import('./pages/internal/Counting'))
const Stats = lazy(() => import('./pages/internal/Stats'))
const ProgramAdmin = lazy(() => import('./pages/internal/ProgramAdmin'))
const MenuAdmin = lazy(() => import('./pages/internal/MenuAdmin'))
const KidsAdmin = lazy(() => import('./pages/internal/KidsAdmin'))
const SettingsPage = lazy(() => import('./pages/internal/Settings'))

export default function App() {
  return (
    <Suspense fallback={<Spinner />}>
      <DialogHost />
      <Routes>
        <Route element={<ExternalLayout />}>
          <Route index element={<Home />} />
          <Route path="program" element={<Program />} />
          <Route path="barn" element={<Kids />} />
          <Route path="koket" element={<Kitchen />} />
        </Route>
        <Route path="intern" element={<InternalLayout />}>
          <Route index element={<Dashboard />} />
          <Route path="kommitteer" element={<Committees />} />
          <Route path="kommitteer/:slug" element={<CommitteePage />} />
          <Route path="mitt-schema" element={<MySchedule />} />
          <Route path="info" element={<Posts />} />
          <Route path="anteckningar" element={<Notes />} />
          <Route path="inkop" element={<Purchases />} />
          <Route path="inventarier" element={<Inventory />} />
          <Route path="rakning" element={<Counting />} />
          <Route path="statistik" element={<Stats />} />
          <Route path="program" element={<ProgramAdmin />} />
          <Route path="meny" element={<MenuAdmin />} />
          <Route path="fritids" element={<KidsAdmin />} />
          <Route path="installningar" element={<SettingsPage />} />
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Suspense>
  )
}
