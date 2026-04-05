import { useState, useEffect, useCallback } from 'react'
import { useAuth } from '../contexts/AuthContext'
import { supabase } from '../lib/supabase'
import { Eye, EyeOff, Plus, X, Pencil, Trash2, Check, Loader2, Target, Download, Upload, Tag } from 'lucide-react'
import { exportAsJSON, exportAsCSV, importFromJSON } from '../lib/exportImport'
import { showToast } from '../components/Toast'

type Surface = 'hard' | 'clay' | 'grass' | 'indoor-hard' | 'indoor-clay' | 'other'
type MatchType = 'practice' | 'friendly' | 'league' | 'tournament'

interface UserSettings {
  id?: string
  anthropic_api_key: string
  default_surface: Surface
  default_match_type: MatchType
  custom_locations: string[]
}

interface League {
  id: string
  name: string
  type: 'league' | 'tournament'
  auto_created: boolean
}

interface Goal {
  id: string
  target_win_rate: number
  year: number
  match_type_filter: string | null
  league_filter: string | null
  competitive_only: boolean
  is_active: boolean
}

interface CustomTag {
  id: string
  label: string
  category: string
  keywords: string[]
}

const TAG_CATEGORIES = [
  'serve', 'return', 'net', 'baseline', 'mental', 'fitness', 'other',
]

const SURFACES: { value: Surface; label: string }[] = [
  { value: 'hard', label: 'Hard' },
  { value: 'clay', label: 'Clay' },
  { value: 'grass', label: 'Grass' },
  { value: 'indoor-hard', label: 'Indoor Hard' },
  { value: 'indoor-clay', label: 'Indoor Clay' },
  { value: 'other', label: 'Other' },
]

const MATCH_TYPES: { value: MatchType; label: string }[] = [
  { value: 'practice', label: 'Practice' },
  { value: 'friendly', label: 'Friendly' },
  { value: 'league', label: 'League' },
  { value: 'tournament', label: 'Tournament' },
]

