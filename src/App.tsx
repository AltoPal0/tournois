import { BrowserRouter, Routes, Route } from 'react-router'
import TournamentListPage from './pages/TournamentListPage'
import TournamentEditorPage from './pages/TournamentEditorPage'

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<TournamentListPage />} />
        <Route path="/tournament/:id" element={<TournamentEditorPage />} />
      </Routes>
    </BrowserRouter>
  )
}
