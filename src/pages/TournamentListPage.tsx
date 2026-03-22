import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router'
import { supabase } from '../lib/supabase'
import type { Tournament } from '../types/tournament'
import TournamentCard from '../components/tournament-list/TournamentCard'

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

  async function deleteTournament(id: string) {
    const confirmed = window.confirm('Supprimer ce tournoi ?')
    if (!confirmed) return

    const { error } = await supabase
      .from('tt_tournaments')
      .delete()
      .eq('id', id)

    if (!error) {
      setTournaments((prev) => prev.filter((t) => t.id !== id))
    }
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-4xl mx-auto px-6 py-10">
        <div className="flex items-center justify-between mb-8">
          <h1 className="text-2xl font-semibold text-gray-900">Mes Tournois</h1>
          <button
            onClick={createTournament}
            className="inline-flex items-center gap-2 bg-gray-900 text-white px-4 py-2.5 rounded-lg
              text-sm font-medium transition-all duration-200 hover:bg-gray-800 hover:shadow-md
              active:scale-[0.98]"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M10 3a1 1 0 011 1v5h5a1 1 0 110 2h-5v5a1 1 0 11-2 0v-5H4a1 1 0 110-2h5V4a1 1 0 011-1z" clipRule="evenodd" />
            </svg>
            Nouveau Tournoi
          </button>
        </div>

        {loading ? (
          <div className="flex justify-center py-20">
            <div className="h-6 w-6 border-2 border-gray-300 border-t-gray-900 rounded-full animate-spin" />
          </div>
        ) : tournaments.length === 0 ? (
          <div className="text-center py-20">
            <p className="text-gray-400 text-lg">Aucun tournoi</p>
            <p className="text-gray-400 text-sm mt-1">Créez votre premier tournoi pour commencer</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {tournaments.map((t) => (
              <TournamentCard key={t.id} tournament={t} onDelete={deleteTournament} />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
