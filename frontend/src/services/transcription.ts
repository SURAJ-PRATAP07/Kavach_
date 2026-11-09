import type { HealthResponse, TranscribeResponse } from '../types'
import { http, mockDelay } from './api'
import { ENDPOINTS, getUseMock } from './config'

export const ALLOWED_AUDIO_EXTENSIONS = ['.wav', '.mp3', '.ogg', '.flac', '.aac', '.m4a']
export const MAX_AUDIO_BYTES = 10 * 1024 * 1024

/** GET /health (real backend endpoint). */
export async function checkHealth(): Promise<HealthResponse> {
  if (getUseMock()) return mockDelay({ status: 'ok', service: 'kavach-api (mock)' }, 200)
  const { data } = await http.get<HealthResponse>(ENDPOINTS.health, { timeout: 5000 })
  return data
}

/** Same checks the backend performs, so users get instant feedback. */
export function validateAudioFile(file: File): string | null {
  const ext = file.name.slice(file.name.lastIndexOf('.')).toLowerCase()
  if (!ALLOWED_AUDIO_EXTENSIONS.includes(ext)) return 'Unsupported audio format. Use WAV, MP3, OGG, FLAC, AAC or M4A.'
  if (file.size === 0) return 'The selected audio file is empty.'
  if (file.size > MAX_AUDIO_BYTES) return 'Audio file exceeds the 10 MB upload limit.'
  return null
}

/** POST /transcribe (real backend endpoint, multipart field "audio_file"). */
export async function transcribeFile(file: File): Promise<TranscribeResponse> {
  if (getUseMock()) {
    return mockDelay(
      {
        success: true,
        transcript:
          'Main police se baat kar raha hoon, aapke naam pe arrest warrant nikla hai. Aap Skype pe aaiye, aur kisi ko iske baare mein mat batana.',
        model: 'prisma-v2.5 (mock)',
        request_id: 'mock-req-001',
        processing_time: 0.82,
        end_to_end_latency: 1.14,
      },
      1400,
    )
  }
  const form = new FormData()
  form.append('audio_file', file)
  const { data } = await http.post<TranscribeResponse>(ENDPOINTS.transcribe, form)
  return data
}
