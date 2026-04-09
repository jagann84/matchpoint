import { useState, useEffect, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { fetchSingleMatch, deleteMatch, restoreMatch, type MatchWithDetails } from '../lib/matchQueries'
import { supabase } from '../lib/supabase'
import { showToast } from '../components/Toast'
import { format } from 'date-fns'
import {
  ArrowLeft, Pencil, Trash2, Loader2, ChevronDown, ChevronUp, X, Check, Plus,
} from 'lucide-react'
import { SURFACES, MATCH_TYPES, RESULTS, isSurface, isMatchType, isResult } from '../lib/constants'

export default function MatchDetailPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const [match, setMatch] = useState<MatchWithDetails | null>(null)
  const [loading, setLoading] = useState(true)
  const [showRawInput, setShowRawInput] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)

  // Edit mode
  const [editing, setEditing] = useState(false)
  const [saving, setSaving] = useState(false)
  const [editForm, setEditForm] = useState({
    date: '',
    result: '',
    surface: '',
    match_type: '',
    location: '',
    notes: '',
    is_competitive: false,
    sets: [] as { my_games: number; opponent_games: number }[],
    tags: [] as string[],
  })
  const [newTag, setNewTag] = useState('')

  const loadMatch = useCallback(async () => {
    if (!id) return
    const m = await fetchSingleMatch(id)
    setMatch(m)
    setLoading(false)
  }, [id])

  useEffect(() => { loadMatch() }, [loadMatch])

  const startEditing = () => {
    if (!match) return
    setEditForm({
      date: match.date,
      result: match.result,
      surface: match.surface,
      match_type: match.match_type,
      location: match.location || '',
      notes: match.notes || '',
      is_competitive: match.is_competitive,
      sets: match.sets.map(s => ({ my_games: s.my_games, opponent_games: s.opponent_games })),
      tags: [...match.tags],
    })
    setEditing(true)
    setConfirmDelete(false)
  }

  const cancelEditing = () => {
    setEditing(false)
    setNewTag('')
  }

  const handleSave = async () => {
    if (!match || !id) return

    // Enum guard: the UI only ever lets the user pick valid values via
    // buttons, but something could have mutated state between render and
    // click (browser extensions, stale form state, future code changes).
    // Refuse to send an unknown value to the DB — a silent corruption
    // would cause weird display bugs weeks later that are hard to trace.
    if (!isResult(editForm.result)) {
      showToast(`Invalid result value: "${editForm.result}"`, 'error')
      return
    }
    if (!isSurface(editForm.surface)) {
      showToast(`Invalid surface value: "${editForm.surface}"`, 'error')
      return
    }
    if (!isMatchType(editForm.match_type)) {
      showToast(`Invalid match type: "${editForm.match_type}"`, 'error')
      return
    }

    // Validate: non-walkover matches need at least one set
    if (editForm.result !== 'walkover' && editForm.sets.length === 0) {
      showToast('Add at least one set score', 'error')
      return
    }

    setSaving(true)

    // Update match record
    const { error: matchError } = await supabase.from('matches').update({
      date: editForm.date,
      result: editForm.result,
      surface: editForm.surface,
      match_type: editForm.match_type,
      location: editForm.location || null,
      notes: editForm.notes || null,
      is_competitive: editForm.is_competitive,
    }).eq('id', id)

    if (matchError) {
      showToast('Failed to save changes', 'error')
      setSaving(false)
      return
    }

    // Update sets — delete old and re-insert
    await supabase.from('match_sets').delete().eq('match_id', id)
    if (editForm.sets.length > 0) {
      await supabase.from('match_sets').insert(
        editForm.sets.map((s, i) => ({
          match_id: id,
          set_number: i + 1,
          my_games: s.my_games,
          opponent_games: s.opponent_games,
          is_tiebreak: false,
          tiebreak_score: null,
        }))
      )
    }

    // Update tags — delete old and re-insert
    await supabase.from('match_tags').delete().eq('match_id', id)
    if (editForm.tags.length > 0) {
      await supabase.from('match_tags').insert(
        editForm.tags.map(tag => ({ match_id: id, tag_id: tag }))
      )
    }

    showToast('Match updated', 'success')
    setEditing(false)
    setSaving(false)
    await loadMatch()
  }

  const addTag = () => {
    const trimmed = newTag.trim()
    if (trimmed && !editForm.tags.includes(trimmed)) {
      setEditForm(prev => ({ ...prev, tags: [...prev.tags, trimmed] }))
      setNewTag('')
    }
  }

  const removeTag = (tag: string) => {
    setEditForm(prev => ({ ...prev, tags: prev.tags.filter(t => t !== tag) }))
  }

  const updateSet = (index: number, field: 'my_games' | 'opponent_games', value: number) => {
    setEditForm(prev => ({
      ...prev,
      sets: prev.sets.map((s, i) => i === index ? { ...s, [field]: value } : s),
    }))
  }

  const addSet = () => {
    setEditForm(prev => ({ ...prev, sets: [...prev.sets, { my_games: 0, opponent_games: 0 }] }))
  }

  const removeSet = (index: number) => {
    setEditForm(prev => ({ ...prev, sets: prev.sets.filter((_, i) => i !== index) }))
  }

  const handleDelete = async () => {
    if (!id) return
    const ok = await deleteMatch(id)
    if (ok) {
      showToast('Match deleted', 'success', undefined, async () => {
        const restored = await restoreMatch(id)
        if (restored) {
          showToast('Match restored', 'success')
          navigate(`/history/${id}`)
        } else {
          showToast('Failed to restore match', 'error')
        }
      }, 'Undo')
      navigate('/history', { replace: true })
    } else {
      showToast('Failed to delete match', 'error')
    }
  }

  if (loading) {
    return (
      <div className="p-4 md:p-8 flex items-center justify-center min-h-[50vh]">
        <Loader2 className="animate-spin text-green-600" size={32} />
      </div>
    )
  }

  if (!match) {
    return (
      <div className="p-4 md:p-8">
        <p className="text-gray-500">Match not found.</p>
        <button onClick={() => navigate('/history')} className="text-green-600 text-sm mt-2">← Back to History</button>
      </div>
    )
  }

  const opponentStr = match.opponents.map(o => o.name).join(' & ')
  const scoreStr = match.result === 'walkover'
    ? 'W/O'
    : match.sets.map(s => `${s.my_games}-${s.opponent_games}`).join(', ')

  return (
    <div className="p-4 md:p-8 max-w-2xl">
      {/* Header */}
      <button onClick={() => navigate('/history')} className="flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700 mb-4 focus:outline-none focus-visible:text-gray-700">
        <ArrowLeft size={16} /> Back to History
      </button>

      {/* Result banner */}
      {editing ? (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4 mb-4 space-y-3">
          <div className="flex items-center justify-between mb-1">
            <h2 className="text-sm font-semibold text-gray-900">Edit Match</h2>
            <div className="flex gap-2">
              <button onClick={cancelEditing} className="px-3 py-1.5 text-sm text-gray-600 hover:text-gray-800 font-medium">
                Cancel
              </button>
              <button
                onClick={handleSave}
                disabled={saving}
                className="px-3 py-1.5 bg-green-700 hover:bg-green-800 text-white rounded-lg text-sm font-medium transition-colors disabled:opacity-50"
              >
                {saving ? 'Saving...' : 'Save'}
              </button>
            </div>
          </div>

          {/* Date */}
          <EditField label="Date">
            <input
              type="date"
              value={editForm.date}
              onChange={e => setEditForm(prev => ({ ...prev, date: e.target.value }))}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
            />
          </EditField>

          {/* Result */}
          <EditField label="Result">
            <div className="flex gap-2">
              {RESULTS.map(r => (
                <button
                  key={r.value}
                  onClick={() => setEditForm(prev => ({ ...prev, result: r.value }))}
                  className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                    editForm.result === r.value
                      ? r.value === 'win' ? 'bg-green-700 text-white' : r.value === 'loss' ? 'bg-red-600 text-white' : 'bg-blue-600 text-white'
                      : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                  }`}
                >
                  {r.label}
                </button>
              ))}
            </div>
          </EditField>

          {/* Score */}
          {editForm.result !== 'walkover' && (
            <EditField label="Score">
              <div className="space-y-2">
                {editForm.sets.map((s, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <span className="text-xs text-gray-500 w-8">S{i + 1}</span>
                    <input
                      type="number"
                      min={0} max={7}
                      value={s.my_games}
                      onChange={e => updateSet(i, 'my_games', parseInt(e.target.value) || 0)}
                      className="w-14 px-2 py-1.5 border border-gray-300 rounded-lg text-sm text-center focus:outline-none focus:ring-2 focus:ring-green-500"
                    />
                    <span className="text-gray-500">-</span>
                    <input
                      type="number"
                      min={0} max={7}
                      value={s.opponent_games}
                      onChange={e => updateSet(i, 'opponent_games', parseInt(e.target.value) || 0)}
                      className="w-14 px-2 py-1.5 border border-gray-300 rounded-lg text-sm text-center focus:outline-none focus:ring-2 focus:ring-green-500"
                    />
                    <button onClick={() => removeSet(i)} className="p-1 text-gray-500 hover:text-red-500">
                      <X size={14} />
                    </button>
                  </div>
                ))}
                <button
                  onClick={addSet}
                  className="text-xs text-green-700 hover:text-green-800 font-medium flex items-center gap-1"
                >
                  <Plus size={12} /> Add set
                </button>
              </div>
            </EditField>
          )}

          {/* Surface */}
          <EditField label="Surface">
            <div className="flex flex-wrap gap-2">
              {SURFACES.map(s => (
                <button
                  key={s.value}
                  onClick={() => setEditForm(prev => ({ ...prev, surface: s.value }))}
                  className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                    editForm.surface === s.value ? 'bg-green-700 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                  }`}
                >
                  {s.label}
                </button>
              ))}
            </div>
          </EditField>

          {/* Match Type */}
          <EditField label="Match Type">
            <div className="flex flex-wrap gap-2">
              {MATCH_TYPES.map(t => (
                <button
                  key={t.value}
                  onClick={() => setEditForm(prev => ({ ...prev, match_type: t.value }))}
                  className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                    editForm.match_type === t.value ? 'bg-green-700 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                  }`}
                >
                  {t.label}
                </button>
              ))}
            </div>
          </EditField>

          {/* Location */}
          <EditField label="Location">
            <input
              type="text"
              value={editForm.location}
              onChange={e => setEditForm(prev => ({ ...prev, location: e.target.value }))}
              placeholder="Optional"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
            />
          </EditField>

          {/* Competitive */}
          <EditField label="Competitive">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={editForm.is_competitive}
                onChange={e => setEditForm(prev => ({ ...prev, is_competitive: e.target.checked }))}
                className="w-4 h-4 rounded border-gray-300 text-green-600 focus:ring-green-500"
              />
              <span className="text-sm text-gray-700">This was a competitive match</span>
            </label>
          </EditField>

          {/* Notes */}
          <EditField label="Notes">
            <textarea
              value={editForm.notes}
              onChange={e => setEditForm(prev => ({ ...prev, notes: e.target.value }))}
              placeholder="Optional match notes..."
              rows={3}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-green-500 resize-none"
            />
          </EditField>

          {/* Tags */}
          <EditField label="Tags">
            <div className="space-y-2">
              {editForm.tags.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {editForm.tags.map(tag => (
                    <span key={tag} className="inline-flex items-center gap-1 px-2.5 py-1 bg-gray-100 rounded-full text-xs text-gray-700">
                      {tag}
                      <button onClick={() => removeTag(tag)} className="text-gray-500 hover:text-red-500">
                        <X size={12} />
                      </button>
                    </span>
                  ))}
                </div>
              )}
              <div className="flex gap-2">
                <input
                  type="text"
                  value={newTag}
                  onChange={e => setNewTag(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addTag() } }}
                  placeholder="Add tag..."
                  className="flex-1 px-3 py-1.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
                />
                <button
                  onClick={addTag}
                  disabled={!newTag.trim()}
                  className="px-3 py-1.5 bg-gray-100 hover:bg-gray-200 text-gray-600 rounded-lg text-sm transition-colors disabled:opacity-50"
                >
                  <Plus size={14} />
                </button>
              </div>
            </div>
          </EditField>
        </div>
      ) : (
        <>
          <div className={`rounded-xl p-5 mb-4 ${
            match.result === 'win' ? 'bg-green-50 border border-green-200' :
            match.result === 'walkover' ? 'bg-blue-50 border border-blue-200' :
            'bg-red-50 border border-red-200'
          }`}>
            <div className="flex items-center justify-between">
              <div>
                <span className={`text-lg font-bold ${
                  match.result === 'win' ? 'text-green-700' :
                  match.result === 'walkover' ? 'text-blue-700' :
                  'text-red-700'
                }`}>
                  {match.result === 'win' ? 'WIN' : match.result === 'walkover' ? 'WALKOVER' : 'LOSS'}
                </span>
                <p className="text-sm text-gray-600 mt-0.5">
                  {format(new Date(match.date), 'EEEE, MMMM d, yyyy')}
                </p>
              </div>
              <span className="text-2xl font-mono font-bold text-gray-800">{scoreStr}</span>
            </div>
          </div>

          {/* Scoreboard */}
          {match.sets.length > 0 && (
            <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4 mb-4">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-gray-500 text-xs">
                    <th scope="col" className="text-left font-medium py-1">Player</th>
                    {match.sets.map((_, i) => (
                      <th scope="col" key={i} className="text-center font-medium py-1 w-12">S{i + 1}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  <tr className={match.result === 'win' ? 'font-semibold text-gray-900' : 'text-gray-600'}>
                    <td className="py-1.5">You{match.partner_name ? ` & ${match.partner_name}` : ''}</td>
                    {match.sets.map((s, i) => (
                      <td key={i} className="text-center py-1.5">
                        {s.my_games}
                        {s.is_tiebreak && <sup className="text-[10px] text-gray-500 ml-0.5">tb</sup>}
                      </td>
                    ))}
                  </tr>
                  <tr className={match.result === 'loss' ? 'font-semibold text-gray-900' : 'text-gray-600'}>
                    <td className="py-1.5">{opponentStr}</td>
                    {match.sets.map((s, i) => (
                      <td key={i} className="text-center py-1.5">
                        {s.opponent_games}
                        {s.is_tiebreak && <sup className="text-[10px] text-gray-500 ml-0.5">tb</sup>}
                      </td>
                    ))}
                  </tr>
                </tbody>
              </table>
            </div>
          )}

          {/* Details */}
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4 mb-4 space-y-3">
            <div className="flex justify-between items-center">
              <span className="text-xs font-medium text-gray-500 uppercase">Opponent(s)</span>
              <div className="flex gap-1.5">
                {match.opponents.map(o => (
                  <button
                    key={o.id}
                    onClick={() => navigate(`/h2h/${o.id}`)}
                    className="text-sm text-green-600 hover:text-green-700 hover:underline font-medium"
                  >
                    {o.name}
                  </button>
                ))}
              </div>
            </div>
            {match.format === 'doubles' && match.partner_name && match.partner_id && (
              <div className="flex justify-between items-center">
                <span className="text-xs font-medium text-gray-500 uppercase">Partner</span>
                <button
                  onClick={() => navigate(`/partner/${match.partner_id}`)}
                  className="text-sm text-green-600 hover:text-green-700 hover:underline font-medium"
                >
                  {match.partner_name}
                </button>
              </div>
            )}
            <DetailRow label="Format" value={match.format === 'singles' ? 'Singles' : 'Doubles'} />
            <DetailRow label="Surface" value={match.surface.replace('-', ' ')} capitalize />
            <DetailRow label="Match Type" value={match.match_type} capitalize />
            {match.league_name && <DetailRow label="League" value={match.league_name} />}
            {match.location && <DetailRow label="Location" value={match.location} />}
            <DetailRow label="Competitive" value={match.is_competitive ? 'Yes' : 'No'} />
            {match.is_pro_set && <DetailRow label="Pro Set" value="Yes" />}
            {match.third_set_tiebreak && <DetailRow label="3rd Set Tiebreak" value="10-point tiebreak" />}
            {match.retired && <DetailRow label="Retired" value="Yes" />}
          </div>

          {/* Notes */}
          {match.notes && (
            <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4 mb-4">
              <h3 className="text-xs font-medium text-gray-500 uppercase mb-2">Notes</h3>
              <p className="text-sm text-gray-700 whitespace-pre-wrap">{match.notes}</p>
            </div>
          )}

          {/* Tags */}
          {match.tags.length > 0 && (
            <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4 mb-4">
              <h3 className="text-xs font-medium text-gray-500 uppercase mb-2">Tags</h3>
              <div className="flex flex-wrap gap-1.5">
                {match.tags.map(tag => (
                  <span key={tag} className="px-2.5 py-1 bg-gray-100 rounded-full text-xs text-gray-700">{tag}</span>
                ))}
              </div>
            </div>
          )}

          {/* Raw input (collapsible) */}
          {match.raw_input && (
            <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4 mb-4">
              <button
                onClick={() => setShowRawInput(!showRawInput)}
                className="flex items-center gap-1.5 text-xs font-medium text-gray-500 uppercase hover:text-gray-600"
              >
                Original Input
                {showRawInput ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
              </button>
              {showRawInput && (
                <p className="text-sm text-gray-500 mt-2 italic">"{match.raw_input}"</p>
              )}
            </div>
          )}

          {/* Actions */}
          <div className="flex gap-3">
            <button
              onClick={startEditing}
              className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 border border-gray-300 text-gray-700 rounded-lg text-sm font-medium hover:bg-gray-50 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-green-500"
            >
              <Pencil size={16} /> Edit
            </button>
            {confirmDelete ? (
              <div className="flex-1 flex gap-2">
                <button
                  onClick={() => setConfirmDelete(false)}
                  className="flex-1 px-3 py-2.5 border border-gray-300 text-gray-700 rounded-lg text-sm font-medium hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  onClick={handleDelete}
                  className="flex-1 px-3 py-2.5 bg-red-600 hover:bg-red-700 text-white rounded-lg text-sm font-medium transition-colors"
                >
                  Confirm
                </button>
              </div>
            ) : (
              <button
                onClick={() => setConfirmDelete(true)}
                className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 border border-red-200 text-red-600 rounded-lg text-sm font-medium hover:bg-red-50 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-red-500"
              >
                <Trash2 size={16} /> Delete
              </button>
            )}
          </div>
        </>
      )}
    </div>
  )
}

function EditField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-xs font-medium text-gray-500 uppercase mb-1.5">{label}</label>
      {children}
    </div>
  )
}

function DetailRow({ label, value, capitalize }: { label: string; value: string; capitalize?: boolean }) {
  return (
    <div className="flex justify-between items-center">
      <span className="text-xs font-medium text-gray-500 uppercase">{label}</span>
      <span className={`text-sm text-gray-700 ${capitalize ? 'capitalize' : ''}`}>{value}</span>
    </div>
  )
}
