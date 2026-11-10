import { useCallback, useEffect, useState } from 'react'
import { toErrorMessage } from '../services/api'

/** Load data from a service with loading and error states. */
export function useAsync<T>(loader: () => Promise<T>, deps: unknown[] = []) {
  const [data, setData] = useState<T | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const run = useCallback(loader, deps)

  const reload = useCallback(() => {
    let active = true
    setLoading(true)
    setError(null)
    run()
      .then((d) => active && setData(d))
      .catch((e) => active && setError(toErrorMessage(e)))
      .finally(() => active && setLoading(false))
    return () => {
      active = false
    }
  }, [run])

  useEffect(() => reload(), [reload])

  return { data, loading, error, reload, setData }
}
