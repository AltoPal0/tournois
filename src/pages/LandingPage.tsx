import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import type { Tournament } from '../types/tournament'
import TournamentPublicCard from '../components/TournamentPublicCard'

export default function LandingPage() {
  const [tournaments, setTournaments] = useState<Tournament[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    supabase
      .from('tt_tournaments')
      .select('*')
      .in('status', ['configured', 'active'])
      .order('updated_at', { ascending: false })
      .then(({ data }) => {
        setTournaments((data as Tournament[]) ?? [])
        setLoading(false)
      })
  }, [])

  return (
    <div className="min-h-screen bg-[#0d1b2a] flex flex-col items-center px-6 py-12">
      {/* Header */}
      <div className="flex flex-col items-center mb-12">
        <img
          src="/logo-padel.JPG"
          alt="Padel"
          className="w-20 h-20 rounded-2xl object-cover mb-6 shadow-2xl"
        />
        <h1 className="text-2xl font-bold text-white tracking-tight">
          Padel Tournois
        </h1>
      </div>

      {/* Contenu */}
      {loading ? (
        <div className="flex items-center gap-2 text-gray-400 text-sm">
          <div className="h-4 w-4 border-2 border-gray-600 border-t-gray-300 rounded-full animate-spin" />
          Chargement…
        </div>
      ) : tournaments.length === 0 ? (
        <p className="text-gray-400 text-sm text-center max-w-xs">
          Aucun tournoi en cours pour le moment.
        </p>
      ) : (
        <div className={`flex flex-wrap justify-center gap-6 w-full max-w-3xl`}>
          {tournaments.map((t) => (
            <TournamentPublicCard key={t.id} tournament={t} />
          ))}
        </div>
      )}
    </div>
  )
}
