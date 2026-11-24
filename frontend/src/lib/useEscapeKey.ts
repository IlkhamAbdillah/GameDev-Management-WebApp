import { useEffect } from 'react'

/** Calls `onEscape` when the Escape key is pressed (used by dialogs). */
export function useEscapeKey(onEscape: () => void) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onEscape()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onEscape])
}
