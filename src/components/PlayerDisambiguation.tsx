import { useState } from 'react'
import { AlertTriangle, UserPlus } from 'lucide-react'
import type { AmbiguousName } from '../lib/playerMatching'

interface Props {
  ambiguities: AmbiguousName[]
  onResolved: (resolutions: Map<string, string>) => void
  onCancel: () => void
}

/**
 * Shows a disambiguation UI for each ambiguous player name.
 * User picks the correct existing player or confirms "create new".
 * Once all are resolved, calls onResolved with a map of inputName → resolvedName.
 */
export default function PlayerDisambiguation({ ambiguities, onResolved, onCancel }: Props) {
  // Track selection for each ambiguous name: inputName → chosen name (or null for "new player")
  const [selections, setSelections] = useState<Map<string, string | null>>(() => new Map())

  const currentIndex = [...selections.entries()].length
  const current = currentIndex < ambiguities.length ? ambiguities[currentIndex] : null

  const handleSelect = (resolvedName: string | null) => {
    const amb = ambiguities[currentIndex]
    const key = `${amb.field}-${amb.index}-${amb.inputName}`

    const newSelections = new Map(selections)
    newSelections.set(key, resolvedName)
    setSelections(newSelections)

    // If all resolved, call back
    if (newSelections.size === ambiguities.length) {
      const resolutions = new Map<string, string>()
      for (const [, amb] of ambiguities.entries()) {
        const k = `${amb.field}-${amb.index}-${amb.inputName}`
        const chosen = newSelections.get(k)
        // null means "keep original name" (create new player)
        const resolvedField = `${amb.field}-${amb.index}`
        resolutions.set(resolvedField, chosen ?? amb.inputName)
      }
      onResolved(resolutions)
    }
  }

  if (!current) return null

  const fieldLabel = current.field === 'opponent' ? 'Opponent' : 'Partner'

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5">
      <div className="flex items-start gap-2 mb-4">
        <AlertTriangle size={18} className="text-amber-500 flex-shrink-0 mt-0.5" />
        <div>
          <h2 className="text-base font-semibold text-gray-900">
            Which "{current.inputName}"?
          </h2>
          <p className="text-sm text-gray-500 mt-0.5">
            {fieldLabel} name "{current.inputName}" matches multiple players.
            {ambiguities.length > 1 && (
              <span className="text-gray-400"> ({currentIndex + 1} of {ambiguities.length})</span>
            )}
          </p>
        </div>
      </div>

      <div className="space-y-2 mb-4">
        {current.candidates.map(c => (
          <button
            key={c.id}
            onClick={() => handleSelect(c.name)}
            className="w-full flex items-center justify-between px-4 py-3 border border-gray-200 rounded-lg hover:border-green-300 hover:bg-green-50 transition-colors text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-green-500"
          >
            <div>
              <span className="text-sm font-medium text-gray-900">{c.name}</span>
              {c.matchType === 'exact' && (
                <span className="ml-2 text-xs text-green-600 font-medium">Exact match</span>
              )}
            </div>
            <span className="text-xs text-gray-400">Existing player</span>
          </button>
        ))}

        {/* Create new player option */}
        <button
          onClick={() => handleSelect(null)}
          className="w-full flex items-center justify-between px-4 py-3 border border-dashed border-gray-300 rounded-lg hover:border-amber-300 hover:bg-amber-50 transition-colors text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-500"
        >
          <div className="flex items-center gap-2">
            <UserPlus size={16} className="text-amber-600" />
            <span className="text-sm font-medium text-gray-700">
              Create new player "{current.inputName}"
            </span>
          </div>
          <span className="text-xs text-amber-600">New</span>
        </button>
      </div>

      <button
        onClick={onCancel}
        className="text-sm text-gray-500 hover:text-gray-700 font-medium"
      >
        Cancel
      </button>
    </div>
  )
}
