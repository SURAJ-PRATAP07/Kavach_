import { describe, expect, it } from 'vitest'
import {
  parseSafetyWarning,
  parseStreamServerMessage,
  validateWarningWav,
} from './warningProtocol'

function makeWarning(audioBytes = 3244) {
  return {
    type: 'safety_warning',
    warning_id: 'a'.repeat(32),
    level: 'warning',
    reason_codes: ['WARNING_TRIGGERED'],
    matched_rule_ids: ['FINANCIAL_EXTRACTION_001'],
    distinct_stages: ['financial_extraction', 'threats'],
    audio_format: 'wav',
    audio_bytes: audioBytes,
    audio_duration_seconds: 0.1,
    message: 'A safety warning has been generated.',
  }
}

function makeWav(sampleRate = 16000): ArrayBuffer {
  const dataBytes = 3200
  const buffer = new ArrayBuffer(44 + dataBytes)
  const view = new DataView(buffer)
  const write = (offset: number, value: string) => {
    for (let index = 0; index < value.length; index += 1) {
      view.setUint8(offset + index, value.charCodeAt(index))
    }
  }

  write(0, 'RIFF')
  view.setUint32(4, buffer.byteLength - 8, true)
  write(8, 'WAVE')
  write(12, 'fmt ')
  view.setUint32(16, 16, true)
  view.setUint16(20, 1, true)
  view.setUint16(22, 1, true)
  view.setUint32(24, sampleRate, true)
  view.setUint32(28, sampleRate * 2, true)
  view.setUint16(32, 2, true)
  view.setUint16(34, 16, true)
  write(36, 'data')
  view.setUint32(40, dataBytes, true)
  return buffer
}

describe('stream warning protocol', () => {
  it('accepts valid safety-warning metadata', () => {
    expect(parseSafetyWarning(makeWarning())).toMatchObject({
      warning_id: 'a'.repeat(32),
      audio_format: 'wav',
      audio_bytes: 3244,
      distinct_stages: ['financial_extraction', 'threats'],
    })
  })

  it('rejects invalid IDs, unsupported formats, and oversized payloads', () => {
    expect(parseSafetyWarning({ ...makeWarning(), warning_id: 'bad' })).toBeNull()
    expect(parseSafetyWarning({ ...makeWarning(), audio_format: 'mp3' })).toBeNull()
    expect(parseSafetyWarning({ ...makeWarning(), audio_bytes: 5 * 1024 * 1024 + 1 })).toBeNull()
  })

  it('parses backend warning messages but rejects malformed metadata', () => {
    expect(parseStreamServerMessage(makeWarning())?.type).toBe('safety_warning')
    expect(parseStreamServerMessage({ ...makeWarning(), distinct_stages: ['unknown'] })).toBeNull()
  })

  it('accepts only mono 16 kHz 16-bit PCM WAV matching the metadata', () => {
    const warning = parseSafetyWarning(makeWarning())
    expect(warning).not.toBeNull()
    expect(validateWarningWav(makeWav(), warning!)).toBeNull()
    expect(validateWarningWav(makeWav(24000), warning!)).toContain('16 kHz')
    expect(validateWarningWav(makeWav(), { ...warning!, audio_bytes: 999 })).toContain('size')
  })

  it('rejects malformed or truncated WAV containers', () => {
    const warning = parseSafetyWarning(makeWarning())
    expect(warning).not.toBeNull()
    expect(validateWarningWav(new ArrayBuffer(8), warning!)).toContain('size')
    const wav = makeWav()
    const corrupted = wav.slice(0)
    new DataView(corrupted).setUint32(4, 1, true)
    expect(validateWarningWav(corrupted, warning!)).toContain('length')
  })
})
