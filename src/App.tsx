import { BrowserRouter, Routes, Route } from 'react-router'
import LandingPage from './pages/LandingPage'
import TournamentListPage from './pages/TournamentListPage'
import TournamentEditorPage from './pages/TournamentEditorPage'
import TournamentMatchesPage from './pages/TournamentMatchesPage'
import CourtSchedulePage from './pages/CourtSchedulePage'
import LiveBoardPage from './pages/LiveBoardPage'

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<LandingPage />} />
        <Route path="/steph" element={<TournamentListPage />} />
        <Route path="/tournament/:id" element={<TournamentEditorPage />} />
        <Route path="/tournament/:id/matches" element={<TournamentMatchesPage />} />
        <Route path="/tournament/:id/schedule" element={<CourtSchedulePage />} />
        <Route path="/tournament/:id/board" element={<LiveBoardPage />} />
      </Routes>
    </BrowserRouter>
  )
}
