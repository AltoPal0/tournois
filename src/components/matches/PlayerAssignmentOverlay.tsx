import { useState, useEffect, useCallback, useRef } from 'react'
import type { Joueur, Match, TournamentGraph, TeamWithJoueurs } from '../../types/tournament'
import { computeInputSlotPairs } from '../../lib/matchGeneration'
import { supabase } from '../../lib/supabase'
import { useMatchStore } from '../../store/matchStore'
import { useTournamentStore } from '../../store/tournamentStore'

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

function parseSlotKey(key: SlotKey): { phaseNodeId: string; slot: number } {
  const lastHyphen = key.lastIndexOf('-')
  return { phaseNodeId: key.substring(0, lastHyphen), slot: parseInt(key.substring(lastHyphen + 1)) }
}

function buildInitialSlots(
  graph: TournamentGraph,
  matches: Match[],
  teamsMap: Map<string, TeamWithJoueurs>,
): Map<SlotKey, SlotPlayers> {
  const state = new Map<SlotKey, SlotPlayers>()
  const rootNodes = graph.nodes.filter(
    (n) =>
      !graph.edges.some((e) => e.target === n.id) &&
      n.data.config.type !== 'super_americana' &&
      n.data.config.type !== 'americana_single' && n.data.config.type !== 'americana_weighted',
  )

  for (const node of rootNodes) {
    const { type, inputCount, roundCount } = node.data.config
    const pairType = type === 'elimination' ? 'elimination' : type === 'americano' ? 'americano' : 'round_robin'
    const pairs = computeInputSlotPairs(pairType, inputCount, roundCount)
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
  onCreateAndAssign,
}: {
  position: 1 | 2
  playerId: string | null
  allPlayers: Joueur[]
  assignedPlayerIds: Set<string>
  onAssign: (playerId: string) => void
  onRemove: () => void
  onCreateAndAssign?: (name: string) => Promise<void>
}) {
  const [searching, setSearching] = useState(false)
  const [query, setQuery] = useState('')
  const [isCreating, setIsCreating] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  const player = playerId ? allPlayers.find((p) => p.id === playerId) : null

  const filtered = query.trim()
    ? allPlayers.filter(
        (p) =>
          p.prenom.toLowerCase().includes(query.toLowerCase()) &&
          (!assignedPlayerIds.has(p.id) || p.id === playerId),
      )
    : allPlayers.filter((p) => !assignedPlayerIds.has(p.id) || p.id === playerId)

  const showCreateOption =
    onCreateAndAssign &&
    query.trim().length >= 3 &&
    filtered.length === 0 &&
    !isCreating

  const handleStartSearch = () => {
    setQuery('')
    setSearching(true)
    setTimeout(() => inputRef.current?.focus(), 30)
  }

  const handleSelect = (p: Joueur) => {
    onAssign(p.id)
    setSearching(false)
    setQuery('')
  }

  const handleCreate = async () => {
    if (!onCreateAndAssign) return
    setIsCreating(true)
    await onCreateAndAssign(query.trim())
    setIsCreating(false)
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
            onBlur={() => setTimeout(() => { if (!isCreating) setSearching(false) }, 150)}
            onKeyDown={(e) => {
              if (e.key === 'Escape') { setSearching(false); setQuery('') }
              if (e.key === 'Enter' && showCreateOption) void handleCreate()
            }}
            placeholder="Chercher ou créer un joueur…"
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
        {(filtered.length > 0 || showCreateOption) && (
          <div className="absolute z-50 top-full left-0 right-0 mt-1 bg-white border border-gray-200
            rounded-xl shadow-xl overflow-hidden max-h-48 overflow-y-auto">
            {filtered.slice(0, 12).map((p) => (
              <button
                key={p.id}
                onMouseDown={(e) => { e.preventDefault(); handleSelect(p) }}
                className="w-full text-left px-4 py-2.5 text-sm text-gray-800 hover:bg-blue-50
                  hover:text-blue-700 transition-colors duration-100 first:rounded-t-xl last:rounded-b-xl"
              >
                {p.prenom}
              </button>
            ))}
            {showCreateOption && (
              <button
                onMouseDown={(e) => { e.preventDefault(); void handleCreate() }}
                className="w-full text-left px-4 py-2.5 text-sm text-emerald-700 bg-emerald-50
                  hover:bg-emerald-100 transition-colors duration-100 flex items-center gap-2
                  first:rounded-t-xl last:rounded-b-xl border-t border-gray-100"
              >
                <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M10 3a1 1 0 011 1v5h5a1 1 0 110 2h-5v5a1 1 0 11-2 0v-5H4a1 1 0 110-2h5V4a1 1 0 011-1z" clipRule="evenodd" />
                </svg>
                Créer « {query.trim()} »
              </button>
            )}
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
// Composant : slot joueur individuel (americana_single)
// ---------------------------------------------------------------------------

function SinglePlayerSlot({
  playerName,
  allPlayers,
  assignedNames,
  onAssign,
  onRemove,
  onCreateAndAssign,
}: {
  playerName: string | null
  allPlayers: Joueur[]
  assignedNames: Set<string>
  onAssign: (name: string) => void
  onRemove: () => void
  onCreateAndAssign: (name: string) => Promise<void>
}) {
  const [searching, setSearching] = useState(false)
  const [query, setQuery] = useState('')
  const [isCreating, setIsCreating] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  const filtered = query.trim().length > 0
    ? allPlayers.filter(
        (p) =>
          p.prenom.toLowerCase().includes(query.toLowerCase()) &&
          (!assignedNames.has(p.prenom) || p.prenom === playerName),
      )
    : allPlayers.filter((p) => !assignedNames.has(p.prenom) || p.prenom === playerName)

  const showCreateOption = query.trim().length >= 3 && filtered.length === 0 && !isCreating

  const handleCreate = async () => {
    setIsCreating(true)
    await onCreateAndAssign(query.trim())
    setIsCreating(false)
    setSearching(false)
    setQuery('')
  }

  if (playerName && !searching) {
    return (
      <div className="flex items-center gap-2 px-3 py-2 bg-teal-50 rounded-lg">
        <div className="h-2 w-2 rounded-full bg-teal-400 shrink-0" />
        <span className="text-sm font-medium text-teal-900 flex-1 truncate">{playerName}</span>
        <button
          onClick={(e) => { e.stopPropagation(); onRemove() }}
          className="p-0.5 rounded text-teal-300 hover:text-red-500 hover:bg-red-50 transition-colors"
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
        <div className="flex items-center gap-2 px-3 py-2 border border-teal-400 rounded-lg bg-white shadow-sm">
          <div className="h-2 w-2 rounded-full bg-gray-300 shrink-0" />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onBlur={() => setTimeout(() => { if (!isCreating) setSearching(false) }, 150)}
            onKeyDown={(e) => {
              if (e.key === 'Escape') { setSearching(false); setQuery('') }
              if (e.key === 'Enter' && showCreateOption) void handleCreate()
            }}
            placeholder="Chercher ou créer un joueur…"
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
        {(filtered.length > 0 || showCreateOption) && (
          <div className="absolute z-50 top-full left-0 right-0 mt-1 bg-white border border-gray-200
            rounded-xl shadow-xl overflow-hidden max-h-48 overflow-y-auto">
            {filtered.slice(0, 12).map((p) => (
              <button
                key={p.id}
                onMouseDown={(e) => { e.preventDefault(); onAssign(p.prenom); setSearching(false); setQuery('') }}
                className="w-full text-left px-4 py-2.5 text-sm text-gray-800 hover:bg-teal-50
                  hover:text-teal-700 transition-colors duration-100 first:rounded-t-xl last:rounded-b-xl"
              >
                {p.prenom}
              </button>
            ))}
            {showCreateOption && (
              <button
                onMouseDown={(e) => { e.preventDefault(); void handleCreate() }}
                className="w-full text-left px-4 py-2.5 text-sm text-emerald-700 bg-emerald-50
                  hover:bg-emerald-100 transition-colors duration-100 flex items-center gap-2
                  first:rounded-t-xl last:rounded-b-xl border-t border-gray-100"
              >
                <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M10 3a1 1 0 011 1v5h5a1 1 0 110 2h-5v5a1 1 0 11-2 0v-5H4a1 1 0 110-2h5V4a1 1 0 011-1z" clipRule="evenodd" />
                </svg>
                Créer « {query.trim()} »
              </button>
            )}
          </div>
        )}
      </div>
    )
  }

  return (
    <button
      onClick={() => { setQuery(''); setSearching(true); setTimeout(() => inputRef.current?.focus(), 30) }}
      className="w-full flex items-center gap-2 px-3 py-2 rounded-lg border-2 border-dashed
        border-teal-100 hover:border-teal-300 hover:bg-teal-50/50 transition-all duration-150 text-left"
    >
      <div className="h-2 w-2 rounded-full bg-gray-200 shrink-0" />
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
  const seedRandomAssignments = useMatchStore((s) => s.seedRandomAssignments)
  const clearSlotAssignments = useMatchStore((s) => s.clearSlotAssignments)
  const isAssigning = useMatchStore((s) => s.isAssigning)
  const tournamentConfig = useTournamentStore((s) => s.tournamentConfig)
  const updatePhaseConfig = useTournamentStore((s) => s.updatePhaseConfig)
  const saveTournament = useTournamentStore((s) => s.saveTournament)

  const [allPlayers, setAllPlayers] = useState<Joueur[]>([])
  const [slotPlayers, setSlotPlayers] = useState<Map<SlotKey, SlotPlayers>>(new Map())
  const [pendingSlots, setPendingSlots] = useState<Set<SlotKey>>(new Set())
  const [swapSourceKey, setSwapSourceKey] = useState<SlotKey | null>(null)
  const [showJsonModal, setShowJsonModal] = useState(false)
  const [jsonText, setJsonText] = useState('')
  const [jsonError, setJsonError] = useState<string | null>(null)
  const [isImporting, setIsImporting] = useState(false)
  // americana_single / americana_weighted : Map<nodeId, string[]> des noms de joueurs
  const [americanaPlayers, setAmericanaPlayers] = useState<Map<string, string[]>>(new Map())
  // americana_weighted : Map<nodeId, Set<playerName>> des joueurs marqués "top player"
  const [topPlayersMap, setTopPlayersMap] = useState<Map<string, Set<string>>>(new Map())

  const slotPlayersRef = useRef<Map<SlotKey, SlotPlayers>>(new Map())
  useEffect(() => { slotPlayersRef.current = slotPlayers }, [slotPlayers])

  const rootNodes = graph.nodes.filter(
    (n) =>
      !graph.edges.some((e) => e.target === n.id) &&
      n.data.config.type !== 'super_americana' &&
      n.data.config.type !== 'americana_single' && n.data.config.type !== 'americana_weighted',
  )

  const americanaSingleNodes = graph.nodes.filter(
    (n) =>
      !graph.edges.some((e) => e.target === n.id) &&
      (n.data.config.type === 'americana_single' || n.data.config.type === 'americana_weighted'),
  )

  // Charger les joueurs
  useEffect(() => {
    if (!isOpen) return
    const inscrits = tournamentConfig.joueursInscrits

    if (!inscrits || inscrits.length === 0) {
      async function loadAll() {
        const { data } = await supabase.from('tt_joueurs').select('id, prenom, created_at').order('prenom')
        setAllPlayers((data ?? []) as Joueur[])
      }
      void loadAll()
      return
    }

    async function loadInscritPlayers() {
      const { data } = await supabase.from('tt_joueurs').select('id, prenom, created_at')
      const allDbPlayers = (data ?? []) as Joueur[]
      const nameToPlayer = new Map(allDbPlayers.map((p) => [p.prenom.toLowerCase(), p]))

      const result: Joueur[] = []
      const toCreate: string[] = []

      for (const name of inscrits!) {
        const found = nameToPlayer.get(name.toLowerCase())
        if (found) result.push(found)
        else toCreate.push(name)
      }

      if (toCreate.length > 0) {
        const { data: created } = await supabase
          .from('tt_joueurs')
          .insert(toCreate.map((prenom) => ({ prenom })))
          .select('id, prenom, created_at')
        result.push(...((created ?? []) as Joueur[]))
      }

      setAllPlayers(result.sort((a, b) => a.prenom.localeCompare(b.prenom)))
    }

    void loadInscritPlayers()
  }, [isOpen, tournamentConfig.joueursInscrits])

  // Initialiser les slots équipes et les joueurs americana_single
  useEffect(() => {
    if (!isOpen) return
    setSlotPlayers(buildInitialSlots(graph, matches, teamsMap))
    const am = new Map<string, string[]>()
    const tp = new Map<string, Set<string>>()
    for (const node of americanaSingleNodes) {
      const names = (node.data.config.playerNames ?? '')
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean)
      am.set(node.id, names)
      if (node.data.config.type === 'americana_weighted') {
        const tops = new Set(
          (node.data.config.topPlayers ?? '').split(',').map((s) => s.trim()).filter(Boolean)
        )
        tp.set(node.id, tops)
      }
    }
    setAmericanaPlayers(am)
    setTopPlayersMap(tp)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen])

  // Ensemble des joueurs assignés (pour éviter les doublons dans la liste)
  const assigned = new Set<string>()
  for (const sp of slotPlayers.values()) {
    if (sp.player1Id) assigned.add(sp.player1Id)
    if (sp.player2Id) assigned.add(sp.player2Id)
  }
  const assignedAmericanaNames = new Set<string>()
  for (const names of americanaPlayers.values()) {
    for (const n of names) assignedAmericanaNames.add(n)
  }

  // Créer un joueur en DB et l'ajouter à la liste locale
  const createPlayer = useCallback(async (name: string): Promise<Joueur | null> => {
    const trimmed = name.trim()
    if (!trimmed) return null
    // Chercher si existe déjà
    const existing = allPlayers.find((p) => p.prenom.toLowerCase() === trimmed.toLowerCase())
    if (existing) return existing
    const { data } = await supabase
      .from('tt_joueurs')
      .insert({ prenom: trimmed })
      .select('id, prenom, created_at')
      .single()
    if (!data) return null
    const newPlayer = data as Joueur
    setAllPlayers((prev) =>
      [...prev, newPlayer].sort((a, b) => a.prenom.localeCompare(b.prenom)),
    )
    return newPlayer
  }, [allPlayers])

  // Assigner ou retirer un joueur d'une position dans un slot
  const applyAssign = useCallback(
    async (phaseNodeId: string, slot: number, position: 1 | 2, newPlayerId: string | null) => {
      const key = slotKey(phaseNodeId, slot)
      const current = slotPlayersRef.current.get(key) ?? { player1Id: null, player2Id: null }
      const newSlot: SlotPlayers = {
        player1Id: position === 1 ? newPlayerId : current.player1Id,
        player2Id: position === 2 ? newPlayerId : current.player2Id,
      }

      setSlotPlayers((prev) => {
        const next = new Map(prev)
        next.set(key, newSlot)
        return next
      })

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

  // Créer un joueur et l'assigner à un slot équipe
  const handleCreateAndAssign = useCallback(
    async (phaseNodeId: string, slot: number, position: 1 | 2, name: string) => {
      const player = await createPlayer(name)
      if (!player) return
      await applyAssign(phaseNodeId, slot, position, player.id)
    },
    [createPlayer, applyAssign],
  )

  const handleSwap = useCallback(
    async (targetKey: SlotKey) => {
      if (!swapSourceKey) return
      const spSource = slotPlayersRef.current.get(swapSourceKey) ?? { player1Id: null, player2Id: null }
      const spTarget = slotPlayersRef.current.get(targetKey) ?? { player1Id: null, player2Id: null }
      setSwapSourceKey(null)
      setSlotPlayers((prev) => {
        const next = new Map(prev)
        next.set(swapSourceKey, spTarget)
        next.set(targetKey, spSource)
        return next
      })
      const { phaseNodeId: srcNodeId, slot: srcSlot } = parseSlotKey(swapSourceKey)
      const { phaseNodeId: tgtNodeId, slot: tgtSlot } = parseSlotKey(targetKey)
      setPendingSlots((prev) => new Set([...prev, swapSourceKey, targetKey]))
      await Promise.all([
        assignPlayersToSlot(tournamentId, srcNodeId, srcSlot, spTarget.player1Id, spTarget.player2Id),
        assignPlayersToSlot(tournamentId, tgtNodeId, tgtSlot, spSource.player1Id, spSource.player2Id),
      ])
      setPendingSlots((prev) => {
        const next = new Set(prev)
        next.delete(swapSourceKey)
        next.delete(targetKey)
        return next
      })
    },
    [swapSourceKey, assignPlayersToSlot, tournamentId],
  )

  const handleClearAll = useCallback(async () => {
    await clearSlotAssignments(tournamentId)
    const empty = new Map<SlotKey, SlotPlayers>()
    for (const node of rootNodes) {
      for (let s = 1; s <= node.data.config.inputCount; s++) {
        empty.set(slotKey(node.id, s), { player1Id: null, player2Id: null })
      }
    }
    setSlotPlayers(empty)
    setAmericanaPlayers((prev) => {
      const next = new Map<string, string[]>()
      for (const k of prev.keys()) next.set(k, [])
      return next
    })
  }, [clearSlotAssignments, tournamentId, rootNodes])

  const handleRandomAssign = useCallback(async () => {
    await assignRandomTeams(tournamentId, graph)
    const { data } = await supabase
      .from('tt_teams')
      .select('id, joueur1:tt_joueurs!joueur1_id(id, prenom), joueur2:tt_joueurs!joueur2_id(id, prenom)')
    if (data) {
      const freshTeamsMap = new Map<string, TeamWithJoueurs>()
      for (const t of data as unknown as TeamWithJoueurs[]) freshTeamsMap.set(t.id, t)
      const freshMatches = useMatchStore.getState().matches
      setSlotPlayers(buildInitialSlots(graph, freshMatches, freshTeamsMap))
    }
    onAssignmentChanged()
  }, [tournamentId, graph, assignRandomTeams, onAssignmentChanged])

  const handleSeedRandom = useCallback(async () => {
    await seedRandomAssignments(tournamentId, graph)
    const { data } = await supabase
      .from('tt_teams')
      .select('id, joueur1:tt_joueurs!joueur1_id(id, prenom), joueur2:tt_joueurs!joueur2_id(id, prenom)')
    if (data) {
      const freshTeamsMap = new Map<string, TeamWithJoueurs>()
      for (const t of data as unknown as TeamWithJoueurs[]) freshTeamsMap.set(t.id, t)
      const freshMatches = useMatchStore.getState().matches
      setSlotPlayers(buildInitialSlots(graph, freshMatches, freshTeamsMap))
    }
    onAssignmentChanged()
  }, [tournamentId, graph, seedRandomAssignments, onAssignmentChanged])

  // Gestion americana_single : ajouter/retirer un joueur
  const handleAmericanaAddPlayer = useCallback(
    async (nodeId: string, name: string) => {
      const trimmed = name.trim()
      if (!trimmed) return
      await createPlayer(trimmed)
      setAmericanaPlayers((prev) => {
        const current = prev.get(nodeId) ?? []
        if (current.some((n) => n.toLowerCase() === trimmed.toLowerCase())) return prev
        const next = new Map(prev)
        next.set(nodeId, [...current, trimmed])
        return next
      })
    },
    [createPlayer],
  )

  const handleAmericanaRemovePlayer = useCallback((nodeId: string, name: string) => {
    setAmericanaPlayers((prev) => {
      const next = new Map(prev)
      next.set(nodeId, (prev.get(nodeId) ?? []).filter((n) => n !== name))
      return next
    })
    setTopPlayersMap((prev) => {
      const tops = prev.get(nodeId)
      if (!tops?.has(name)) return prev
      const next = new Map(prev)
      const newSet = new Set(tops)
      newSet.delete(name)
      next.set(nodeId, newSet)
      return next
    })
  }, [])

  const toggleTopPlayer = useCallback((nodeId: string, name: string) => {
    setTopPlayersMap((prev) => {
      const next = new Map(prev)
      const tops = new Set(prev.get(nodeId) ?? [])
      if (tops.has(name)) tops.delete(name)
      else tops.add(name)
      next.set(nodeId, tops)
      return next
    })
  }, [])

  // Sauvegarder les joueurs dans la config lors de la confirmation
  const handleConfirm = useCallback(async () => {
    for (const [nodeId, names] of americanaPlayers) {
      const tops = topPlayersMap.get(nodeId)
      updatePhaseConfig(nodeId, {
        playerNames: names.join(', '),
        inputCount: names.length,
        ...(tops !== undefined ? { topPlayers: [...tops].join(', ') } : {}),
      })
    }
    if (americanaPlayers.size > 0) await saveTournament()
    onAssignmentChanged()
    onClose()
  }, [americanaPlayers, updatePhaseConfig, saveTournament, onAssignmentChanged, onClose])

  // ---------------------------------------------------------------------------
  // Import / Export JSON unifié
  // Format : { phases: [{ name, type, teams?: [...] } | { name, type, players: [...] }] }
  // ---------------------------------------------------------------------------

  type ExportPhase =
    | { name: string; type: string; teams: { player1: string; player2: string }[] }
    | { name: string; type: string; players: string[] }

  const handleJsonImport = useCallback(async () => {
    setJsonError(null)

    let parsed: { phases: ExportPhase[] }
    try {
      parsed = JSON.parse(jsonText)
    } catch {
      setJsonError('JSON invalide')
      return
    }
    if (!Array.isArray(parsed?.phases)) {
      setJsonError('Format invalide — attendu : { "phases": [...] }')
      return
    }

    setIsImporting(true)

    // Collecter tous les noms de joueurs pour upsert en une passe
    const allNames = new Set<string>()
    for (const phase of parsed.phases) {
      if ('teams' in phase) {
        for (const t of phase.teams) {
          if (t.player1?.trim()) allNames.add(t.player1.trim())
          if (t.player2?.trim()) allNames.add(t.player2.trim())
        }
      } else if ('players' in phase) {
        for (const p of phase.players) {
          if (p?.trim()) allNames.add(p.trim())
        }
      }
    }

    const { data: existingData } = await supabase.from('tt_joueurs').select('id, prenom, created_at')
    const dbPlayers = (existingData ?? []) as Joueur[]
    const nameToPlayer = new Map(dbPlayers.map((p) => [p.prenom.toLowerCase(), p]))

    const playerMap = new Map<string, Joueur>()
    const toCreate: string[] = []
    for (const name of allNames) {
      const found = nameToPlayer.get(name.toLowerCase())
      if (found) playerMap.set(name, found)
      else toCreate.push(name)
    }
    if (toCreate.length > 0) {
      const { data: created } = await supabase
        .from('tt_joueurs')
        .insert(toCreate.map((prenom) => ({ prenom })))
        .select('id, prenom, created_at')
      for (const p of (created ?? []) as Joueur[]) playerMap.set(p.prenom, p)
    }

    // Index des nœuds par nom (insensible à la casse)
    const nodeByName = new Map<string, typeof rootNodes[0]>()
    for (const node of [...rootNodes, ...americanaSingleNodes]) {
      nodeByName.set(node.data.config.name.toLowerCase(), node)
    }

    const newAmericanaPlayers = new Map(americanaPlayers)

    for (const phase of parsed.phases) {
      const node = nodeByName.get(phase.name.toLowerCase())

      if ('teams' in phase && node && node.data.config.type !== 'americana_single') {
        // Phase équipes : assigner slot par slot
        for (let i = 0; i < Math.min(phase.teams.length, node.data.config.inputCount); i++) {
          const team = phase.teams[i]
          const p1 = team.player1?.trim() ? playerMap.get(team.player1.trim()) : undefined
          const p2 = team.player2?.trim() ? playerMap.get(team.player2.trim()) : undefined
          await assignPlayersToSlot(tournamentId, node.id, i + 1, p1?.id ?? null, p2?.id ?? null)
        }
      } else if ('players' in phase && node && node.data.config.type === 'americana_single') {
        // Phase americana_single : mettre à jour la liste locale (sauvegardée au Confirmer)
        const names = phase.players.map((p) => p.trim()).filter(Boolean)
        newAmericanaPlayers.set(node.id, names)
      }
    }

    setAmericanaPlayers(newAmericanaPlayers)

    // Rafraîchir les slots équipes depuis la DB
    const { data: freshTeamsData } = await supabase
      .from('tt_teams')
      .select('id, joueur1:tt_joueurs!joueur1_id(id, prenom), joueur2:tt_joueurs!joueur2_id(id, prenom)')
    if (freshTeamsData) {
      const freshTeamsMap = new Map<string, TeamWithJoueurs>()
      for (const t of freshTeamsData as unknown as TeamWithJoueurs[]) freshTeamsMap.set(t.id, t)
      setSlotPlayers(buildInitialSlots(graph, useMatchStore.getState().matches, freshTeamsMap))
    }

    setAllPlayers((prev) => {
      const merged = new Map(prev.map((p) => [p.id, p]))
      for (const p of playerMap.values()) merged.set(p.id, p)
      return Array.from(merged.values()).sort((a, b) => a.prenom.localeCompare(b.prenom))
    })

    setIsImporting(false)
    setShowJsonModal(false)
    setJsonText('')
    onAssignmentChanged()
  }, [jsonText, rootNodes, americanaSingleNodes, americanaPlayers, assignPlayersToSlot, tournamentId, graph, onAssignmentChanged])

  const handleExportJson = useCallback(() => {
    const phases: ExportPhase[] = []

    for (const node of rootNodes) {
      const teams: { player1: string; player2: string }[] = []
      for (let s = 1; s <= node.data.config.inputCount; s++) {
        const key = slotKey(node.id, s)
        const sp = slotPlayers.get(key) ?? { player1Id: null, player2Id: null }
        const p1 = sp.player1Id ? allPlayers.find((p) => p.id === sp.player1Id) : null
        const p2 = sp.player2Id ? allPlayers.find((p) => p.id === sp.player2Id) : null
        teams.push({ player1: p1?.prenom ?? '', player2: p2?.prenom ?? '' })
      }
      phases.push({ name: node.data.config.name, type: node.data.config.type, teams })
    }

    for (const node of americanaSingleNodes) {
      phases.push({
        name: node.data.config.name,
        type: node.data.config.type,
        players: americanaPlayers.get(node.id) ?? [],
      })
    }

    const json = JSON.stringify({ phases }, null, 2)
    const blob = new Blob([json], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'equipes.json'
    a.click()
    URL.revokeObjectURL(url)
  }, [rootNodes, americanaSingleNodes, slotPlayers, allPlayers, americanaPlayers])

  const totalSlots = rootNodes.reduce((s, n) => s + n.data.config.inputCount, 0)
  const filledSlots = Array.from(slotPlayers.values()).filter(
    (sp) => sp.player1Id !== null && sp.player2Id !== null,
  ).length

  const hasAnySections = rootNodes.length > 0 || americanaSingleNodes.length > 0

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
          onClick={() => { setJsonText(''); setJsonError(null); setShowJsonModal(true) }}
          disabled={isAssigning}
          className="inline-flex items-center gap-2 px-3 py-1.5 rounded-xl text-xs font-medium
            border border-gray-200 text-gray-600 hover:bg-purple-50 hover:border-purple-200 hover:text-purple-600
            transition-all duration-200 disabled:opacity-40"
        >
          <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5" viewBox="0 0 20 20" fill="currentColor">
            <path fillRule="evenodd" d="M3 17a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zM6.293 6.707a1 1 0 010-1.414l3-3a1 1 0 011.414 0l3 3a1 1 0 01-1.414 1.414L11 5.414V13a1 1 0 11-2 0V5.414L7.707 6.707a1 1 0 01-1.414 0z" clipRule="evenodd" />
          </svg>
          Importer JSON
        </button>

        <button
          onClick={handleExportJson}
          disabled={isAssigning}
          className="inline-flex items-center gap-2 px-3 py-1.5 rounded-xl text-xs font-medium
            border border-gray-200 text-gray-600 hover:bg-purple-50 hover:border-purple-200 hover:text-purple-600
            transition-all duration-200 disabled:opacity-40"
        >
          <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5" viewBox="0 0 20 20" fill="currentColor">
            <path fillRule="evenodd" d="M3 17a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zM10 3a1 1 0 011 1v7.586l1.293-1.293a1 1 0 111.414 1.414l-3 3a1 1 0 01-1.414 0l-3-3a1 1 0 111.414-1.414L9 11.586V4a1 1 0 011-1z" clipRule="evenodd" />
          </svg>
          Exporter JSON
        </button>

        <button
          onClick={handleSeedRandom}
          disabled={isAssigning}
          className="inline-flex items-center gap-2 px-3 py-1.5 rounded-xl text-xs font-medium
            border border-gray-200 text-gray-600 hover:bg-amber-50 hover:border-amber-200 hover:text-amber-700
            transition-all duration-200 disabled:opacity-40"
          title="Mélanger les équipes déjà assignées dans les poules"
        >
          {isAssigning ? (
            <div className="h-3 w-3 border-2 border-gray-400/30 border-t-gray-600 rounded-full animate-spin" />
          ) : (
            <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5" viewBox="0 0 20 20" fill="currentColor">
              <path d="M8 5a1 1 0 100 2h5.586l-1.293 1.293a1 1 0 001.414 1.414l3-3a1 1 0 000-1.414l-3-3a1 1 0 10-1.414 1.414L13.586 5H8zM12 15a1 1 0 100-2H6.414l1.293-1.293a1 1 0 10-1.414-1.414l-3 3a1 1 0 000 1.414l3 3a1 1 0 001.414-1.414L6.414 15H12z" />
            </svg>
          )}
          Seed aléatoire
        </button>

        <button
          onClick={handleRandomAssign}
          disabled={isAssigning}
          className="inline-flex items-center gap-2 px-3 py-1.5 rounded-xl text-xs font-medium
            border border-gray-200 text-gray-600 hover:bg-gray-50 hover:border-gray-300
            transition-all duration-200 disabled:opacity-40"
          title="Créer de nouvelles équipes en appariant les joueurs aléatoirement"
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
          onClick={() => void handleConfirm()}
          className="inline-flex items-center gap-2 px-4 py-1.5 rounded-xl text-xs font-semibold
            bg-blue-600 text-white hover:bg-blue-700 transition-all duration-200 shadow-sm"
        >
          <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5" viewBox="0 0 20 20" fill="currentColor">
            <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
          </svg>
          Confirmer
        </button>
      </div>

      {/* Barre d'avancement (seulement pour les phases équipes) */}
      {rootNodes.length > 0 && (
        <div className="border-b border-gray-100 px-6 py-2.5 bg-gray-50 shrink-0">
          <div className="flex items-center gap-3">
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
        </div>
      )}

      {/* Modal import JSON */}
      {showJsonModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg mx-4 flex flex-col">
            <div className="flex items-center justify-between px-6 pt-5 pb-3">
              <h3 className="text-base font-semibold text-gray-900">Importer des équipes</h3>
              <button onClick={() => setShowJsonModal(false)} className="p-1 text-gray-400 hover:text-gray-600 transition-colors">
                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
                </svg>
              </button>
            </div>
            <div className="px-6 pb-2">
              <p className="text-xs text-gray-500 mb-2">
                Collez un JSON exporté par cet écran. Les phases sont matchées par nom.
              </p>
              <textarea
                value={jsonText}
                onChange={(e) => { setJsonText(e.target.value); setJsonError(null) }}
                placeholder={'{\n  "phases": [\n    {\n      "name": "Poule A",\n      "type": "round_robin",\n      "teams": [\n        { "player1": "Alice", "player2": "Bob" }\n      ]\n    },\n    {\n      "name": "Americana 1",\n      "type": "americana_single",\n      "players": ["Carlos", "Diana"]\n    }\n  ]\n}'}
                rows={12}
                autoFocus
                className="w-full px-3 py-2.5 text-xs font-mono border border-gray-200 rounded-xl
                  focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent
                  resize-none transition-shadow duration-150"
              />
              {jsonError && <p className="text-xs text-red-500 mt-1.5">{jsonError}</p>}
            </div>
            <div className="px-6 pb-5 pt-3 flex gap-3">
              <button
                onClick={() => setShowJsonModal(false)}
                className="flex-1 px-3 py-2.5 text-sm font-medium text-gray-700 bg-white border border-gray-200 rounded-xl hover:bg-gray-50 transition-colors"
              >
                Annuler
              </button>
              <button
                onClick={() => void handleJsonImport()}
                disabled={isImporting || !jsonText.trim()}
                className="flex-1 px-3 py-2.5 text-sm font-semibold text-white bg-purple-600 rounded-xl hover:bg-purple-700 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {isImporting && <div className="h-4 w-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />}
                {isImporting ? 'Import en cours…' : 'Importer'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Contenu principal */}
      <div className="flex-1 overflow-auto p-6">
        {!hasAnySections ? (
          <div className="flex items-center justify-center h-40 text-gray-400 text-sm">
            Aucune phase configurée
          </div>
        ) : (
          <div className="space-y-10">

            {/* Section : phases americana_single + americana_weighted */}
            {americanaSingleNodes.length > 0 && (
              <section>
                <div className="flex items-center gap-3 mb-5">
                  <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-teal-100 text-teal-700">
                    Joueurs individuels
                  </span>
                  <div className="flex-1 h-px bg-teal-100" />
                </div>

                <div className="flex gap-6 flex-wrap items-start">
                  {americanaSingleNodes.map((node) => {
                    const isWeighted = node.data.config.type === 'americana_weighted'
                    const players = americanaPlayers.get(node.id) ?? []
                    const assignedInThisPhase = new Set(players)

                    return (
                      <div key={node.id} className="min-w-64 w-64">
                        <div className="mb-3 flex items-center justify-between">
                          <h2 className="text-sm font-semibold text-gray-800">{node.data.config.name}</h2>
                          <span className="text-xs text-gray-400">{players.length} joueur{players.length !== 1 ? 's' : ''}</span>
                        </div>
                        {isWeighted && (
                          <p className="text-[11px] text-sky-600 font-medium mb-2">
                            ↑ Du plus fort au plus faible
                          </p>
                        )}

                        <div className={`rounded-xl border p-3 space-y-2 ${isWeighted ? 'border-sky-200 bg-sky-50/30' : 'border-teal-200 bg-teal-50/30'}`}>
                          {players.map((name, idx) => {
                            const isTop = isWeighted && !!(topPlayersMap.get(node.id)?.has(name))
                            return (
                              <div key={idx} className="flex items-center gap-1.5">
                                {isWeighted && (
                                  <button
                                    type="button"
                                    onClick={() => toggleTopPlayer(node.id, name)}
                                    title={isTop ? 'Retirer top player' : 'Marquer top player'}
                                    className={`shrink-0 w-6 h-6 flex items-center justify-center rounded-md transition-colors duration-150
                                      ${isTop ? 'text-amber-500 bg-amber-50 border border-amber-300 hover:bg-amber-100' : 'text-gray-300 hover:text-amber-400 hover:bg-amber-50'}`}
                                  >
                                    <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5" viewBox="0 0 20 20" fill="currentColor">
                                      <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                                    </svg>
                                  </button>
                                )}
                                <div className="flex-1 min-w-0">
                                  <SinglePlayerSlot
                                    playerName={name}
                                    allPlayers={allPlayers}
                                    assignedNames={assignedInThisPhase}
                                    onAssign={(newName) => {
                                      setAmericanaPlayers((prev) => {
                                        const next = new Map(prev)
                                        const list = [...(prev.get(node.id) ?? [])]
                                        list[idx] = newName
                                        next.set(node.id, list)
                                        return next
                                      })
                                    }}
                                    onRemove={() => handleAmericanaRemovePlayer(node.id, name)}
                                    onCreateAndAssign={async (n) => { await handleAmericanaAddPlayer(node.id, n) }}
                                  />
                                </div>
                              </div>
                            )
                          })}
                          {/* Slot vide pour ajouter */}
                          <SinglePlayerSlot
                            playerName={null}
                            allPlayers={allPlayers}
                            assignedNames={assignedInThisPhase}
                            onAssign={(name) => {
                              setAmericanaPlayers((prev) => {
                                const next = new Map(prev)
                                const list = prev.get(node.id) ?? []
                                if (!list.some((n) => n.toLowerCase() === name.toLowerCase())) {
                                  next.set(node.id, [...list, name])
                                }
                                return next
                              })
                            }}
                            onRemove={() => {}}
                            onCreateAndAssign={async (n) => { await handleAmericanaAddPlayer(node.id, n) }}
                          />
                        </div>
                      </div>
                    )
                  })}
                </div>
              </section>
            )}

            {/* Section : phases équipes (round_robin, elimination, etc.) */}
            {rootNodes.length > 0 && (
              <section>
                {americanaSingleNodes.length > 0 && (
                  <div className="flex items-center gap-3 mb-5">
                    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-blue-100 text-blue-700">
                      Équipes
                    </span>
                    <div className="flex-1 h-px bg-blue-100" />
                  </div>
                )}

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
                            const isSwapSource = swapSourceKey === key
                            const isSwapTarget = swapSourceKey !== null && swapSourceKey !== key && isComplete

                            return (
                              <div
                                key={slot}
                                className={`rounded-xl border p-3 space-y-2 transition-all duration-200
                                  ${isSwapSource
                                    ? 'border-amber-300 bg-amber-50/40'
                                    : isSwapTarget
                                    ? 'border-green-300 bg-green-50/30'
                                    : isComplete
                                    ? 'border-blue-200 bg-blue-50/30'
                                    : 'border-gray-200 bg-white'
                                  }
                                  ${isPending ? 'opacity-50 pointer-events-none' : ''}
                                  ${swapSourceKey !== null && !isComplete && !isSwapSource ? 'opacity-40' : ''}
                                `}
                              >
                                <div className="flex items-center justify-between mb-0.5">
                                  <span className="text-xs text-gray-500 font-medium">Équipe {slot}</span>
                                  {isPending ? (
                                    <div className="h-3 w-3 border-2 border-blue-300/40 border-t-blue-500 rounded-full animate-spin" />
                                  ) : isSwapSource ? (
                                    <button
                                      onClick={() => setSwapSourceKey(null)}
                                      title="Annuler l'échange"
                                      className="h-5 w-5 rounded-full bg-amber-400 hover:bg-amber-500 flex items-center justify-center transition-colors"
                                    >
                                      <svg xmlns="http://www.w3.org/2000/svg" className="h-3 w-3 text-white" viewBox="0 0 20 20" fill="currentColor">
                                        <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
                                      </svg>
                                    </button>
                                  ) : isSwapTarget ? (
                                    <button
                                      onClick={() => void handleSwap(key)}
                                      title="Échanger ces deux équipes"
                                      className="h-5 w-5 rounded-full bg-green-100 hover:bg-green-500 text-green-600 hover:text-white flex items-center justify-center transition-colors"
                                    >
                                      <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5" viewBox="0 0 20 20" fill="currentColor">
                                        <path d="M8 5a1 1 0 100 2h5.586l-1.293 1.293a1 1 0 001.414 1.414l3-3a1 1 0 000-1.414l-3-3a1 1 0 10-1.414 1.414L13.586 5H8zM12 15a1 1 0 100-2H6.414l1.293-1.293a1 1 0 10-1.414-1.414l-3 3a1 1 0 000 1.414l3 3a1 1 0 001.414-1.414L6.414 15H12z" />
                                      </svg>
                                    </button>
                                  ) : isComplete ? (
                                    <button
                                      onClick={() => setSwapSourceKey(key)}
                                      title="Interchanger cette équipe"
                                      className="h-5 w-5 rounded-full bg-blue-100 hover:bg-blue-200 flex items-center justify-center transition-colors"
                                    >
                                      <svg xmlns="http://www.w3.org/2000/svg" className="h-3 w-3 text-blue-500" viewBox="0 0 20 20" fill="currentColor">
                                        <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                                      </svg>
                                    </button>
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
                                      onCreateAndAssign={async (name) => handleCreateAndAssign(node.id, slot, position, name)}
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
              </section>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
