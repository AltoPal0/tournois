import { BrowserRouter, Routes, Route } from 'react-router'
import TournamentListPage from './pages/TournamentListPage'
import TournamentEditorPage from './pages/TournamentEditorPage'
import TournamentMatchesPage from './pages/TournamentMatchesPage'
import CourtSchedulePage from './pages/CourtSchedulePage'

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<TournamentListPage />} />
        <Route path="/tournament/:id" element={<TournamentEditorPage />} />
        <Route path="/tournament/:id/matches" element={<TournamentMatchesPage />} />
        <Route path="/tournament/:id/schedule" element={<CourtSchedulePage />} />
      </Routes>
    </BrowserRouter>
  )
}
