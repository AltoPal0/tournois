import { useState } from 'react'
import type { PhaseType } from '../../types/tournament'

type PhaseInfo = {
  type: PhaseType
  label: string
  description: string
  color: string
  disabled?: boolean
  rules: string
  options: { label: string; detail: string }[]
}

const teamPhases: PhaseInfo[] = [
  {
    type: 'round_robin',
    label: 'Poule',
    description: 'Round Robin',
    color: 'border-blue-200 bg-blue-50 text-blue-700',
    rules:
      'Toutes les équipes s\'affrontent au moins une fois. Un classement est établi par points (victoire, nul, défaite) et ratio de sets. Idéal pour garantir un nombre fixe de matchs à chaque équipe avant une phase éliminatoire.',
    options: [
      { label: 'Nombre d\'équipes', detail: 'De 2 à 32 équipes participantes.' },
      { label: 'Nombre de sets', detail: '1, 2 ou 3 sets par match.' },
      { label: 'Planification', detail: 'Heure de début, durée d\'un slot et type de match (durée fixe ou par score).' },
      { label: 'Sorties', detail: 'Configurer combien d\'équipes avancent (1ère, 2ème, etc.).' },
    ],
  },
  {
    type: 'elimination',
    label: 'Tableau',
    description: 'Élimination directe',
    color: 'border-orange-200 bg-orange-50 text-orange-700',
    rules:
      'Format à élimination directe : le perdant de chaque match est éliminé. Le gagnant avance au tour suivant jusqu\'à la finale. Le nombre d\'équipes doit idéalement être une puissance de 2 pour éviter les byes.',
    options: [
      { label: 'Nombre d\'équipes', detail: 'De 2 à 32. Une puissance de 2 (4, 8, 16…) est recommandée.' },
      { label: 'Nombre de sets', detail: '1, 2 ou 3 sets par match.' },
      { label: 'Planification', detail: 'Heure de début, durée d\'un slot et type de match.' },
      { label: 'Sorties', detail: 'Finaliste, demi-finalistes, etc. — configurables librement.' },
    ],
  },
  {
    type: 'tournante_libre',
    label: 'Tournante libre',
    description: 'Suisse simplifié',
    color: 'border-violet-200 bg-violet-50 text-violet-700',
    rules:
      'Inspiré du système suisse : les équipes jouent plusieurs rounds et sont appariées avec des adversaires de niveau similaire à chaque round. Pas d\'élimination — toutes les équipes jouent tous les rounds. Bon compromis entre équité et durée.',
    options: [
      { label: 'Nombre de rounds', detail: 'De 2 à 8 rounds.' },
      { label: 'Nombre d\'équipes', detail: 'De 2 à 32.' },
      { label: 'Nombre de sets', detail: '1, 2 ou 3 sets par match.' },
      { label: 'Planification', detail: 'Heure de début, durée d\'un slot et type de match.' },
    ],
  },
  {
    type: 'match_simple',
    label: 'Match simple',
    description: 'Un seul match',
    color: 'border-rose-200 bg-rose-50 text-rose-700',
    rules:
      'Un unique match entre deux équipes. Utile pour les finales isolées, les barrages ou n\'importe quelle confrontation ponctuelle en dehors d\'un format de groupe.',
    options: [
      { label: 'Nombre de sets', detail: '1, 2 ou 3 sets.' },
      { label: 'Planification', detail: 'Heure de début, durée et type de match.' },
      { label: 'Sorties', detail: 'Vainqueur et perdant, configurables.' },
    ],
  },
  {
    type: 'americano',
    label: 'Américano',
    description: 'Rotation sans doublons',
    color: 'border-amber-200 bg-amber-50 text-amber-700',
    rules:
      'Format mexicain de rotation : les partenaires changent à chaque round de façon à ce que chacun joue avec et contre tout le monde. Le classement est individuel — chaque joueur accumule les points de son équipe à chaque match. Très convivial, idéal pour les groupes mixtes.',
    options: [
      { label: 'Nombre de rounds', detail: 'De 2 à 8 rotations.' },
      { label: 'Nombre d\'équipes', detail: 'De 2 à 32 (nombre pair requis).' },
      { label: 'Nombre de sets', detail: '1, 2 ou 3 sets par match.' },
      { label: 'Planification', detail: 'Heure de début, durée et type de match.' },
    ],
  },
]

