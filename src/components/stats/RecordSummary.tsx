interface RecordSummaryProps {
  wins: number
  losses: number
  winRate: number
}

export default function RecordSummary({ wins, losses, winRate }: RecordSummaryProps) {
  return (
    <div className="grid grid-cols-3 gap-3 mb-4">
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4 text-center">
        <p className="text-xs text-gray-500 uppercase mb-1">Wins</p>
        <p className="text-2xl font-bold text-green-700">{wins}</p>
      </div>
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4 text-center">
        <p className="text-xs text-gray-500 uppercase mb-1">Win Rate</p>
        <p className={`text-2xl font-bold ${winRate >= 50 ? 'text-green-700' : 'text-red-600'}`}>
          {winRate}%
        </p>
      </div>
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4 text-center">
        <p className="text-xs text-gray-500 uppercase mb-1">Losses</p>
        <p className="text-2xl font-bold text-red-600">{losses}</p>
      </div>
    </div>
  )
}
