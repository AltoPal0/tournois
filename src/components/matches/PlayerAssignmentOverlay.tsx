import { useState, useEffect, useCallback, useRef } from 'react'
import type { Joueur, Match, TournamentGraph, TeamWithJoueurs } from '../../types/tournament'
import { computeInputSlotPairs } from '../../lib/matchGeneration'
import { supabase } from '../../lib/supabase'
import { useMatchStore } from '../../store/matchStore'

// ---------------------------------------------------------------------------
// Types locaux
// ---------------------------------------------------------------------------

type SlotKey = string // `${phaseNodeId}-${slot}`

interface SlotPlayers {
  player1Id: string | null
  player2Id: string | null
}

interface Props {
  isOpen: boolean
  onClose: () => void
  tournamentId: string
  graph: TournamentGraph
  matches: Match[]
  teamsMap: Map<string, TeamWithJoueurs>
  onAssignmentChanged: () => void
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function slotKey(phaseNodeId: string, slot: number): SlotKey {
  return `${phaseNodeId}-${slot}`
}

function buildInitialSlots(
  graph: TournamentGraph,
  matches: Match[],
  teamsMap: Map<string, TeamWithJoueurs>,
): Map<SlotKey, SlotPlayers> {
  const state = new Map<SlotKey, SlotPlayers>()
  const rootNodes = graph.nodes.filter(
    (n) => !graph.edges.some((e) => e.target === n.id) && n.data.config.type !== 'super_americana',
  )

  for (const node of rootNodes) {
    const { type, inputCount } = node.data.config
    const pairType = type === 'elimination' ? 'elimination' : 'round_robin'
    const pairs = computeInputSlotPairs(pairType, inputCount)
    const phaseMatches = matches.filter((m) => m.phase_node_id === node.id)

    const slotTeamMap = new Map<number, string | null>()
    for (const pair of pairs) {
      const match = phaseMatches.find((m) => m.ordre === pair.ordre)
      if (!match) continue
      if (!slotTeamMap.has(pair.slot1)) slotTeamMap.set(pair.slot1, match.equipe1_id)
      if (!slotTeamMap.has(pair.slot2)) slotTeamMap.set(pair.slot2, match.equipe2_id)
    }

    for (let s = 1; s <= inputCount; s++) {
      const teamId = slotTeamMap.get(s) ?? null
      const team = teamId ? teamsMap.get(teamId) : null
      state.set(slotKey(node.id, s), {
        player1Id: team?.joueur1?.id ?? null,
        player2Id: team?.joueur2?.id ?? null,
      })
    }
  }
  return state
}

// ---------------------------------------------------------------------------
// Composant : une position de joueur dans un slot d'équipe
// ---------------------------------------------------------------------------

function PlayerPosition({
  position,
  playerId,
  allPlayers,
  assignedPlayerIds,
  onAssign,
  onRemove,
}: {
  position: 1 | 2
  playerId: string | null
  allPlayers: Joueur[]
  assignedPlayerIds: Set<string>
  onAssign: (playerId: string) => void
  onRemove: () => void
}) {
  const [searching, setSearching] = useState(false)
  const [query, setQuery] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  const player = playerId ? allPlayers.find((p) => p.id === playerId) : null

  const filtered = query.trim()
    ? allPlayers.filter(
        (p) =>
          p.prenom.toLowerCase().includes(query.toLowerCase()) &&
          (!assignedPlayerIds.has(p.id) || p.id === playerId),
      )
    : allPlayers.filter((p) => !assignedPlayerIds.has(p.id) || p.id === playerId)

  const handleStartSearch = () => {
    setQuery('')
    setSearching(true)
    setTimeout(() => inputRef.current?.focus(), 30)
  }

  // onMouseDown + e.preventDefault() empêche le blur de l'input de se déclencher
  // avant que handleSelect soit appelé — c'était la cause du bug d'autocomplete
  const handleSelect = (p: Joueur) => {
    onAssign(p.id)
    setSearching(false)
    setQuery('')
  }

  if (player && !searching) {
    return (
      <div className="flex items-center gap-2 px-3 py-2 bg-blue-50 rounded-lg">
        <div className="h-5 w-5 rounded-full bg-blue-200 flex items-center justify-center shrink-0">
          <span className="text-[10px] font-bold text-blue-700">{position}</span>
        </div>
        <span className="text-sm font-medium text-blue-900 flex-1 truncate">{player.prenom}</span>
        <button
          onClick={(e) => { e.stopPropagation(); onRemove() }}
          className="p-0.5 rounded text-blue-300 hover:text-red-500 hover:bg-red-50 transition-colors duration-100"
          title="Retirer ce joueur"
        >
          <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5" viewBox="0 0 20 20" fill="currentColor">
            <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
          </svg>
        </button>
      </div>
    )
  }

  if (searching) {
    return (
      <div className="relative">
        <div className="flex items-center gap-2 px-3 py-2 border border-blue-400 rounded-lg bg-white shadow-sm">
          <div className="h-5 w-5 rounded-full bg-gray-200 flex items-center justify-center shrink-0">
            <span className="text-[10px] font-bold text-gray-500">{position}</span>
          </div>
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onBlur={() => setTimeout(() => setSearching(false), 150)}
            onKeyDown={(e) => { if (e.key === 'Escape') setSearching(false) }}
            placeholder="Chercher un joueur…"
            className="flex-1 text-sm text-gray-900 outline-none bg-transparent placeholder-gray-400"
          />
          <button
            onMouseDown={(e) => { e.preventDefault(); setSearching(false); setQuery('') }}
            className="text-gray-300 hover:text-gray-500 transition-colors"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
            </svg>
          </button>
        </div>
        {filtered.length > 0 && (
          <div className="absolute z-50 top-full left-0 right-0 mt-1 bg-white border border-gray-200
            rounded-xl shadow-xl overflow-hidden max-h-48 overflow-y-auto">
            {filtered.slice(0, 12).map((p) => (
              <button
                key={p.id}
                // e.preventDefault() empêche le blur de l'input → handleSelect s'exécute correctement
                onMouseDown={(e) => { e.preventDefault(); handleSelect(p) }}
                className="w-full text-left px-4 py-2.5 text-sm text-gray-800 hover:bg-blue-50
                  hover:text-blue-700 transition-colors duration-100 first:rounded-t-xl last:rounded-b-xl"
              >
                {p.prenom}
              </button>
            ))}
          </div>
        )}
      </div>
    )
  }

  // Slot vide — cliquer pour rechercher
  return (
    <button
      onClick={handleStartSearch}
      className="w-full flex items-center gap-2 px-3 py-2 rounded-lg border-2 border-dashed
        border-gray-200 hover:border-blue-300 hover:bg-blue-50/50 transition-all duration-150 text-left"
    >
      <div className="h-5 w-5 rounded-full bg-gray-100 flex items-center justify-center shrink-0">
        <span className="text-[10px] font-bold text-gray-400">{position}</span>
      </div>
      <span className="text-sm text-gray-400 italic">Ajouter un joueur…</span>
    </button>
  )
}

// ---------------------------------------------------------------------------
// Composant principal
// ---------------------------------------------------------------------------

export default function PlayerAssignmentOverlay({
  isOpen,
  onClose,
  tournamentId,
  graph,
  matches,
  teamsMap,
  onAssignmentChanged,
}: Props) {
  const assignPlayersToSlot = useMatchStore((s) => s.assignPlayersToSlot)
  const assignRandomTeams = useMatchStore((s) => s.assignRandomTeams)
  const clearSlotAssignments = useMatchStore((s) => s.clearSlotAssignments)
  const isAssigning = useMatchStore((s) => s.isAssigning)

  const [allPlayers, setAllPlayers] = useState<Joueur[]>([])
  const [slotPlayers, setSlotPlayers] = useState<Map<SlotKey, SlotPlayers>>(new Map())
  const [pendingSlots, setPendingSlots] = useState<Set<SlotKey>>(new Set())

  // Ref miroir de slotPlayers pour des lectures fraîches dans les callbacks async
  const slotPlayersRef = useRef<Map<SlotKey, SlotPlayers>>(new Map())
  useEffect(() => {
    slotPlayersRef.current = slotPlayers
  }, [slotPlayers])

  const rootNodes = graph.nodes.filter(
    (n) => !graph.edges.some((e) => e.target === n.id) && n.data.config.type !== 'super_americana',
  )

  // Charger tous les joueurs
  useEffect(() => {
    if (!isOpen) return
    supabase
      .from('tt_joueurs')
      .select('id, prenom, created_at')
      .order('prenom')
      .then(({ data }) => {
        if (data) setAllPlayers(data as Joueur[])
      })
  }, [isOpen])

  // Initialiser les slots depuis les matchs — seulement à l'ouverture de l'overlay.
  // Ne pas mettre matches/teamsMap en dépendances : le store se met à jour pendant les
  // assignations (équipe null tant que les 2 joueurs ne sont pas choisis), ce qui
  // déclencherait une réinitialisation et ferait disparaître les joueurs déjà saisis.
  useEffect(() => {
    if (isOpen) {
      setSlotPlayers(buildInitialSlots(graph, matches, teamsMap))
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen])

  // Ensemble des joueurs déjà assignés
  const assigned = new Set<string>()
  for (const sp of slotPlayers.values()) {
    if (sp.player1Id) assigned.add(sp.player1Id)
    if (sp.player2Id) assigned.add(sp.player2Id)
  }

  // Assigner ou retirer un joueur d'une position dans un slot
  const applyAssign = useCallback(
    async (phaseNodeId: string, slot: number, position: 1 | 2, newPlayerId: string | null) => {
      const key = slotKey(phaseNodeId, slot)

      // Lire l'état frais depuis le ref (évite les stale closures)
      const current = slotPlayersRef.current.get(key) ?? { player1Id: null, player2Id: null }
      const newSlot: SlotPlayers = {
        player1Id: position === 1 ? newPlayerId : current.player1Id,
        player2Id: position === 2 ? newPlayerId : current.player2Id,
      }

      // Mise à jour optimiste locale immédiate
      setSlotPlayers((prev) => {
        const next = new Map(prev)
        next.set(key, newSlot)
        return next
      })

      // Persistance en DB (sans notifier le parent — évite le rechargement qui écrase l'état local)
      setPendingSlots((prev) => new Set(prev).add(key))
      await assignPlayersToSlot(tournamentId, phaseNodeId, slot, newSlot.player1Id, newSlot.player2Id)
      setPendingSlots((prev) => {
        const next = new Set(prev)
        next.delete(key)
        return next
      })
    },
    [assignPlayersToSlot, tournamentId],
  )

  const handleRemove = useCallback(
    (phaseNodeId: string, slot: number, position: 1 | 2) => {
      void applyAssign(phaseNodeId, slot, position, null)
    },
    [applyAssign],
  )

  const handleClearAll = useCallback(async () => {
    await clearSlotAssignments(tournamentId)
    setSlotPlayers(
      new Map(
        Array.from(slotPlayersRef.current.keys()).map((k) => [
          k,
          { player1Id: null, player2Id: null },
        ]),
      ),
    )
  }, [clearSlotAssignments, tournamentId])

  const handleRandomAssign = useCallback(async () => {
    await assignRandomTeams(tournamentId, graph)
    // Reconstruire l'état local depuis les données fraîches : les props du parent
    // ne sont pas encore mises à jour à ce stade (useEffect [isOpen] ne se redéclenche pas).
    const { data } = await supabase
      .from('tt_teams')
      .select('id, joueur1:tt_joueurs!joueur1_id(id, prenom), joueur2:tt_joueurs!joueur2_id(id, prenom)')
    if (data) {
      const freshTeamsMap = new Map<string, TeamWithJoueurs>()
      for (const t of data as unknown as TeamWithJoueurs[]) {
        freshTeamsMap.set(t.id, t)
      }
      const freshMatches = useMatchStore.getState().matches
      setSlotPlayers(buildInitialSlots(graph, freshMatches, freshTeamsMap))
    }
    onAssignmentChanged()
  }, [tournamentId, graph, assignRandomTeams, onAssignmentChanged])

  const handleConfirm = () => {
    onAssignmentChanged()
    onClose()
  }

  const availablePlayers = allPlayers.filter((p) => !assigned.has(p.id))
  const totalSlots = rootNodes.reduce((s, n) => s + n.data.config.inputCount, 0)
  const filledSlots = Array.from(slotPlayers.values()).filter(
    (sp) => sp.player1Id !== null && sp.player2Id !== null,
  ).length

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-50 bg-white flex flex-col">

      {/* Header */}
      <div className="h-14 border-b border-gray-100 flex items-center px-6 gap-4 shrink-0">
        <button
          onClick={onClose}
          className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700
            transition-colors duration-150"
        >
          <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
            <path fillRule="evenodd" d="M9.707 16.707a1 1 0 01-1.414 0l-6-6a1 1 0 010-1.414l6-6a1 1 0 011.414 1.414L5.414 9H17a1 1 0 110 2H5.414l4.293 4.293a1 1 0 010 1.414z" clipRule="evenodd" />
          </svg>
          Retour
        </button>

        <div className="flex-1">
          <h1 className="text-sm font-semibold text-gray-900">Assignation des joueurs</h1>
        </div>

        <button
          onClick={handleClearAll}
          disabled={isAssigning}
          className="inline-flex items-center gap-2 px-3 py-1.5 rounded-xl text-xs font-medium
            border border-gray-200 text-gray-600 hover:bg-red-50 hover:border-red-200 hover:text-red-600
            transition-all duration-200 disabled:opacity-40"
        >
          <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5" viewBox="0 0 20 20" fill="currentColor">
            <path fillRule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v6a1 1 0 102 0V8a1 1 0 00-1-1z" clipRule="evenodd" />
          </svg>
          Tout effacer
        </button>

        <button
          onClick={handleRandomAssign}
          disabled={isAssigning}
          className="inline-flex items-center gap-2 px-3 py-1.5 rounded-xl text-xs font-medium
            border border-gray-200 text-gray-600 hover:bg-gray-50 hover:border-gray-300
            transition-all duration-200 disabled:opacity-40"
        >
          {isAssigning ? (
            <div className="h-3 w-3 border-2 border-gray-400/30 border-t-gray-600 rounded-full animate-spin" />
          ) : (
            <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5" viewBox="0 0 20 20" fill="currentColor">
              <path d="M4 2a1 1 0 011 1v2.101a7.002 7.002 0 0111.601 2.566 1 1 0 11-1.885.666A5.002 5.002 0 005.999 7H9a1 1 0 010 2H4a1 1 0 01-1-1V3a1 1 0 011-1zm.008 9.057a1 1 0 011.276.61A5.002 5.002 0 0014.001 13H11a1 1 0 110-2h5a1 1 0 011 1v5a1 1 0 11-2 0v-2.101a7.002 7.002 0 01-11.601-2.566 1 1 0 01.61-1.276z" />
            </svg>
          )}
          Répartition aléatoire
        </button>

        <button
          onClick={handleConfirm}
          className="inline-flex items-center gap-2 px-4 py-1.5 rounded-xl text-xs font-semibold
            bg-blue-600 text-white hover:bg-blue-700 transition-all duration-200 shadow-sm"
        >
          <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5" viewBox="0 0 20 20" fill="currentColor">
            <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
          </svg>
          Confirmer
        </button>
      </div>

      {/* Barre d'avancement + joueurs disponibles */}
      <div className="border-b border-gray-100 px-6 py-3 bg-gray-50 shrink-0">
        {/* Progression */}
        <div className="flex items-center gap-3 mb-3">
          <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider">
            Équipes complètes
          </span>
          <span className="text-xs font-semibold text-gray-700">
            {filledSlots} / {totalSlots}
          </span>
          <div className="flex-1 h-1.5 bg-gray-200 rounded-full overflow-hidden">
            <div
              className="h-full bg-blue-500 rounded-full transition-all duration-300"
              style={{ width: totalSlots > 0 ? `${(filledSlots / totalSlots) * 100}%` : '0%' }}
            />
          </div>
        </div>

        {/* Joueurs disponibles */}
        <div className="flex items-center gap-2 mb-1.5">
          <span className="text-xs text-gray-400 uppercase tracking-wider">
            Disponibles
          </span>
          <span className="text-xs text-gray-400">
            ({availablePlayers.length} / {allPlayers.length})
          </span>
        </div>
        <div className="flex flex-wrap gap-1.5 min-h-[28px]">
          {availablePlayers.length === 0 ? (
            <span className="text-xs text-gray-400 italic self-center">
              Tous les joueurs sont assignés
            </span>
          ) : (
            availablePlayers.map((p) => (
              <span
                key={p.id}
                className="px-2.5 py-0.5 bg-white border border-gray-200 rounded-full text-xs text-gray-600
                  shadow-sm"
              >
                {p.prenom}
              </span>
            ))
          )}
        </div>
      </div>

      {/* Grille des pools */}
      <div className="flex-1 overflow-auto p-6">
        {rootNodes.length === 0 ? (
          <div className="flex items-center justify-center h-40 text-gray-400 text-sm">
            Aucune phase configurée
          </div>
        ) : (
          <div className="flex gap-6 items-start flex-wrap">
            {rootNodes.map((node) => {
              const { name, inputCount } = node.data.config

              return (
                <div key={node.id} className="min-w-64 w-64">
                  <div className="mb-3 flex items-center justify-between">
                    <h2 className="text-sm font-semibold text-gray-800">{name}</h2>
                    <span className="text-xs text-gray-400">{inputCount} équipes</span>
                  </div>

                  <div className="space-y-2.5">
                    {Array.from({ length: inputCount }, (_, i) => i + 1).map((slot) => {
                      const key = slotKey(node.id, slot)
                      const sp = slotPlayers.get(key) ?? { player1Id: null, player2Id: null }
                      const isPending = pendingSlots.has(key)
                      const isComplete = sp.player1Id !== null && sp.player2Id !== null

                      return (
                        <div
                          key={slot}
                          className={`rounded-xl border p-3 space-y-2 transition-all duration-200
                            ${isComplete
                              ? 'border-blue-200 bg-blue-50/30'
                              : 'border-gray-200 bg-white'
                            }
                            ${isPending ? 'opacity-50 pointer-events-none' : ''}
                          `}
                        >
                          <div className="flex items-center justify-between mb-0.5">
                            <span className="text-xs text-gray-500 font-medium">
                              Équipe {slot}
                            </span>
                            {isPending ? (
                              <div className="h-3 w-3 border-2 border-blue-300/40 border-t-blue-500 rounded-full animate-spin" />
                            ) : isComplete ? (
                              <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5 text-blue-500" viewBox="0 0 20 20" fill="currentColor">
                                <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                              </svg>
                            ) : null}
                          </div>

                          {([1, 2] as const).map((position) => {
                            const playerId = position === 1 ? sp.player1Id : sp.player2Id
                            return (
                              <PlayerPosition
                                key={position}
                                position={position}
                                playerId={playerId}
                                allPlayers={allPlayers}
                                assignedPlayerIds={assigned}
                                onAssign={(pid) => void applyAssign(node.id, slot, position, pid)}
                                onRemove={() => handleRemove(node.id, slot, position)}
                              />
                            )
                          })}
                        </div>
                      )
                    })}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