const individualPhases: PhaseInfo[] = [
  {
    type: 'americana_single',
    label: 'Americana Single',
    description: 'Joueurs individuels, matchs à la volée',
    color: 'border-teal-200 bg-teal-50 text-teal-700',
    rules:
      'Format individuel de type américano où les matchs sont générés à la demande par batch. Un algorithme fair-play minimise les doublons de partenaires et d\'adversaires au fil des matchs. Les joueurs peuvent être ajoutés, mis en pause ou retirés en cours de tournoi sans perturber le classement.',
    options: [
      { label: 'Liste de joueurs', detail: 'Saisie en texte libre, séparés par des virgules.' },
      { label: 'Matchs par batch', detail: 'Nombre de matchs générés à chaque déclenchement (1 à 20).' },
      { label: 'Modification joueurs live', detail: 'Autoriser l\'ajout/suppression/mise en pause de joueurs pendant le tournoi.' },
      { label: 'Nombre de sets', detail: '1, 2 ou 3 sets par match.' },
      { label: 'Planification', detail: 'Heure de début, durée et type de match.' },
    ],
  },
  {
    type: 'americana_weighted',
    label: 'Americana Pondérée',
    description: 'Équipes équilibrées par force',
    color: 'border-sky-200 bg-sky-50 text-sky-700',
    rules:
      'Format de type Mexicano : les joueurs sont classés par force avant le tournoi (1er = plus fort). L\'algorithme "snake pondéré" associe chaque round un joueur fort avec un joueur faible pour former des équipes équilibrées. En mode statique, tous les rounds sont générés à l\'avance. En mode live, chaque round suivant est regénéré d\'après les résultats du round précédent pour affiner l\'équilibre selon la forme du moment.',
    options: [
      { label: 'Liste de joueurs', detail: 'Saisie en texte libre dans l\'ordre de force, du plus fort au plus faible, séparés par des virgules. Le nombre de joueurs doit être un multiple de 4.' },
      { label: 'Nombre de rounds', detail: 'De 1 à 8 rounds.' },
      { label: 'Génération live', detail: 'Activé : les rounds sont générés un par un selon les résultats en cours. Désactivé : tous les rounds sont calculés à l\'avance depuis le classement initial.' },
      { label: 'Top players', detail: 'Marquer certains joueurs comme "top player" (étoile) dans l\'écran de gestion des joueurs. L\'algorithme cherche alors à éviter que deux top players se retrouvent dans le même match.' },
      { label: 'Nombre de sets', detail: '1, 2 ou 3 sets par match.' },
      { label: 'Planification', detail: 'Heure de début, durée d\'un slot et type de match.' },
    ],
  },
  {
    type: 'super_americana',
    label: 'Super Americana',
    description: 'Format mixte (bientôt)',
    color: 'border-emerald-200 bg-emerald-50 text-emerald-700',
    disabled: true,
    rules: 'Format hybride combinant une phase de poules et une phase américano. Disponible prochainement.',
    options: [],
  },
]

const operators: PhaseInfo[] = [
  {
    type: 'best_of',
    label: 'Meilleurs N',
    description: 'Filtre les meilleures équipes',
    color: 'border-purple-200 bg-purple-50 text-purple-700',
    rules:
      'Opérateur de routage : prend en entrée N équipes classées et ne laisse passer que les meilleures vers la sortie connectée. Utile pour séparer les équipes qualifiées des éliminées entre deux phases.',
    options: [
      { label: 'Nombre d\'entrées', detail: 'Le nombre total d\'équipes reçues en entrée.' },
      { label: 'Sorties', detail: 'Chaque sortie correspond à un rang — configurer combien d\'équipes passent.' },
    ],
  },
  {
    type: 'team_builder',
    label: 'Formation d\'équipes',
    description: 'Joueurs → équipes',
    color: 'border-indigo-200 bg-indigo-50 text-indigo-700',
    rules:
      'Opérateur de transformation : regroupe des joueurs individuels en équipes de 2. Les connexions sont établies slot-à-slot : le joueur du slot 1 et celui du slot 2 forment la première équipe, etc. Permet de passer d\'un format individuel à un format par équipes.',
    options: [
      { label: 'Nombre de joueurs', detail: 'Multiple de 2, de 4 à 32. Génère automatiquement N/2 équipes en sortie.' },
    ],
  },
  {
    type: 'team_splitter',
    label: 'Dissolution d\'équipes',
    description: 'Équipes → joueurs',
    color: 'border-cyan-200 bg-cyan-50 text-cyan-700',
    rules:
      'Opérateur inverse de la Formation d\'équipes : décompose chaque équipe en ses deux joueurs individuels. Les connexions sont slot-à-slot. Utile pour récupérer les joueurs après un format par équipes et les rediriger vers un format individuel.',
    options: [
      { label: 'Nombre d\'équipes', detail: 'De 1 à 16. Génère automatiquement N×2 joueurs en sortie.' },
    ],
  },
]

function InfoIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5" viewBox="0 0 20 20" fill="currentColor">
      <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
    </svg>
  )
}

