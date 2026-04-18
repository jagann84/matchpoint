import { AlertTriangle, RefreshCw } from 'lucide-react'

// Reusable error state with a retry button. Replaces the silent
// "empty page" that users see when a data fetch fails. Drop this
// into any page that loads data from Supabase — it shows a clear
// message and a one-tap retry that calls the original load function.
export default function ErrorRetry({
  message = 'Something went wrong loading your data.',
  onRetry,
}: {
  message?: string
  onRetry: () => void
}) {
  return (
    <div className="flex flex-col items-center justify-center py-16 px-4 text-center">
      <div className="bg-red-50 rounded-full p-3 mb-4">
        <AlertTriangle className="w-6 h-6 text-red-500" />
      </div>
      <p className="text-gray-700 mb-4">{message}</p>
      <button
        onClick={onRetry}
        className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors text-sm font-medium"
      >
        <RefreshCw size={16} />
        Try again
      </button>
    </div>
  )
}
