import { useState, useRef, useEffect } from 'react'

interface ComboboxProps {
  value: string
  onChange: (value: string) => void
  options: string[]
  placeholder?: string
  className?: string
}

// Searchable combobox — filters options as you type, allows free-form entry.
// Replaces <input list="..."> + <datalist> which has inconsistent filtering
// behaviour on iOS Safari and limited styling control everywhere.
export default function Combobox({ value, onChange, options, placeholder, className }: ComboboxProps) {
  const [open, setOpen] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)

  // Filter options based on current value; show all when empty
  const filtered = value.trim()
    ? options.filter(o => o.toLowerCase().includes(value.toLowerCase()))
    : options

  // Close dropdown on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (!containerRef.current?.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  return (
    <div ref={containerRef} className="relative">
      <input
        type="text"
        value={value}
        onChange={e => {
          onChange(e.target.value)
          setOpen(true)
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={e => {
          if (e.key === 'Escape') setOpen(false)
        }}
        placeholder={placeholder}
        className={className}
        autoComplete="off"
      />
      {open && filtered.length > 0 && (
        <ul className="absolute z-50 w-full mt-1 bg-white border border-gray-200 rounded-lg shadow-lg max-h-48 overflow-y-auto">
          {filtered.map(option => (
            <li
              key={option}
              // onMouseDown instead of onClick prevents the input blur from
              // firing before the selection registers
              onMouseDown={e => {
                e.preventDefault()
                onChange(option)
                setOpen(false)
              }}
              className={`px-3 py-2 text-sm cursor-pointer hover:bg-green-50 hover:text-green-700 ${
                option === value ? 'bg-green-50 text-green-700 font-medium' : 'text-gray-700'
              }`}
            >
              {option}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
