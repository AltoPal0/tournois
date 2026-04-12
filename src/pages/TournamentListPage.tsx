import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import type { Tournament } from '../types/tournament'
import TournamentCard from '../components/tournament-list/TournamentCard'
import { useNavigate } from 'react-router'

export default function TournamentListPage() {
  const navigate = useNavigate()
  const [tournaments, setTournaments] = useState<Tournament[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetchTournaments()
  }, [])

  async function fetchTournaments() {
    const { data, error } = await supabase
      .from('tt_tournaments')
      .select('*')
      .order('updated_at', { ascending: false })

    if (!error && data) {
      setTournaments(data as Tournament[])
    }
    setLoading(false)
  }

  async function createTournament() {
    const { data, error } = await supabase
      .from('tt_tournaments')
      .insert({ name: 'Nouveau Tournoi' })
      .select()
      .single()

    if (!error && data) {
      navigate(`/tournament/${data.id}`)
    }
  }

  return (
    <div className="min-h-screen bg-white">
      {/* Header */}
      <div className="border-b border-gray-100">
        <div className="max-w-5xl mx-auto px-6 py-6 flex items-end justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900 tracking-tight">Mes Tournois</h1>
            <p className="text-sm text-gray-400 mt-0.5">Organisateur</p>
          </div>
          <button
            onClick={createTournament}
            className="inline-flex items-center gap-2 bg-blue-600 text-white px-4 py-2.5 rounded-xl
              text-sm font-medium transition-all duration-200 hover:bg-blue-700 hover:shadow-lg
              hover:shadow-blue-200 active:scale-[0.98]"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M10 3a1 1 0 011 1v5h5a1 1 0 110 2h-5v5a1 1 0 11-2 0v-5H4a1 1 0 110-2h5V4a1 1 0 011-1z" clipRule="evenodd" />
            </svg>
            Nouveau tournoi
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-5xl mx-auto px-6 py-8">
        {loading ? (
          <div className="flex justify-center py-24">
            <div className="h-6 w-6 border-2 border-gray-200 border-t-blue-600 rounded-full animate-spin" />
          </div>
        ) : tournaments.length === 0 ? (
          <div className="text-center py-24">
            <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-yellow-50 flex items-center justify-center">
              <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8 text-yellow-400" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm1-11a1 1 0 10-2 0v2H7a1 1 0 100 2h2v2a1 1 0 102 0v-2h2a1 1 0 100-2h-2V7z" clipRule="evenodd" />
              </svg>
            </div>
            <p className="text-gray-500 font-medium">Aucun tournoi pour l'instant</p>
            <p className="text-gray-400 text-sm mt-1">Créez votre premier tournoi pour commencer</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {tournaments.map((t) => (
              <TournamentCard key={t.id} tournament={t} />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
