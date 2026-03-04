import { useEffect } from 'react'

/**
 * Add a class to document.body on mount and remove it on unmount.
 * Use for route-aware styling (e.g. mode-admin vs mode-globe).
 */
export function useBodyClass(name: string): void {
  useEffect(() => {
    document.body.classList.add(name)
    return () => {
      document.body.classList.remove(name)
    }
  }, [name])
}
