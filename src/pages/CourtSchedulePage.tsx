import { useEffect, useRef, useState } from 'react'
import { useParams, useNavigate } from 'react-router'
import { useTournamentStore } from '../store/tournamentStore'
import { useMatchStore } from '../store/matchStore'
import { supabase } from '../lib/supabase'
import type { Match } from '../types/tournament'

const PPM = 3 // pixels per minute — 30min = 90px, assez pour 3 lignes
const MIN_TIME = 9 * 60 // 09:00 in minutes
const COL_W = 220 // column width in px
const AXIS_W = 56 // time axis width in px
const HEADER_H = 44 // column header height in px

function toMinutes(horaire: string): number {
  const m = horaire.match(/T(\d{2}):(\d{2})/) ?? horaire.match(/^(\d{2}):(\d{2})/)
  if (!m) return MIN_TIME
  return parseInt(m[1]) * 60 + parseInt(m[2])
}

function fmtTime(minutes: number): string {
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
}

function buildHoraire(minutes: number, datePart: string): string {
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  return `${datePart}T${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:00`
}

// "Tour 1 Match 3 de Poule A" → "Match 3" ; "Quart de finale 1 de …" → "QF 1" etc.
function matchLabel(nom: string, ordre: number): string {
  if (/^Quart de finale/.test(nom)) return nom.replace(/^Quart de finale (\d+).+/, 'QF $1')
  if (/^Demi-finale/.test(nom)) return nom.replace(/^Demi-finale (\d+).+/, 'SF $1')
  if (/^Finale/.test(nom)) return 'Finale'
  return `Match ${ordre}`
}

// Abrège un label d'équipe : "2ème de Poule B" → "2ème P.B", "1er de Groupe UP 1" → "1er UP 1"
function abbrevLabel(label: string): string {
  return label
    .replace(/Vainqueur /g, 'W ')
    .replace(/Quart de finale /g, 'QF')
    .replace(/Demi-finale /g, 'SF')
    .replace(/Finale de /g, 'F ')
    .replace(/ de Groupe /g, ' ')
    .replace(/ de Tableau Final /g, ' TF')
    .replace(/ de Tableau /g, ' T.')
    .replace(/ de Poule /g, ' P.')
    .replace(/ de Tournante /g, ' Tn.')
    .replace(/Groupe /g, '')
    .replace(/Poule /g, 'P.')
    .replace(/Tableau Final /g, 'TF')
    .replace(/Tableau /g, 'T.')
}

