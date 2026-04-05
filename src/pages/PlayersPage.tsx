import { useState, useEffect, useCallback } from 'react'
import { useAuth } from '../contexts/AuthContext'
import { supabase } from '../lib/supabase'
import { format } from 'date-fns'
import { useNavigate } from 'react-router-dom'
import {
  Plus, Pencil, Trash2, X, Check, Loader2, Search,
  Merge, UserPlus, Users,
} from 'lucide-react'

interface Player {
  id: string
  name: string
  notes: string | null
  auto_created: boolean
  created_at: string
}

interface PlayerStats {
  totalMatches: number
  winsAsOpponent: number
  lossesAsOpponent: number
  winsAsPartner: number
  lossesAsPartner: number
  lastPlayed: string | null
}

export default function PlayersPage() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const [players, setPlayers] = useState<Player[]>([])
  const [stats, setStats] = useState<Record<string, PlayerStats>>({})
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')

  // Add/Edit state
  const [showAddForm, setShowAddForm] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [formName, setFormName] = useState('')
  const [formNotes, setFormNotes] = useState('')
  const [saving, setSaving] = useState(false)

  // Delete state
  const [deletingId, setDeletingId] = useState<string | null>(null)

  // Merge state
  const [mergeMode, setMergeMode] = useState(false)
  const [mergeSelection, setMergeSelection] = useState<string[]>([])
  const [merging, setMerging] = useState(false)

  const loadPlayers = useCallback(async () => {
    if (!user) return
    const { data } = await supabase
      .from('players')
      .select('*')
      .eq('user_id', user.id)
      .order('name')

    if (data) setPlayers(data)
  }, [user])

  const loadStats = useCallback(async () => {
    if (!user) return

    // Get all matches with their opponents
    const { data: matches } = await supabase
      .from('matches')
      .select('id, date, result, partner_id')
      .eq('user_id', user.id)

    const { data: opponents } = await supabase
      .from('match_opponents')
      .select('match_id, player_id')

    if (!matches || !opponents) return

    const matchMap = new Map(matches.map(m => [m.id, m]))
    const statsMap: Record<string, PlayerStats> = {}

    const ensureStats = (pid: string): PlayerStats => {
      if (!statsMap[pid]) {
        statsMap[pid] = {
          totalMatches: 0, winsAsOpponent: 0, lossesAsOpponent: 0,
          winsAsPartner: 0, lossesAsPartner: 0, lastPlayed: null,
        }
      }
      return statsMap[pid]
    }

    // Stats as opponent
    for (const opp of opponents) {
      const match = matchMap.get(opp.match_id)
      if (!match) continue
      const s = ensureStats(opp.player_id)
      s.totalMatches++
      if (match.result === 'win' || match.result === 'walkover') s.lossesAsOpponent++
      else s.winsAsOpponent++
      if (!s.lastPlayed || match.date > s.lastPlayed) s.lastPlayed = match.date
    }

    // Stats as partner
    for (const match of matches) {
      if (!match.partner_id) continue
      const s = ensureStats(match.partner_id)
      s.totalMatches++
      if (match.result === 'win' || match.result === 'walkover') s.winsAsPartner++
      else s.lossesAsPartner++
      if (!s.lastPlayed || match.date > s.lastPlayed) s.lastPlayed = match.date
    }

    setStats(statsMap)
  }, [user])

  useEffect(() => {
    Promise.all([loadPlayers(), loadStats()]).then(() => setLoading(false))
  }, [loadPlayers, loadStats])

  const handleAdd = async () => {
    if (!user || !formName.trim()) return
    setSaving(true)
    const { error } = await supabase.from('players').insert({
      user_id: user.id,
      name: formName.trim(),
      notes: formNotes.trim() || null,
      auto_created: false,
    })
    if (!error) {
      setFormName('')
      setFormNotes('')
      setShowAddForm(false)
      await Promise.all([loadPlayers(), loadStats()])
    }
    setSaving(false)
  }

  const startEdit = (player: Player) => {
    setEditingId(player.id)
    setFormName(player.name)
    setFormNotes(player.notes || '')
  }

  const handleEdit = async () => {
    if (!editingId || !formName.trim()) return
    setSaving(true)
    const { error } = await supabase
      .from('players')
      .update({ name: formName.trim(), notes: formNotes.trim() || null })
      .eq('id', editingId)
    if (!error) {
      setEditingId(null)
      setFormName('')
      setFormNotes('')
      await loadPlayers()
    }
    setSaving(false)
  }

  const handleDelete = async (id: string) => {
    const { error } = await supabase.from('players').delete().eq('id', id)
    if (!error) {
      setDeletingId(null)
      await Promise.all([loadPlayers(), loadStats()])
    }
  }

  const toggleMergeSelect = (id: string) => {
    setMergeSelection(prev =>
      prev.includes(id) ? prev.filter(x => x !== id) : prev.length < 2 ? [...prev, id] : prev
    )
  }

  const handleMerge = async () => {
    if (mergeSelection.length !== 2) return
    const [keepId, removeId] = mergeSelection
    const keepPlayer = players.find(p => p.id === keepId)
    const removePlayer = players.find(p => p.id === removeId)
    if (!keepPlayer || !removePlayer) return

    if (!confirm(`Merge "${removePlayer.name}" into "${keepPlayer.name}"? All matches from "${removePlayer.name}" will be reassigned to "${keepPlayer.name}" and "${removePlayer.name}" will be deleted.`)) return

    setMerging(true)

    // Update match_opponents
    await supabase
      .from('match_opponents')
      .update({ player_id: keepId })
      .eq('player_id', removeId)

    // Update matches partner_id
    await supabase
      .from('matches')
      .update({ partner_id: keepId })
      .eq('partner_id', removeId)

    // Delete the merged player
    await supabase.from('players').delete().eq('id', removeId)

    setMergeMode(false)
    setMergeSelection([])
    setMerging(false)
    await Promise.all([loadPlayers(), loadStats()])
  }

  const filtered = players.filter(p =>
    p.name.toLowerCase().includes(search.toLowerCase())
  )

  if (loading) {
    return (
      <div className="p-4 md:p-8 flex items-center justify-center min-h-[50vh]">
        <Loader2 className="animate-spin text-green-600" size={32} />
      </div>
    )
  }

  return (
    <div className="p-4 md:p-8 max-w-2xl">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-2xl font-bold text-gray-900">Players</h1>
        <div className="flex gap-2">
          {players.length >= 2 && (
            <button
              onClick={() => { setMergeMode(!mergeMode); setMergeSelection([]) }}
              className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                mergeMode
                  ? 'bg-amber-100 text-amber-700'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              <Merge size={16} />
              {mergeMode ? 'Cancel' : 'Merge'}
            </button>
          )}
          <button
            onClick={() => { setShowAddForm(true); setFormName(''); setFormNotes('') }}
            className="flex items-center gap-1.5 px-3 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg text-sm font-medium transition-colors"
          >
            <UserPlus size={16} />
            Add Player
          </button>
        </div>
      </div>

      {/* Search */}
      {players.length > 0 && (
        <div className="relative mb-4">
          <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search players..."
            aria-label="Search players"
            className="w-full pl-10 pr-3 py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent"
          />
        </div>
      )}

      {/* Merge bar */}
      {mergeMode && (
        <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 mb-4 flex items-center justify-between">
          <p className="text-sm text-amber-800">
            Select 2 players to merge. The first selected is kept, the second is merged into it.
            {mergeSelection.length > 0 && ` (${mergeSelection.length}/2 selected)`}
          </p>
          {mergeSelection.length === 2 && (
            <button
              onClick={handleMerge}
              disabled={merging}
              className="px-3 py-1.5 bg-amber-600 hover:bg-amber-700 text-white rounded-lg text-sm font-medium transition-colors disabled:opacity-50"
            >
              {merging ? 'Merging...' : 'Merge Players'}
            </button>
          )}
        </div>
      )}

      {/* Add form */}
      {showAddForm && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4 mb-4">
          <h3 className="text-sm font-semibold text-gray-900 mb-3">New Player</h3>
          <input
            type="text"
            value={formName}
            onChange={(e) => setFormName(e.target.value)}
            placeholder="Player name"
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm mb-2 focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent"
            autoFocus
          />
          <textarea
            value={formNotes}
            onChange={(e) => setFormNotes(e.target.value)}
            placeholder="Notes (optional)"
            rows={2}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm mb-3 focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent resize-none"
          />
          <div className="flex gap-2 justify-end">
            <button
              onClick={() => setShowAddForm(false)}
              className="px-3 py-1.5 text-sm text-gray-600 hover:text-gray-800"
            >
              Cancel
            </button>
            <button
              onClick={handleAdd}
              disabled={saving || !formName.trim()}
              className="px-4 py-1.5 bg-green-600 hover:bg-green-700 text-white rounded-lg text-sm font-medium transition-colors disabled:opacity-50"
            >
              {saving ? 'Adding...' : 'Add Player'}
            </button>
          </div>
        </div>
      )}

      {/* Player list */}
      {players.length === 0 ? (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-8 text-center">
          <Users className="mx-auto text-gray-300 mb-3" size={48} />
          <h3 className="text-base font-semibold text-gray-700 mb-1">No players yet</h3>
          <p className="text-sm text-gray-500 mb-4">Add your first opponent or doubles partner to get started.</p>
          <button
            onClick={() => { setShowAddForm(true); setFormName(''); setFormNotes('') }}
            className="inline-flex items-center gap-1.5 px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg text-sm font-medium transition-colors"
          >
            <UserPlus size={16} />
            Add Player
          </button>
        </div>
      ) : filtered.length === 0 ? (
        <p className="text-sm text-gray-500 text-center py-8">No players match "{search}"</p>
      ) : (
        <div className="space-y-2">
          {filtered.map((player) => {
            const s = stats[player.id]
            const isEditing = editingId === player.id
            const isDeleting = deletingId === player.id
            const isMergeSelected = mergeSelection.includes(player.id)

            return (
              <div
                key={player.id}
                className={`bg-white rounded-xl shadow-sm border p-4 transition-colors ${
                  mergeMode
                    ? isMergeSelected
                      ? 'border-amber-400 bg-amber-50 cursor-pointer'
                      : mergeSelection.length < 2
                        ? 'border-gray-100 cursor-pointer hover:border-amber-300'
                        : 'border-gray-100 opacity-50'
                    : 'border-gray-100'
                }`}
                onClick={mergeMode ? () => toggleMergeSelect(player.id) : undefined}
              >
                {isEditing ? (
                  /* Edit form inline */
                  <div>
                    <input
                      type="text"
                      value={formName}
                      onChange={(e) => setFormName(e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm mb-2 focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent"
                      autoFocus
                    />
                    <textarea
                      value={formNotes}
                      onChange={(e) => setFormNotes(e.target.value)}
                      placeholder="Notes (optional)"
                      rows={2}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm mb-2 focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent resize-none"
                    />
                    <div className="flex gap-2 justify-end">
                      <button
                        onClick={() => setEditingId(null)}
                        className="p-1.5 text-gray-500 hover:text-gray-600"
                      >
                        <X size={16} />
                      </button>
                      <button
                        onClick={handleEdit}
                        disabled={saving || !formName.trim()}
                        className="p-1.5 text-green-600 hover:text-green-700 disabled:opacity-50"
                      >
                        <Check size={16} />
                      </button>
                    </div>
                  </div>
                ) : isDeleting ? (
                  /* Delete confirmation */
                  <div className="flex items-center justify-between">
                    <p className="text-sm text-red-600">
                      Delete <span className="font-semibold">{player.name}</span>? This cannot be undone.
                    </p>
                    <div className="flex gap-2">
                      <button
                        onClick={() => setDeletingId(null)}
                        className="px-3 py-1.5 text-sm text-gray-600 hover:text-gray-800"
                      >
                        Cancel
                      </button>
                      <button
                        onClick={() => handleDelete(player.id)}
                        className="px-3 py-1.5 bg-red-600 hover:bg-red-700 text-white rounded-lg text-sm font-medium transition-colors"
                      >
                        Delete
                      </button>
                    </div>
                  </div>
                ) : (
                  /* Normal display */
                  <div className="flex items-start justify-between">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <button
                          onClick={(e) => { e.stopPropagation(); navigate(`/h2h/${player.id}`) }}
                          className="text-sm font-semibold text-green-600 hover:text-green-700 hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-green-500 rounded"
                        >
                          {player.name}
                        </button>
                        {player.auto_created && (
                          <span className="text-[10px] px-1.5 py-0.5 bg-amber-100 text-amber-700 rounded-full">auto</span>
                        )}
                        {mergeMode && isMergeSelected && (
                          <span className="text-[10px] px-1.5 py-0.5 bg-amber-500 text-white rounded-full font-semibold">
                            {mergeSelection.indexOf(player.id) === 0 ? 'Keep' : 'Merge into'}
                          </span>
                        )}
                      </div>
                      {player.notes && (
                        <p className="text-xs text-gray-500 mt-0.5 truncate">{player.notes}</p>
                      )}
                      {s ? (
                        <div className="flex flex-wrap gap-x-4 gap-y-1 mt-2 text-xs text-gray-500">
                          <span>{s.totalMatches} match{s.totalMatches !== 1 ? 'es' : ''}</span>
                          <span>
                            vs: <span className="text-green-600 font-medium">{s.lossesAsOpponent}W</span>
                            {' '}<span className="text-red-500 font-medium">{s.winsAsOpponent}L</span>
                          </span>
                          {(s.winsAsPartner > 0 || s.lossesAsPartner > 0) && (
                            <span>
                              partner: <span className="text-green-600 font-medium">{s.winsAsPartner}W</span>
                              {' '}<span className="text-red-500 font-medium">{s.lossesAsPartner}L</span>
                            </span>
                          )}
                          {s.lastPlayed && (
                            <span>Last: {format(new Date(s.lastPlayed), 'MMM d, yyyy')}</span>
                          )}
                        </div>
                      ) : (
                        <p className="text-xs text-gray-500 mt-2">No matches yet</p>
                      )}
                    </div>
                    {!mergeMode && (
                      <div className="flex items-center gap-1 ml-2">
                        <button
                          onClick={() => startEdit(player)}
                          aria-label={`Edit ${player.name}`}
                          className="p-1.5 text-gray-500 hover:text-gray-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-green-500 rounded"
                        >
                          <Pencil size={14} />
                        </button>
                        <button
                          onClick={() => setDeletingId(player.id)}
                          aria-label={`Delete ${player.name}`}
                          className="p-1.5 text-gray-500 hover:text-red-500 focus:outline-none focus-visible:ring-2 focus-visible:ring-red-500 rounded"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
