import { useCallback, useEffect, useRef, useState } from 'react'

// Minimal type definitions for the Web Speech API (not in lib.dom by default).
// Different browsers expose this under different names, and the spec is a
// Living Standard that TypeScript hasn't fully absorbed into lib.dom.d.ts.
interface SpeechRecognitionEvent extends Event {
  results: SpeechRecognitionResultList
  resultIndex: number
}
interface SpeechRecognitionErrorEvent extends Event {
  error: string
  message?: string
}
interface SpeechRecognitionAPI extends EventTarget {
  continuous: boolean
  interimResults: boolean
  lang: string
  start(): void
  stop(): void
  abort(): void
  onresult: ((ev: SpeechRecognitionEvent) => void) | null
  onerror: ((ev: SpeechRecognitionErrorEvent) => void) | null
  onend: (() => void) | null
  onstart: (() => void) | null
}
type SpeechRecognitionCtor = new () => SpeechRecognitionAPI

function getSpeechRecognition(): SpeechRecognitionCtor | null {
  if (typeof window === 'undefined') return null
  const w = window as unknown as {
    SpeechRecognition?: SpeechRecognitionCtor
    webkitSpeechRecognition?: SpeechRecognitionCtor
  }
  return w.SpeechRecognition || w.webkitSpeechRecognition || null
}

export interface UseVoiceInputOptions {
  /**
   * Called when speech recognition produces a final transcript chunk.
   * You typically append this to your text state.
   */
  onFinalTranscript?: (text: string) => void
  /**
   * Called continuously as the user speaks, with the in-progress transcript.
   * Useful for showing a live preview without committing it yet.
   */
  onInterimTranscript?: (text: string) => void
  /**
   * Called after `silenceMs` of detected silence following the last
   * final result. Great for auto-submitting after the user stops speaking.
   */
  onSilenceTimeout?: () => void
  /** How long to wait after the last final result before firing silence (ms). Default: 2000. */
  silenceMs?: number
  /** BCP-47 language code. Default: 'en-US'. */
  lang?: string
}

export interface UseVoiceInputResult {
  /** True if the Web Speech API is available in this browser. */
  isSupported: boolean
  /** True while actively listening. */
  isListening: boolean
  /** Current interim (not-yet-final) transcript — re-updated as the user speaks. */
  interimTranscript: string
  /** Any error from the recognition engine, or null. */
  error: string | null
  /** Begin listening. No-op if unsupported or already listening. */
  start: () => void
  /** Stop listening. Fires final results before `onend`. */
  stop: () => void
}

/**
 * Wrapper around the Web Speech API for voice-to-text input.
 *
 * Handles:
 * - Vendor prefix differences (webkitSpeechRecognition on Safari/iOS)
 * - Cleanup on unmount
 * - Silence-detection auto-timeout
 * - Graceful degradation when unsupported
 */
export function useVoiceInput(options: UseVoiceInputOptions = {}): UseVoiceInputResult {
  const {
    onFinalTranscript,
    onInterimTranscript,
    onSilenceTimeout,
    silenceMs = 2000,
    lang = 'en-US',
  } = options

  const [isListening, setIsListening] = useState(false)
  const [interimTranscript, setInterimTranscript] = useState('')
  const [error, setError] = useState<string | null>(null)

  const recognitionRef = useRef<SpeechRecognitionAPI | null>(null)
  const silenceTimerRef = useRef<number | null>(null)
  // Stash callbacks in refs so the recognition handlers always see the latest,
  // without recreating the SpeechRecognition instance on every render.
  const callbacksRef = useRef({ onFinalTranscript, onInterimTranscript, onSilenceTimeout })
  callbacksRef.current = { onFinalTranscript, onInterimTranscript, onSilenceTimeout }

  const SpeechRecognitionCtor = getSpeechRecognition()
  const isSupported = SpeechRecognitionCtor !== null

  const clearSilenceTimer = useCallback(() => {
    if (silenceTimerRef.current !== null) {
      window.clearTimeout(silenceTimerRef.current)
      silenceTimerRef.current = null
    }
  }, [])

  const resetSilenceTimer = useCallback(() => {
    clearSilenceTimer()
    silenceTimerRef.current = window.setTimeout(() => {
      callbacksRef.current.onSilenceTimeout?.()
    }, silenceMs)
  }, [clearSilenceTimer, silenceMs])

  const start = useCallback(() => {
    if (!SpeechRecognitionCtor) {
      setError('Voice input is not supported in this browser.')
      return
    }
    if (recognitionRef.current) return // Already listening

    try {
      const recognition = new SpeechRecognitionCtor()
      recognition.continuous = true
      recognition.interimResults = true
      recognition.lang = lang

      recognition.onstart = () => {
        setIsListening(true)
        setError(null)
        setInterimTranscript('')
      }

      recognition.onresult = (event: SpeechRecognitionEvent) => {
        let interim = ''
        let final = ''
        // Each result has `isFinal` once the engine commits it. Walk from the
        // last known index so we don't re-process committed results.
        for (let i = event.resultIndex; i < event.results.length; i++) {
          const res = event.results[i]
          const transcript = res[0].transcript
          if (res.isFinal) {
            final += transcript
          } else {
            interim += transcript
          }
        }

        if (interim) {
          setInterimTranscript(interim)
          callbacksRef.current.onInterimTranscript?.(interim)
        }

        if (final) {
          setInterimTranscript('')
          callbacksRef.current.onFinalTranscript?.(final.trim())
          resetSilenceTimer()
        }
      }

      recognition.onerror = (ev: SpeechRecognitionErrorEvent) => {
        // 'no-speech' fires constantly in quiet environments — treat it as soft.
        if (ev.error === 'no-speech' || ev.error === 'aborted') return
        if (ev.error === 'not-allowed' || ev.error === 'service-not-allowed') {
          setError('Microphone permission denied. Enable it in your browser settings.')
        } else {
          setError(`Voice input error: ${ev.error}`)
        }
      }

      recognition.onend = () => {
        setIsListening(false)
        setInterimTranscript('')
        clearSilenceTimer()
        recognitionRef.current = null
      }

      recognitionRef.current = recognition
      recognition.start()
    } catch (err) {
      setError((err as Error).message || 'Failed to start voice input')
      setIsListening(false)
    }
  }, [SpeechRecognitionCtor, lang, clearSilenceTimer, resetSilenceTimer])

  const stop = useCallback(() => {
    clearSilenceTimer()
    if (recognitionRef.current) {
      try {
        recognitionRef.current.stop()
      } catch {
        // Already stopped — ignore
      }
    }
  }, [clearSilenceTimer])

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      clearSilenceTimer()
      if (recognitionRef.current) {
        try {
          recognitionRef.current.abort()
        } catch {
          // Ignore
        }
        recognitionRef.current = null
      }
    }
  }, [clearSilenceTimer])

  return {
    isSupported,
    isListening,
    interimTranscript,
    error,
    start,
    stop,
  }
}
