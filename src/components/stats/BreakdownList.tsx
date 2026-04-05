interface BreakdownListProps {
  title: string
  data: { name: string; winRate: number; total: number }[]
}

export default function BreakdownList({ title, data }: BreakdownListProps) {
  if (data.length === 0) return null

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4">
      <h2 className="text-sm font-semibold text-gray-900 mb-3">{title}</h2>
      <div className="space-y-2">
        {data.map(d => (
          <div key={d.name} className="flex items-center justify-between">
            <span className="text-sm text-gray-700 capitalize">{d.name}</span>
            <div className="flex items-center gap-2">
              <span className="text-xs text-gray-500">{d.total} match{d.total !== 1 ? 'es' : ''}</span>
              <span className={`text-xs font-semibold ${d.winRate >= 50 ? 'text-green-700' : 'text-red-600'}`}>
                {d.winRate}%
              </span>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