function PhaseInfoOverlay({ phase, onClose }: { phase: PhaseInfo; onClose: () => void }) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" />
      <div
        className="relative bg-white rounded-2xl shadow-2xl max-w-sm w-full p-6 flex flex-col gap-4"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-start justify-between gap-3">
          <div>
            <span className={`inline-block px-2.5 py-1 rounded-full text-xs font-semibold border ${phase.color} mb-2`}>
              {phase.label}
            </span>
            <p className="text-[11px] text-gray-400">{phase.description}</p>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors shrink-0"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
            </svg>
          </button>
        </div>

        {/* Rules */}
        <div>
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Fonctionnement</p>
          <p className="text-sm text-gray-700 leading-relaxed">{phase.rules}</p>
        </div>

        {/* Options */}
        {phase.options.length > 0 && (
          <div>
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Options</p>
            <ul className="flex flex-col gap-2">
              {phase.options.map((opt) => (
                <li key={opt.label} className="flex flex-col gap-0.5">
                  <span className="text-xs font-medium text-gray-700">{opt.label}</span>
                  <span className="text-[11px] text-gray-500 leading-relaxed">{opt.detail}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  )
}

function PhaseCard({
  item,
  onDragStart,
  onInfo,
}: {
  item: PhaseInfo
  onDragStart: (e: React.DragEvent, type: PhaseType) => void
  onInfo: (item: PhaseInfo) => void
}) {
  return (
    <div
      draggable={!item.disabled}
      onDragStart={item.disabled ? undefined : (e) => onDragStart(e, item.type)}
      className={`border rounded-lg px-3 py-2.5 flex items-start justify-between gap-2
        transition-transform duration-150 ${item.color}
        ${item.disabled
          ? 'opacity-40 cursor-not-allowed grayscale'
          : 'cursor-grab active:cursor-grabbing hover:scale-[1.02] hover:shadow-sm'
        }`}
    >
      <div className="min-w-0">
        <p className="text-sm font-medium leading-tight">{item.label}</p>
        <p className="text-[11px] opacity-70">{item.description}</p>
      </div>
      <button
        onMouseDown={(e) => e.stopPropagation()}
        onClick={(e) => {
          e.stopPropagation()
          onInfo(item)
        }}
        className="shrink-0 mt-0.5 opacity-50 hover:opacity-100 transition-opacity duration-150"
        title={`En savoir plus sur ${item.label}`}
      >
        <InfoIcon />
      </button>
    </div>
  )
}

export default function Sidebar({ onOpenConfig }: { onOpenConfig?: () => void }) {
  const [infoPhase, setInfoPhase] = useState<PhaseInfo | null>(null)

  function onDragStart(event: React.DragEvent, type: PhaseType) {
    event.dataTransfer.setData('application/tournois-phase', type)
    event.dataTransfer.effectAllowed = 'move'
  }

  return (
    <>
      <div className="w-52 border-r border-gray-200 bg-white flex flex-col h-full">
        {/* Bouton config global — épinglé en haut */}
        <div className="px-4 pt-4 pb-3 border-b border-gray-100 shrink-0">
          <button
            onClick={onOpenConfig}
            className="w-full flex items-center gap-2 px-3 py-2.5 rounded-lg border border-gray-200
              bg-white text-gray-700 text-sm font-medium
              hover:bg-gray-50 hover:border-gray-300 transition-colors duration-150"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 text-gray-400 shrink-0" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M11.49 3.17c-.38-1.56-2.6-1.56-2.98 0a1.532 1.532 0 01-2.286.948c-1.372-.836-2.942.734-2.106 2.106.54.886.061 2.042-.947 2.287-1.561.379-1.561 2.6 0 2.978a1.532 1.532 0 01.947 2.287c-.836 1.372.734 2.942 2.106 2.106a1.532 1.532 0 012.287.947c.379 1.561 2.6 1.561 2.978 0a1.533 1.533 0 012.287-.947c1.372.836 2.942-.734 2.106-2.106a1.533 1.533 0 01.947-2.287c1.561-.379 1.561-2.6 0-2.978a1.532 1.532 0 01-.947-2.287c.836-1.372-.734-2.942-2.106-2.106a1.532 1.532 0 01-2.287-.947zM10 13a3 3 0 100-6 3 3 0 000 6z" clipRule="evenodd" />
            </svg>
            Paramètres
          </button>
        </div>

        {/* Liste scrollable */}
        <div className="flex-1 overflow-y-auto px-4 py-4 flex flex-col gap-3">
          {/* Section Phases — Équipes */}
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">
            Par équipes
          </p>
          {teamPhases.map((item) => (
            <PhaseCard key={item.type} item={item} onDragStart={onDragStart} onInfo={setInfoPhase} />
          ))}

          {/* Section Phases — Individuels */}
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mt-2">
            Individuels
          </p>
          {individualPhases.map((item) => (
            <PhaseCard key={item.type} item={item} onDragStart={onDragStart} onInfo={setInfoPhase} />
          ))}

          {/* Section Opérateurs */}
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mt-2">
            Opérateurs
          </p>
          {operators.map((item) => (
            <PhaseCard key={item.type} item={item} onDragStart={onDragStart} onInfo={setInfoPhase} />
          ))}
        </div>
      </div>

      {infoPhase && (
        <PhaseInfoOverlay phase={infoPhase} onClose={() => setInfoPhase(null)} />
      )}
    </>
  )
}
