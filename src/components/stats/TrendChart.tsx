import {
  LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer,
} from 'recharts'

interface TrendChartProps {
  data: { match: number; result: 'W' | 'L'; label?: string; winRate?: number }[]
  title?: string
}

export default function TrendChart({ data, title }: TrendChartProps) {
  if (data.length < 2) return null

  // Compute cumulative win rate if not already provided
  const chartData = (() => {
    if (data[0].winRate !== undefined) return data
    let cumWins = 0
    let cumTotal = 0
    return data.map(d => {
      cumTotal++
      if (d.result === 'W') cumWins++
      return {
        ...d,
        winRate: Math.round((cumWins / cumTotal) * 100),
      }
    })
  })()

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4 mb-4">
      <h2 className="text-sm font-semibold text-gray-900 mb-3">
        {title ?? `Win Rate Trend (Last ${data.length} Matches)`}
      </h2>
      <ResponsiveContainer width="100%" height={160}>
        <LineChart data={chartData}>
          <XAxis dataKey="label" tick={{ fontSize: 11 }} axisLine={false} tickLine={false} />
          <YAxis domain={[0, 100]} tick={{ fontSize: 11 }} axisLine={false} tickLine={false} tickFormatter={v => `${v}%`} />
          <Tooltip
            formatter={(v: number) => [`${v}%`, 'Win Rate']}
            contentStyle={{ borderRadius: 8, border: '1px solid #e5e7eb', fontSize: 12 }}
          />
          <Line type="monotone" dataKey="winRate" stroke="#15803d" strokeWidth={2} dot={{ fill: '#15803d', r: 3 }} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  )
}