export default function CourtSchedulePage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()

  const loadTournament = useTournamentStore((s) => s.loadTournament)
  const tournamentConfig = useTournamentStore((s) => s.tournamentConfig)
  const nodes = useTournamentStore((s) => s.nodes)
  const tournamentName = useTournamentStore((s) => s.tournamentName)
  const resetTournament = useTournamentStore((s) => s.reset)

  const matches = useMatchStore((s) => s.matches)
  const isLoading = useMatchStore((s) => s.isLoading)
  const loadMatches = useMatchStore((s) => s.loadMatches)
  const updateMatchPiste = useMatchStore((s) => s.updateMatchPiste)
  const updateMatchHoraire = useMatchStore((s) => s.updateMatchHoraire)
  const resetMatches = useMatchStore((s) => s.reset)

  const gridRef = useRef<HTMLDivElement>(null)
  const draggingRef = useRef<{ matchId: string; slotMin: number; matchMin: number } | null>(null)

  const [dragging, setDragging] = useState<{ matchId: string; slotMin: number; matchMin: number } | null>(null)
  const [preview, setPreview] = useState<{ piste: number; startMin: number } | null>(null)
  const [invalidPiste, setInvalidPiste] = useState<number | null>(null)
  const [updating, setUpdating] = useState<string | null>(null)
  const [teamNames, setTeamNames] = useState<Record<string, string>>({})

  useEffect(() => {
    if (!id) return
    loadTournament(id)
    loadMatches(id)
    return () => {
      resetTournament()
      resetMatches()
    }
  }, [id, loadTournament, loadMatches, resetTournament, resetMatches])

  // Charge les noms des joueurs pour toutes les équipes présentes
  useEffect(() => {
    const teamIds = [...new Set(
      matches.flatMap((m) => [m.equipe1_id, m.equipe2_id].filter((x): x is string => x != null))
    )]
    if (!teamIds.length) return
    ;(async () => {
      const { data: teams } = await supabase
        .from('tt_teams')
        .select('id, joueur1_id, joueur2_id')
        .in('id', teamIds)
      if (!teams?.length) return
      const joueurIds = [...new Set(teams.flatMap((t) => [t.joueur1_id, t.joueur2_id]))]
      const { data: joueurs } = await supabase
        .from('tt_joueurs')
        .select('id, prenom')
        .in('id', joueurIds)
      if (!joueurs) return
      const jMap = Object.fromEntries(joueurs.map((j) => [j.id, j.prenom as string]))
      const map: Record<string, string> = {}
      teams.forEach((t) => { map[t.id] = `${jMap[t.joueur1_id] ?? '?'} / ${jMap[t.joueur2_id] ?? '?'}` })
      setTeamNames(map)
    })()
  }, [matches])

  // Duration maps per phase node
  const matchDurMap: Record<string, number> = {}
  const slotDurMap: Record<string, number> = {}
  nodes.forEach((n) => {
    const cfg = n.data.config
    matchDurMap[n.id] = cfg.dureeMatch ?? 60
    slotDurMap[n.id] = (cfg.dureeMatch ?? 60) + (cfg.reposMatch ?? 0)
  })

  // Construit la ligne d'équipes d'une carte
  function getTeamLine(m: Match): string {
    const t1 = m.equipe1_id ? (teamNames[m.equipe1_id] ?? '…') : m.equipe1_label ? abbrevLabel(m.equipe1_label) : null
    const t2 = m.equipe2_id ? (teamNames[m.equipe2_id] ?? '…') : m.equipe2_label ? abbrevLabel(m.equipe2_label) : null
    if (!t1 && !t2) return ''
    if (t1 && t2) {
      // Si les deux équipes ont des IDs (vraies équipes), on utilise "vs."
      // Si ce sont des labels (positions), on utilise "/"
      const sep = m.equipe1_id ? ' vs. ' : ' / '
      return `${t1}${sep}${t2}`
    }
    return t1 ?? t2 ?? ''
  }

  // Nom court de la phase à partir du node
  function getPhaseName(m: Match): string {
    return nodes.find((n) => n.id === m.phase_node_id)?.data.config.name ?? ''
  }

  const pistes = tournamentConfig.pistes ?? []
  const scheduled = matches.filter((m) => m.horaire != null && m.piste != null)

  // Determine the date part for horaire reconstruction
  const datePart =
    tournamentConfig.matchDate ??
    scheduled[0]?.horaire?.slice(0, 10) ??
    new Date().toISOString().slice(0, 10)

  // Compute grid height — toujours jusqu'à minuit minimum
  let maxTime = 24 * 60
  scheduled.forEach((m) => {
    const end = toMinutes(m.horaire!) + (slotDurMap[m.phase_node_id] ?? 60)
    if (end > maxTime) maxTime = end
  })
  const gridH = (maxTime - MIN_TIME) * PPM

  // Time axis ticks every 30 minutes
  const ticks: number[] = []
  for (let t = MIN_TIME; t <= maxTime; t += 30) ticks.push(t)

  function getMatchDur(m: Match) { return matchDurMap[m.phase_node_id] ?? 60 }
  function getSlotDur(m: Match) { return slotDurMap[m.phase_node_id] ?? 60 }

  function isAvailable(matchId: string, targetPiste: number, targetStart: number): boolean {
    const dm = matches.find((m) => m.id === matchId)
    if (!dm) return false
    const targetEnd = targetStart + getSlotDur(dm)
    return !scheduled
      .filter((m) => m.id !== matchId && m.piste === targetPiste)
      .some((m) => {
        const s = toMinutes(m.horaire!)
        const e = s + getSlotDur(m)
        return targetStart < e && targetEnd > s
      })
  }

  function snappedMinutes(clientY: number): number {
    if (!gridRef.current) return MIN_TIME
    const rect = gridRef.current.getBoundingClientRect()
    const rawMin = MIN_TIME + (clientY - rect.top) / PPM
    return Math.max(MIN_TIME, Math.round(rawMin / 5) * 5)
  }

  function handleDragStart(e: React.DragEvent, match: Match) {
    e.dataTransfer.effectAllowed = 'move'
    e.dataTransfer.setData('matchId', match.id)
    const d = { matchId: match.id, slotMin: getSlotDur(match), matchMin: getMatchDur(match) }
    draggingRef.current = d
    setDragging(d)
  }

  function handleDragEnd() {
    draggingRef.current = null
    setDragging(null)
    setPreview(null)
    setInvalidPiste(null)
  }

  function handleDragOver(e: React.DragEvent, piste: number) {
    e.preventDefault()
    const d = draggingRef.current
    if (!d) return
    const snapped = snappedMinutes(e.clientY)
    const valid = isAvailable(d.matchId, piste, snapped)
    setPreview({ piste, startMin: snapped })
    setInvalidPiste(valid ? null : piste)
    e.dataTransfer.dropEffect = valid ? 'move' : 'none'
  }

  function handleDragLeave(piste: number) {
    if (preview?.piste === piste) {
      setPreview(null)
      setInvalidPiste(null)
    }
  }

  async function handleDrop(e: React.DragEvent, piste: number) {
    e.preventDefault()
    const matchId = e.dataTransfer.getData('matchId')
    if (!matchId) return
    const snapped = snappedMinutes(e.clientY)
    setPreview(null)
    setDragging(null)
    draggingRef.current = null

    if (!isAvailable(matchId, piste, snapped)) {
      setInvalidPiste(piste)
      setTimeout(() => setInvalidPiste(null), 500)
      return
    }

    setInvalidPiste(null)
    setUpdating(matchId)
    await Promise.all([
      updateMatchPiste(matchId, piste),
      updateMatchHoraire(matchId, buildHoraire(snapped, datePart)),
    ])
    setUpdating(null)
  }

  if (isLoading) {
    return (
      <div className="h-screen flex items-center justify-center bg-gray-50">
        <div className="h-5 w-5 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  if (pistes.length === 0) {
    return (
      <div className="h-screen flex flex-col items-center justify-center bg-gray-50 gap-3">
        <p className="text-sm text-gray-500">Aucune piste configurée pour ce tournoi.</p>
        <button onClick={() => navigate(-1)} className="text-sm text-blue-600 hover:underline">
          Retour
        </button>
      </div>
    )
  }

  if (matches.length === 0) {
    return (
      <div className="h-screen flex flex-col items-center justify-center bg-gray-50 gap-3">
        <p className="text-sm text-gray-500">"Générez d'abord les matchs."</p>
        <button onClick={() => navigate(-1)} className="text-sm text-blue-600 hover:underline">
          Retour
        </button>
      </div>
    )
  }

  // Matchs sans horaire → panneau latéral
  const unscheduled = matches.filter((m) => m.horaire == null)

  // Grouper les non-planifiés par phase
  const unscheduledByPhase = unscheduled.reduce<Record<string, { phaseName: string; matches: Match[] }>>(
    (acc, m) => {
      const node = nodes.find((n) => n.id === m.phase_node_id)
      const phaseName = node?.data.config.name ?? m.phase_node_id
      if (!acc[m.phase_node_id]) acc[m.phase_node_id] = { phaseName, matches: [] }
      acc[m.phase_node_id].matches.push(m)
      return acc
    },
    {}
  )

  return (
    <div className="h-screen flex flex-col bg-gray-50">
      {/* Top bar */}
      <div className="h-14 border-b border-gray-200 bg-white flex items-center px-4 gap-4 shrink-0">
        <button
          onClick={() => navigate(-1)}
          className="text-sm text-gray-500 hover:text-gray-700 transition-colors flex items-center gap-1"
        >
          <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
            <path fillRule="evenodd" d="M9.707 16.707a1 1 0 01-1.414 0l-6-6a1 1 0 010-1.414l6-6a1 1 0 011.414 1.414L5.414 9H17a1 1 0 110 2H5.414l4.293 4.293a1 1 0 010 1.414z" clipRule="evenodd" />
          </svg>
          Retour
        </button>
        <h1 className="text-sm font-semibold text-gray-900">
          Planning des pistes — {tournamentName}
        </h1>
        {datePart && (
          <span className="text-xs text-gray-400">
            {new Date(datePart + 'T12:00:00').toLocaleDateString('fr-FR', {
              weekday: 'long', day: 'numeric', month: 'long',
            })}
          </span>
        )}
      </div>

      {/* Body: grille + panneau latéral */}
      <div className="flex-1 flex overflow-hidden">

      {/* Scrollable schedule */}
      <div className="flex-1 overflow-auto">
        {/* Sticky column headers */}
        <div
          className="sticky top-0 z-20 bg-white border-b border-gray-200 flex"
          style={{ paddingLeft: AXIS_W }}
        >
          {pistes.map((p) => (
            <div
              key={p}
              className="shrink-0 flex items-center justify-center text-xs font-semibold text-gray-600 border-l border-gray-200"
              style={{ width: COL_W, height: HEADER_H }}
            >
              Piste {p}
            </div>
          ))}
        </div>

        {/* Grid body */}
        <div className="flex" style={{ minHeight: gridH }}>
          {/* Time axis */}
          <div className="shrink-0 relative" style={{ width: AXIS_W, height: gridH }}>
            {ticks.map((t) => (
              <div
                key={t}
                className="absolute right-2 text-[11px] text-gray-400 -translate-y-[7px]"
                style={{ top: (t - MIN_TIME) * PPM }}
              >
                {fmtTime(t)}
              </div>
            ))}
          </div>

          {/* Court columns */}
          <div ref={gridRef} className="flex relative" style={{ height: gridH }}>
            {pistes.map((piste) => {
              const isInvalid = invalidPiste === piste
              const isHover = preview?.piste === piste || isInvalid
              const colMatches = scheduled.filter((m) => m.piste === piste)

              return (
                <div
                  key={piste}
                  className={[
                    'shrink-0 relative border-l border-gray-200 transition-colors duration-100',
                    isHover && !isInvalid ? 'bg-blue-50/60' : '',
                    isInvalid ? 'bg-red-50' : 'bg-white',
                  ].join(' ')}
                  style={{ width: COL_W, height: gridH }}
                  onDragOver={(e) => handleDragOver(e, piste)}
                  onDragLeave={() => handleDragLeave(piste)}
                  onDrop={(e) => handleDrop(e, piste)}
                >
                  {/* Grid lines */}
                  {ticks.map((t) => (
                    <div
                      key={t}
                      className="absolute left-0 right-0 border-t border-gray-100"
                      style={{ top: (t - MIN_TIME) * PPM }}
                    />
                  ))}

                  {/* Matches */}
                  {colMatches.map((match) => {
                    const startMin = toMinutes(match.horaire!)
                    const matchH = getMatchDur(match) * PPM
                    const slotH = getSlotDur(match) * PPM
                    const top = (startMin - MIN_TIME) * PPM
                    const isDraggingThis = dragging?.matchId === match.id
                    const isUpdatingThis = updating === match.id
                    const teamLine = getTeamLine(match)
                    const phaseName = getPhaseName(match)
                    const label = matchLabel(match.nom, match.ordre)

                    return (
                      <div
                        key={match.id}
                        className="absolute left-1.5 right-1.5"
                        style={{ top, height: slotH }}
                      >
                        {/* Match block */}
                        <div
                          draggable
                          onDragStart={(e) => handleDragStart(e, match)}
                          onDragEnd={handleDragEnd}
                          className={[
                            'absolute inset-x-0 top-0 rounded-lg border px-2.5 py-1.5 cursor-grab active:cursor-grabbing select-none overflow-hidden transition-opacity',
                            isDraggingThis ? 'opacity-30' : 'opacity-100',
                            match.statut === 'termine'
                              ? 'bg-emerald-50 border-emerald-200'
                              : 'bg-blue-50 border-blue-200 hover:border-blue-300',
                          ].join(' ')}
                          style={{ height: matchH }}
                        >
                          <p className="text-[11px] font-semibold text-gray-700 truncate leading-snug">
                            {phaseName} — {label}
                          </p>
                          {teamLine && (
                            <p className="text-[11px] text-gray-500 truncate leading-snug mt-0.5">
                              {teamLine}
                            </p>
                          )}
                          <p className="text-[10px] text-gray-400 mt-0.5">
                            {fmtTime(startMin)}
                          </p>
                          {isUpdatingThis && (
                            <div className="absolute inset-0 flex items-center justify-center bg-white/70 rounded-lg">
                              <div className="h-3.5 w-3.5 border-2 border-blue-400 border-t-transparent rounded-full animate-spin" />
                            </div>
                          )}
                        </div>

                        {/* Rest zone */}
                        {slotH > matchH && (
                          <div
                            className="absolute inset-x-0"
                            style={{ top: matchH, height: slotH - matchH }}
                          >
                            <div className="h-full mx-0.5 border-x border-b border-dashed border-gray-200 rounded-b flex items-center justify-center">
                              <span className="text-[9px] text-gray-300 uppercase tracking-wide">repos</span>
                            </div>
                          </div>
                        )}
                      </div>
                    )
                  })}

                  {/* Drop preview ghost */}
                  {preview?.piste === piste && dragging && !isInvalid && (
                    <div
                      className="absolute left-1.5 right-1.5 pointer-events-none"
                      style={{
                        top: (preview.startMin - MIN_TIME) * PPM,
                        height: dragging.slotMin * PPM,
                      }}
                    >
                      <div
                        className="absolute inset-x-0 top-0 rounded-lg border-2 border-dashed border-blue-400 bg-blue-100/40"
                        style={{ height: dragging.matchMin * PPM }}
                      />
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      </div>

      {/* Panneau matchs non planifiés */}
      {unscheduled.length > 0 && (
        <div className="w-60 shrink-0 border-l border-gray-200 bg-white flex flex-col overflow-hidden">
          <div className="px-3 py-2.5 border-b border-gray-100">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
              Non planifiés ({unscheduled.length})
            </p>
            <p className="text-[10px] text-gray-400 mt-0.5">Glisser sur la grille pour planifier</p>
          </div>
          <div className="flex-1 overflow-y-auto p-2 flex flex-col gap-3">
            {Object.values(unscheduledByPhase).map(({ phaseName, matches: phaseMatches }) => (
              <div key={phaseName}>
                <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide mb-1 px-1">
                  {phaseName}
                </p>
                <div className="flex flex-col gap-1">
                  {phaseMatches.map((match) => {
                    const isDraggingThis = dragging?.matchId === match.id
                    const isUpdatingThis = updating === match.id
                    const teamLine = getTeamLine(match)
                    const label = matchLabel(match.nom, match.ordre)
                    return (
                      <div
                        key={match.id}
                        draggable
                        onDragStart={(e) => handleDragStart(e, match)}
                        onDragEnd={handleDragEnd}
                        className={[
                          'rounded-lg border px-2.5 py-2 cursor-grab active:cursor-grabbing select-none transition-opacity relative',
                          isDraggingThis ? 'opacity-30' : 'opacity-100',
                          'bg-amber-50 border-amber-200 hover:border-amber-300',
                        ].join(' ')}
                      >
                        <p className="text-[11px] font-semibold text-gray-700 truncate leading-snug">
                          {label}
                        </p>
                        {teamLine && (
                          <p className="text-[11px] text-gray-500 truncate leading-snug mt-0.5">
                            {teamLine}
                          </p>
                        )}
                        {isUpdatingThis && (
                          <div className="absolute inset-0 flex items-center justify-center bg-white/70 rounded-lg">
                            <div className="h-3.5 w-3.5 border-2 border-amber-400 border-t-transparent rounded-full animate-spin" />
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      </div>
    </div>
  )
}
