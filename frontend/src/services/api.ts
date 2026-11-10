import axios, { AxiosError } from 'axios'
import { API_BASE_URL } from './config'

/** Single HTTP client. Components never call axios directly. */
export const http = axios.create({
  baseURL: API_BASE_URL,
  timeout: 45_000,
})

/** Turn any request failure into a short, user-safe message. */
export function toErrorMessage(err: unknown): string {
  if (err instanceof AxiosError) {
    const detail = (err.response?.data as { detail?: unknown } | undefined)?.detail
    if (typeof detail === 'string') return detail
    if (err.code === 'ECONNABORTED') return 'The request timed out.'
    if (!err.response) return 'Cannot reach the Kavach backend. Is it running?'
    return `Request failed (HTTP ${err.response.status}).`
  }
  if (err instanceof Error) return err.message
  return 'Something went wrong.'
}

/** Small delay so mock calls behave like network calls. */
export function mockDelay<T>(value: T, ms = 350): Promise<T> {
  return new Promise((resolve) => setTimeout(() => resolve(structuredClone(value)), ms))
}
