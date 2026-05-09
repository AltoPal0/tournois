export default function LandingPage() {
  return (
    <div className="min-h-screen bg-[#0d1b2a] flex flex-col items-center justify-center px-6">
      <img
        src="/logo-padel.JPG"
        alt="Padel"
        className="w-24 h-24 rounded-2xl object-cover mb-8 shadow-2xl"
      />
      <h1 className="text-2xl font-bold text-white tracking-tight mb-2">
        Padel Tournois
      </h1>
      <p className="text-gray-400 text-sm text-center max-w-xs">
        Retrouve le lien de ton tournoi dans le message reçu de l'organisateur.
      </p>
    </div>
  )
}