export default function SettingsPage() {
  const { user, signOut } = useAuth()
  const [settings, setSettings] = useState<UserSettings>({
    anthropic_api_key: '',
    default_surface: 'hard',
    default_match_type: 'friendly',
    custom_locations: [],
  })
  const [showApiKey, setShowApiKey] = useState(false)
  const [testingKey, setTestingKey] = useState(false)
  const [testResult, setTestResult] = useState<{ ok: boolean; message: string } | null>(null)
  const [saving, setSaving] = useState(false)
  const [saveMessage, setSaveMessage] = useState('')
  const [loading, setLoading] = useState(true)

  // Locations state
  const [newLocation, setNewLocation] = useState('')

  // Leagues state
  const [leagues, setLeagues] = useState<League[]>([])
  const [newLeagueName, setNewLeagueName] = useState('')
  const [newLeagueType, setNewLeagueType] = useState<'league' | 'tournament'>('league')
  const [editingLeague, setEditingLeague] = useState<string | null>(null)
  const [editLeagueName, setEditLeagueName] = useState('')

  // Tags state
  const [customTags, setCustomTags] = useState<CustomTag[]>([])
  const [showTagForm, setShowTagForm] = useState(false)
  const [tagForm, setTagForm] = useState({ label: '', category: 'other', keywords: '' })

  // Export/Import state
  const [exporting, setExporting] = useState(false)
  const [importing, setImporting] = useState(false)

  // Goals state
  const [goals, setGoals] = useState<Goal[]>([])
  const [showGoalForm, setShowGoalForm] = useState(false)
  const [editingGoalId, setEditingGoalId] = useState<string | null>(null)
  const [goalForm, setGoalForm] = useState({
    target_win_rate: 60,
    year: new Date().getFullYear(),
    match_type_filter: '' as string,
    league_filter: '' as string,
    competitive_only: true,
  })

  const loadSettings = useCallback(async () => {
    if (!user) return
    const { data } = await supabase
      .from('user_settings')
      .select('*')
      .eq('user_id', user.id)
      .single()

    if (data) {
      setSettings({
        id: data.id,
        anthropic_api_key: data.anthropic_api_key || '',
        default_surface: data.default_surface || 'hard',
        default_match_type: data.default_match_type || 'friendly',
        custom_locations: data.custom_locations || [],
      })
    }
    setLoading(false)
  }, [user])

  const loadLeagues = useCallback(async () => {
    if (!user) return
    const { data } = await supabase
      .from('leagues')
      .select('*')
      .eq('user_id', user.id)
      .order('name')

    if (data) setLeagues(data)
  }, [user])

  const loadGoals = useCallback(async () => {
    if (!user) return
    const { data } = await supabase
      .from('goals')
      .select('*')
      .eq('user_id', user.id)
      .order('year', { ascending: false })
    if (data) setGoals(data)
  }, [user])

  const loadCustomTags = useCallback(async () => {
    if (!user) return
    const { data } = await supabase
      .from('custom_tags')
      .select('*')
      .eq('user_id', user.id)
      .order('category')
    if (data) setCustomTags(data)
  }, [user])

  useEffect(() => {
    loadSettings()
    loadLeagues()
    loadGoals()
    loadCustomTags()
  }, [loadSettings, loadLeagues, loadGoals, loadCustomTags])

  const saveSettings = async (updates: Partial<UserSettings>) => {
    if (!user) return
    setSaving(true)
    setSaveMessage('')

    const updatedSettings = { ...settings, ...updates }
    setSettings(updatedSettings)

    const payload = {
      user_id: user.id,
      anthropic_api_key: updatedSettings.anthropic_api_key || null,
      default_surface: updatedSettings.default_surface,
      default_match_type: updatedSettings.default_match_type,
      custom_locations: updatedSettings.custom_locations,
      updated_at: new Date().toISOString(),
    }

    if (settings.id) {
      const { error } = await supabase
        .from('user_settings')
        .update(payload)
        .eq('id', settings.id)
      if (error) {
        setSaveMessage('Failed to save settings')
      } else {
        setSaveMessage('Settings saved')
      }
    } else {
      const { data, error } = await supabase
        .from('user_settings')
        .insert(payload)
        .select()
        .single()
      if (error) {
        setSaveMessage('Failed to save settings')
      } else {
        setSettings(prev => ({ ...prev, id: data.id }))
        setSaveMessage('Settings saved')
      }
    }

    setSaving(false)
    setTimeout(() => setSaveMessage(''), 3000)
  }

  const testApiKey = async () => {
    if (!settings.anthropic_api_key) {
      setTestResult({ ok: false, message: 'Enter an API key first' })
      return
    }
    setTestingKey(true)
    setTestResult(null)

    try {
      const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': settings.anthropic_api_key,
          'anthropic-version': '2023-06-01',
          'anthropic-dangerous-direct-browser-access': 'true',
        },
        body: JSON.stringify({
          model: 'claude-sonnet-4-20250514',
          max_tokens: 10,
          messages: [{ role: 'user', content: 'Hi' }],
        }),
      })

      if (response.ok) {
        setTestResult({ ok: true, message: 'API key is valid!' })
      } else {
        const data = await response.json()
        setTestResult({ ok: false, message: data.error?.message || 'Invalid API key' })
      }
    } catch {
      setTestResult({ ok: false, message: 'Connection failed. Check your internet.' })
    }
    setTestingKey(false)
  }

  const addLocation = () => {
    const trimmed = newLocation.trim()
    if (!trimmed || settings.custom_locations.includes(trimmed)) return
    const updated = [...settings.custom_locations, trimmed]
    saveSettings({ custom_locations: updated })
    setNewLocation('')
  }

  const removeLocation = (loc: string) => {
    const updated = settings.custom_locations.filter(l => l !== loc)
    saveSettings({ custom_locations: updated })
  }

  const addLeague = async () => {
    if (!user || !newLeagueName.trim()) return
    const { error } = await supabase.from('leagues').insert({
      user_id: user.id,
      name: newLeagueName.trim(),
      type: newLeagueType,
      auto_created: false,
    })
    if (!error) {
      setNewLeagueName('')
      loadLeagues()
    }
  }

  const updateLeague = async (id: string) => {
    if (!editLeagueName.trim()) return
    const { error } = await supabase
      .from('leagues')
      .update({ name: editLeagueName.trim() })
      .eq('id', id)
    if (!error) {
      setEditingLeague(null)
      loadLeagues()
    }
  }

  const deleteLeague = async (id: string) => {
    if (!confirm('Delete this league? Matches linked to it will lose their league association.')) return
    const { error } = await supabase.from('leagues').delete().eq('id', id)
    if (!error) loadLeagues()
  }

  // Tag CRUD
  const addCustomTag = async () => {
    if (!user || !tagForm.label.trim()) return
    const keywords = tagForm.keywords.split(',').map(k => k.trim()).filter(Boolean)
    await supabase.from('custom_tags').insert({
      user_id: user.id,
      label: tagForm.label.trim(),
      category: tagForm.category,
      keywords,
    })
    setTagForm({ label: '', category: 'other', keywords: '' })
    setShowTagForm(false)
    loadCustomTags()
  }

  const deleteCustomTag = async (id: string) => {
    await supabase.from('custom_tags').delete().eq('id', id)
    loadCustomTags()
  }

  // Export/Import handlers
  const handleExportJSON = async () => {
    if (!user) return
    setExporting(true)
    try {
      await exportAsJSON(user.id)
      showToast('Data exported as JSON', 'success')
    } catch {
      showToast('Export failed', 'error')
    }
    setExporting(false)
  }

  const handleExportCSV = async () => {
    if (!user) return
    setExporting(true)
    try {
      await exportAsCSV(user.id)
      showToast('Data exported as CSV', 'success')
    } catch {
      showToast('Export failed', 'error')
    }
    setExporting(false)
  }

  const handleImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file || !user) return
    setImporting(true)
    try {
      const result = await importFromJSON(user.id, file)
      if (result.imported > 0) {
        showToast(`Imported ${result.imported} match${result.imported !== 1 ? 'es' : ''}${result.skipped > 0 ? `, ${result.skipped} skipped (duplicates)` : ''}`, 'success')
      } else if (result.skipped > 0) {
        showToast(`All ${result.skipped} matches already exist (skipped)`, 'success')
      } else {
        showToast(result.errors[0] || 'No matches imported', 'error')
      }
    } catch {
      showToast('Import failed', 'error')
    }
    setImporting(false)
    e.target.value = ''
  }

  const resetGoalForm = () => {
    setGoalForm({
      target_win_rate: 60,
      year: new Date().getFullYear(),
      match_type_filter: '',
      league_filter: '',
      competitive_only: true,
    })
    setShowGoalForm(false)
    setEditingGoalId(null)
  }

  const saveGoal = async () => {
    if (!user) return
    const payload = {
      user_id: user.id,
      target_win_rate: goalForm.target_win_rate,
      year: goalForm.year,
      match_type_filter: goalForm.match_type_filter || null,
      league_filter: goalForm.league_filter || null,
      competitive_only: goalForm.competitive_only,
      is_active: true,
    }

    if (editingGoalId) {
      await supabase.from('goals').update(payload).eq('id', editingGoalId)
    } else {
      // Deactivate other goals for the same year
      await supabase
        .from('goals')
        .update({ is_active: false })
        .eq('user_id', user.id)
        .eq('year', goalForm.year)
        .eq('is_active', true)
      await supabase.from('goals').insert(payload)
    }
    resetGoalForm()
    loadGoals()
  }

  const startEditGoal = (goal: Goal) => {
    setEditingGoalId(goal.id)
    setGoalForm({
      target_win_rate: goal.target_win_rate,
      year: goal.year,
      match_type_filter: goal.match_type_filter || '',
      league_filter: goal.league_filter || '',
      competitive_only: goal.competitive_only,
    })
    setShowGoalForm(true)
  }

  const toggleGoalActive = async (goal: Goal) => {
    if (!user) return
    if (!goal.is_active) {
      // Deactivate other goals first
      await supabase
        .from('goals')
        .update({ is_active: false })
        .eq('user_id', user.id)
        .eq('is_active', true)
    }
    await supabase
      .from('goals')
      .update({ is_active: !goal.is_active })
      .eq('id', goal.id)
    loadGoals()
  }

  const deleteGoal = async (id: string) => {
    await supabase.from('goals').delete().eq('id', id)
    loadGoals()
  }

  if (loading) {
    return (
      <div className="p-4 md:p-8 flex items-center justify-center min-h-[50vh]">
        <Loader2 className="animate-spin text-green-600" size={32} />
      </div>
    )
  }

  return (
    <div className="p-4 md:p-8 max-w-2xl overflow-x-hidden">
      <h1 className="text-2xl font-bold text-gray-900 mb-6">Settings</h1>

      <div className="space-y-6">
        {/* API Key Section */}
        <section className="bg-white rounded-xl shadow-sm border border-gray-100 p-4 md:p-5">
          <h2 className="text-base font-semibold text-gray-900 mb-3">Anthropic API Key</h2>
          <p className="text-sm text-gray-500 mb-3">
            Required for AI-powered match logging. Your key is stored securely in your account.
          </p>
          <div className="space-y-2">
            <div className="relative">
              <input
                type={showApiKey ? 'text' : 'password'}
                value={settings.anthropic_api_key}
                onChange={(e) => setSettings(prev => ({ ...prev, anthropic_api_key: e.target.value }))}
                onBlur={() => saveSettings({ anthropic_api_key: settings.anthropic_api_key })}
                placeholder="sk-ant-..."
                className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm pr-10 focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent"
              />
              <button
                onClick={() => setShowApiKey(!showApiKey)}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-600"
                aria-label={showApiKey ? 'Hide API key' : 'Show API key'}
              >
                {showApiKey ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </div>
            <button
              onClick={testApiKey}
              disabled={testingKey}
              className="w-full sm:w-auto px-4 py-2.5 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg text-sm font-medium transition-colors disabled:opacity-50"
            >
              {testingKey ? <Loader2 size={16} className="animate-spin mx-auto" /> : 'Test Connection'}
            </button>
          </div>
          {testResult && (
            <p className={`text-sm mt-2 ${testResult.ok ? 'text-green-600' : 'text-red-600'}`}>
              {testResult.message}
            </p>
          )}
        </section>

        {/* Default Surface */}
        <section className="bg-white rounded-xl shadow-sm border border-gray-100 p-4 md:p-5">
          <h2 className="text-base font-semibold text-gray-900 mb-3">Default Surface</h2>
          <p className="text-sm text-gray-500 mb-3">Used when surface isn't specified in freeform input.</p>
          <div className="flex flex-wrap gap-2">
            {SURFACES.map(({ value, label }) => (
              <button
                key={value}
                onClick={() => saveSettings({ default_surface: value })}
                className={`px-3 py-1.5 rounded-full text-sm font-medium transition-colors ${
                  settings.default_surface === value
                    ? 'bg-green-600 text-white'
                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </section>

        {/* Default Match Type */}
        <section className="bg-white rounded-xl shadow-sm border border-gray-100 p-4 md:p-5">
          <h2 className="text-base font-semibold text-gray-900 mb-3">Default Match Type</h2>
          <p className="text-sm text-gray-500 mb-3">Used when match type isn't specified in freeform input.</p>
          <div className="flex flex-wrap gap-2">
            {MATCH_TYPES.map(({ value, label }) => (
              <button
                key={value}
                onClick={() => saveSettings({ default_match_type: value })}
                className={`px-3 py-1.5 rounded-full text-sm font-medium transition-colors ${
                  settings.default_match_type === value
                    ? 'bg-green-600 text-white'
                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </section>

        {/* Saved Locations */}
        <section className="bg-white rounded-xl shadow-sm border border-gray-100 p-4 md:p-5">
          <h2 className="text-base font-semibold text-gray-900 mb-3">Saved Locations</h2>
          <p className="text-sm text-gray-500 mb-3">Quick-select locations when logging matches.</p>
          <div className="flex gap-2 mb-3">
            <input
              type="text"
              value={newLocation}
              onChange={(e) => setNewLocation(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && addLocation()}
              placeholder="e.g., Reston Community Courts"
              className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent"
            />
            <button
              onClick={addLocation}
              className="px-3 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg transition-colors"
            >
              <Plus size={18} />
            </button>
          </div>
          {settings.custom_locations.length === 0 ? (
            <p className="text-sm text-gray-500 italic">No locations saved yet.</p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {settings.custom_locations.map((loc) => (
                <span
                  key={loc}
                  className="inline-flex items-center gap-1 px-3 py-1.5 bg-gray-100 rounded-full text-sm text-gray-700"
                >
                  {loc}
                  <button onClick={() => removeLocation(loc)} className="text-gray-500 hover:text-red-500">
                    <X size={14} />
                  </button>
                </span>
              ))}
            </div>
          )}
        </section>

        {/* Leagues & Tournaments */}
        <section className="bg-white rounded-xl shadow-sm border border-gray-100 p-4 md:p-5">
          <h2 className="text-base font-semibold text-gray-900 mb-3">Leagues & Tournaments</h2>
          <p className="text-sm text-gray-500 mb-3">Manage your leagues and tournaments. New ones are auto-created when logging matches too.</p>
          <div className="flex gap-2 mb-3">
            <input
              type="text"
              value={newLeagueName}
              onChange={(e) => setNewLeagueName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && addLeague()}
              placeholder="League or tournament name"
              className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent"
            />
            <select
              value={newLeagueType}
              onChange={(e) => setNewLeagueType(e.target.value as 'league' | 'tournament')}
              className="px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-green-500"
            >
              <option value="league">League</option>
              <option value="tournament">Tournament</option>
            </select>
            <button
              onClick={addLeague}
              className="px-3 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg transition-colors"
            >
              <Plus size={18} />
            </button>
          </div>
          {leagues.length === 0 ? (
            <p className="text-sm text-gray-500 italic">No leagues or tournaments yet.</p>
          ) : (
            <ul className="space-y-2">
              {leagues.map((league) => (
                <li
                  key={league.id}
                  className="flex items-center justify-between px-3 py-2 bg-gray-50 rounded-lg"
                >
                  {editingLeague === league.id ? (
                    <div className="flex items-center gap-2 flex-1">
                      <input
                        type="text"
                        value={editLeagueName}
                        onChange={(e) => setEditLeagueName(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && updateLeague(league.id)}
                        className="flex-1 px-2 py-1 border border-gray-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
                        autoFocus
                      />
                      <button onClick={() => updateLeague(league.id)} className="text-green-600 hover:text-green-700">
                        <Check size={16} />
                      </button>
                      <button onClick={() => setEditingLeague(null)} className="text-gray-500 hover:text-gray-600">
                        <X size={16} />
                      </button>
                    </div>
                  ) : (
                    <>
                      <div className="flex items-center gap-2">
                        <span className="text-sm text-gray-800">{league.name}</span>
                        <span className="text-xs px-1.5 py-0.5 rounded bg-gray-200 text-gray-500 capitalize">
                          {league.type}
                        </span>
                        {league.auto_created && (
                          <span className="text-xs text-amber-600">auto</span>
                        )}
                      </div>
                      <div className="flex items-center gap-1">
                        <button
                          onClick={() => { setEditingLeague(league.id); setEditLeagueName(league.name) }}
                          className="p-1 text-gray-500 hover:text-gray-600"
                        >
                          <Pencil size={14} />
                        </button>
                        <button
                          onClick={() => deleteLeague(league.id)}
                          className="p-1 text-gray-500 hover:text-red-500"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </>
                  )}
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* Goals */}
        <section className="bg-white rounded-xl shadow-sm border border-gray-100 p-4 md:p-5">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <Target size={18} className="text-green-600" />
              <h2 className="text-base font-semibold text-gray-900">Win Rate Goals</h2>
            </div>
            {!showGoalForm && (
              <button
                onClick={() => { resetGoalForm(); setShowGoalForm(true) }}
                className="flex items-center gap-1 px-3 py-1.5 bg-green-600 hover:bg-green-700 text-white rounded-lg text-sm font-medium transition-colors"
              >
                <Plus size={16} /> Add Goal
              </button>
            )}
          </div>
          <p className="text-sm text-gray-500 mb-3">
            Set a target win rate for the year. The active goal appears on your Dashboard.
          </p>

          {/* Goal form */}
          {showGoalForm && (
            <div className="border border-gray-200 rounded-lg p-4 mb-4 space-y-3">
              <h3 className="text-sm font-semibold text-gray-700">
                {editingGoalId ? 'Edit Goal' : 'New Goal'}
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">Target Win Rate</label>
                  <div className="flex items-center gap-2">
                    <input
                      type="number"
                      min={1}
                      max={100}
                      value={goalForm.target_win_rate}
                      onChange={e => setGoalForm(prev => ({ ...prev, target_win_rate: Number(e.target.value) }))}
                      className="w-20 px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
                    />
                    <span className="text-sm text-gray-500">%</span>
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">Year</label>
                  <input
                    type="number"
                    min={2020}
                    max={2030}
                    value={goalForm.year}
                    onChange={e => setGoalForm(prev => ({ ...prev, year: Number(e.target.value) }))}
                    className="w-full sm:w-24 px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
                  />
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">Match Type (optional)</label>
                  <select
                    value={goalForm.match_type_filter}
                    onChange={e => setGoalForm(prev => ({ ...prev, match_type_filter: e.target.value }))}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-green-500"
                  >
                    <option value="">All types</option>
                    {MATCH_TYPES.map(t => (
                      <option key={t.value} value={t.value}>{t.label}</option>
                    ))}
                  </select>
                </div>
                {leagues.length > 0 && (
                  <div>
                    <label className="block text-xs font-medium text-gray-500 mb-1">League (optional)</label>
                    <select
                      value={goalForm.league_filter}
                      onChange={e => setGoalForm(prev => ({ ...prev, league_filter: e.target.value }))}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-green-500"
                    >
                      <option value="">All leagues</option>
                      {leagues.map(l => (
                        <option key={l.id} value={l.id}>{l.name}</option>
                      ))}
                    </select>
                  </div>
                )}
              </div>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={goalForm.competitive_only}
                  onChange={e => setGoalForm(prev => ({ ...prev, competitive_only: e.target.checked }))}
                  className="rounded border-gray-300 text-green-600 focus:ring-green-500"
                />
                <span className="text-sm text-gray-700">Competitive matches only</span>
              </label>
              <div className="flex gap-2 justify-end pt-1">
                <button
                  onClick={resetGoalForm}
                  className="px-3 py-1.5 text-sm text-gray-600 hover:text-gray-800"
                >
                  Cancel
                </button>
                <button
                  onClick={saveGoal}
                  disabled={goalForm.target_win_rate < 1 || goalForm.target_win_rate > 100}
                  className="px-4 py-1.5 bg-green-600 hover:bg-green-700 text-white rounded-lg text-sm font-medium transition-colors disabled:opacity-50"
                >
                  {editingGoalId ? 'Update Goal' : 'Create Goal'}
                </button>
              </div>
            </div>
          )}

          {/* Goal list */}
          {goals.length === 0 && !showGoalForm ? (
            <p className="text-sm text-gray-500 italic">No goals set yet.</p>
          ) : (
            <div className="space-y-2">
              {goals.map(goal => (
                <div
                  key={goal.id}
                  className={`flex items-center justify-between px-3 py-2.5 rounded-lg ${
                    goal.is_active ? 'bg-green-50 border border-green-200' : 'bg-gray-50'
                  }`}
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-semibold text-gray-900">
                        {goal.target_win_rate}% win rate
                      </span>
                      <span className="text-xs text-gray-500">{goal.year}</span>
                      {goal.is_active && (
                        <span className="text-[10px] px-1.5 py-0.5 bg-green-100 text-green-700 rounded-full font-medium">
                          active
                        </span>
                      )}
                    </div>
                    <div className="flex flex-wrap gap-x-3 text-xs text-gray-500 mt-0.5">
                      {goal.match_type_filter && (
                        <span className="capitalize">{goal.match_type_filter} only</span>
                      )}
                      {goal.league_filter && (
                        <span>{leagues.find(l => l.id === goal.league_filter)?.name || 'League'}</span>
                      )}
                      {goal.competitive_only && <span>Competitive</span>}
                    </div>
                  </div>
                  <div className="flex items-center gap-1 ml-2">
                    <button
                      onClick={() => toggleGoalActive(goal)}
                      className={`px-2 py-1 rounded text-xs font-medium transition-colors ${
                        goal.is_active
                          ? 'text-amber-600 hover:text-amber-700'
                          : 'text-green-600 hover:text-green-700'
                      }`}
                      title={goal.is_active ? 'Deactivate' : 'Set as active'}
                    >
                      {goal.is_active ? 'Deactivate' : 'Activate'}
                    </button>
                    <button
                      onClick={() => startEditGoal(goal)}
                      className="p-1 text-gray-500 hover:text-gray-600"
                    >
                      <Pencil size={14} />
                    </button>
                    <button
                      onClick={() => deleteGoal(goal.id)}
                      className="p-1 text-gray-500 hover:text-red-500"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* Custom Tags */}
        <section className="bg-white rounded-xl shadow-sm border border-gray-100 p-4 md:p-5">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <Tag size={18} className="text-green-600" />
              <h2 className="text-base font-semibold text-gray-900">Custom Tags</h2>
            </div>
            {!showTagForm && (
              <button
                onClick={() => setShowTagForm(true)}
                className="flex items-center gap-1 px-3 py-1.5 bg-green-600 hover:bg-green-700 text-white rounded-lg text-sm font-medium transition-colors"
              >
                <Plus size={16} /> Add Tag
              </button>
            )}
          </div>
          <p className="text-sm text-gray-500 mb-3">
            Define tags to categorize your matches. Tags are also auto-suggested by AI when logging.
          </p>

          {showTagForm && (
            <div className="border border-gray-200 rounded-lg p-4 mb-4 space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">Tag Label</label>
                  <input
                    type="text"
                    value={tagForm.label}
                    onChange={e => setTagForm(prev => ({ ...prev, label: e.target.value }))}
                    placeholder="e.g., Serve - Strong"
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
                    autoFocus
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">Category</label>
                  <select
                    value={tagForm.category}
                    onChange={e => setTagForm(prev => ({ ...prev, category: e.target.value }))}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-green-500"
                  >
                    {TAG_CATEGORIES.map(c => (
                      <option key={c} value={c}>{c.charAt(0).toUpperCase() + c.slice(1)}</option>
                    ))}
                  </select>
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Keywords (comma-separated, for AI matching)</label>
                <input
                  type="text"
                  value={tagForm.keywords}
                  onChange={e => setTagForm(prev => ({ ...prev, keywords: e.target.value }))}
                  placeholder="e.g., ace, first serve, service game"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
                />
              </div>
              <div className="flex gap-2 justify-end">
                <button onClick={() => { setShowTagForm(false); setTagForm({ label: '', category: 'other', keywords: '' }) }} className="px-3 py-1.5 text-sm text-gray-600">Cancel</button>
                <button onClick={addCustomTag} disabled={!tagForm.label.trim()} className="px-4 py-1.5 bg-green-600 hover:bg-green-700 text-white rounded-lg text-sm font-medium disabled:opacity-50">Add Tag</button>
              </div>
            </div>
          )}

          {customTags.length === 0 && !showTagForm ? (
            <p className="text-sm text-gray-500 italic">No custom tags yet.</p>
          ) : (
            <div className="space-y-1.5">
              {TAG_CATEGORIES.map(cat => {
                const catTags = customTags.filter(t => t.category === cat)
                if (catTags.length === 0) return null
                return (
                  <div key={cat}>
                    <p className="text-xs font-medium text-gray-500 uppercase mb-1">{cat}</p>
                    <div className="flex flex-wrap gap-1.5 mb-2">
                      {catTags.map(tag => (
                        <span key={tag.id} className="inline-flex items-center gap-1 px-2.5 py-1 bg-gray-100 rounded-full text-xs text-gray-700">
                          {tag.label}
                          <button onClick={() => deleteCustomTag(tag.id)} className="text-gray-500 hover:text-red-500">
                            <X size={12} />
                          </button>
                        </span>
                      ))}
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </section>

        {/* Export / Import */}
        <section className="bg-white rounded-xl shadow-sm border border-gray-100 p-4 md:p-5">
          <div className="flex items-center gap-2 mb-3">
            <Download size={18} className="text-green-600" />
            <h2 className="text-base font-semibold text-gray-900">Export & Import</h2>
          </div>
          <p className="text-sm text-gray-500 mb-4">
            Export your data for backup or analysis. Import from a previous MatchPoint export.
          </p>
          <div className="space-y-3">
            <div>
              <h3 className="text-sm font-medium text-gray-700 mb-2">Export</h3>
              <div className="flex flex-wrap gap-2">
                <button
                  onClick={handleExportJSON}
                  disabled={exporting}
                  className="flex items-center gap-1.5 px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg text-sm font-medium transition-colors disabled:opacity-50"
                >
                  <Download size={16} />
                  {exporting ? 'Exporting...' : 'Export JSON'}
                </button>
                <button
                  onClick={handleExportCSV}
                  disabled={exporting}
                  className="flex items-center gap-1.5 px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg text-sm font-medium transition-colors disabled:opacity-50"
                >
                  <Download size={16} />
                  {exporting ? 'Exporting...' : 'Export CSV'}
                </button>
              </div>
            </div>
            <div>
              <h3 className="text-sm font-medium text-gray-700 mb-2">Import</h3>
              <label className={`inline-flex items-center gap-1.5 px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg text-sm font-medium transition-colors cursor-pointer ${importing ? 'opacity-50 pointer-events-none' : ''}`}>
                <Upload size={16} />
                {importing ? 'Importing...' : 'Import JSON'}
                <input
                  type="file"
                  accept=".json"
                  onChange={handleImport}
                  className="hidden"
                  disabled={importing}
                />
              </label>
              <p className="text-xs text-gray-500 mt-1.5">Only JSON exports from MatchPoint are supported. Duplicates are automatically skipped.</p>
            </div>
          </div>
        </section>

        {/* Save indicator */}
        {(saving || saveMessage) && (
          <div className={`text-sm font-medium ${saveMessage === 'Settings saved' ? 'text-green-600' : 'text-red-600'}`}>
            {saving ? 'Saving...' : saveMessage}
          </div>
        )}

        {/* Sign Out */}
        <section className="bg-white rounded-xl shadow-sm border border-gray-100 p-4 md:p-5">
          <h2 className="text-base font-semibold text-gray-900 mb-3">Account</h2>
          <p className="text-sm text-gray-500 mb-3">Signed in as {user?.email}</p>
          <button
            onClick={signOut}
            className="px-4 py-2 bg-red-50 hover:bg-red-100 text-red-600 rounded-lg text-sm font-medium transition-colors"
          >
            Sign Out
          </button>
        </section>
      </div>
    </div>
  )
}
