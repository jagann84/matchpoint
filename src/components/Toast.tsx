import { useEffect, useState } from 'react'
import { CheckCircle, AlertCircle, X } from 'lucide-react'

interface ToastData {
  id: string
  message: string
  type: 'success' | 'error'
  matchId?: string
  onAction?: () => void
  actionLabel?: string
}

let addToastFn: ((toast: Omit<ToastData, 'id'>) => void) | null = null

export function showToast(
  message: string,
  type: 'success' | 'error' = 'success',
  matchId?: string,
  onAction?: () => void,
  actionLabel?: string,
) {
  addToastFn?.({ message, type, matchId, onAction, actionLabel })
}

export function ToastContainer({ onViewMatch }: { onViewMatch?: (id: string) => void }) {
  const [toasts, setToasts] = useState<ToastData[]>([])

  useEffect(() => {
    addToastFn = (toast) => {
      const id = Math.random().toString(36).slice(2)
      setToasts(prev => [...prev, { ...toast, id }])
      const delay = toast.onAction ? 6000 : 4000
      setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), delay)
    }
    return () => { addToastFn = null }
  }, [])

  if (toasts.length === 0) return null

  return (
    <div className="fixed top-4 right-4 z-[100] space-y-2 max-w-sm" role="status" aria-live="polite">
      {toasts.map(toast => (
        <div
          key={toast.id}
          role="alert"
          onClick={() => toast.matchId && onViewMatch?.(toast.matchId)}
          className={`flex items-start gap-2 px-4 py-3 rounded-lg shadow-xl ring-1 ring-black/5 text-sm animate-[slideIn_0.2s_ease-out] ${
            toast.type === 'success'
              ? 'bg-green-700 text-white'
              : 'bg-red-600 text-white'
          } ${toast.matchId ? 'cursor-pointer' : ''}`}
        >
          {toast.type === 'success'
            ? <CheckCircle size={18} className="flex-shrink-0 mt-0.5" aria-hidden="true" />
            : <AlertCircle size={18} className="flex-shrink-0 mt-0.5" aria-hidden="true" />
          }
          <span className="flex-1">{toast.message}</span>
          {toast.onAction && (
            <button
              onClick={(e) => {
                e.stopPropagation()
                toast.onAction?.()
                setToasts(prev => prev.filter(t => t.id !== toast.id))
              }}
              className="flex-shrink-0 px-2 py-0.5 text-green-700 bg-white rounded font-medium text-xs hover:bg-green-50 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-white"
            >
              {toast.actionLabel || 'Undo'}
            </button>
          )}
          <button
            onClick={(e) => { e.stopPropagation(); setToasts(prev => prev.filter(t => t.id !== toast.id)) }}
            className="flex-shrink-0 mt-0.5 opacity-70 hover:opacity-100 focus:opacity-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-white rounded"
            aria-label="Dismiss notification"
          >
            <X size={16} />
          </button>
        </div>
      ))}
    </div>
  )
}
