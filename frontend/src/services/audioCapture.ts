/*
 * Microphone capture for WS /ws/transcribe.
 *
 * The backend expects exactly 1024-byte binary frames of
 * 16 kHz, mono, signed 16-bit little-endian PCM (512 samples = 32 ms).
 * Browsers record at 44.1/48 kHz float32, so we resample and convert here.
 */

export const TARGET_SAMPLE_RATE = 16000
export const FRAME_BYTES = 1024
const FRAME_SAMPLES = FRAME_BYTES / 2

const WORKLET_SOURCE = `
class KavachTap extends AudioWorkletProcessor {
  process(inputs) {
    const ch = inputs[0] && inputs[0][0]
    if (ch && ch.length) this.port.postMessage(ch.slice(0))
    return true
  }
}
registerProcessor('kavach-tap', KavachTap)
`

export class MicCapture {
  private ctx: AudioContext | null = null
  private stream: MediaStream | null = null
  private node: AudioWorkletNode | null = null
  private source: MediaStreamAudioSourceNode | null = null
  private carry = new Float32Array(0)
  private pos = 0
  private frame = new Int16Array(FRAME_SAMPLES)
  private fill = 0
  analyser: AnalyserNode | null = null

  private onFrame: (frame: ArrayBuffer) => void

  constructor(onFrame: (frame: ArrayBuffer) => void) {
    this.onFrame = onFrame
  }

  async start(): Promise<void> {
    if (!navigator.mediaDevices?.getUserMedia) {
      throw new Error('This browser does not support microphone access.')
    }
    this.stream = await navigator.mediaDevices.getUserMedia({
      audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true, autoGainControl: true },
    })
    this.ctx = new AudioContext()
    const url = URL.createObjectURL(new Blob([WORKLET_SOURCE], { type: 'application/javascript' }))
    try {
      await this.ctx.audioWorklet.addModule(url)
    } finally {
      URL.revokeObjectURL(url)
    }
    this.source = this.ctx.createMediaStreamSource(this.stream)
    this.analyser = this.ctx.createAnalyser()
    this.analyser.fftSize = 1024
    this.node = new AudioWorkletNode(this.ctx, 'kavach-tap')
    this.node.port.onmessage = (e: MessageEvent<Float32Array>) => this.push(e.data)
    this.source.connect(this.analyser)
    this.source.connect(this.node)
    // Worklet must be pulled by the graph; route it through a muted gain.
    const mute = this.ctx.createGain()
    mute.gain.value = 0
    this.node.connect(mute).connect(this.ctx.destination)
  }

  private push(chunk: Float32Array): void {
    if (!this.ctx) return
    const ratio = this.ctx.sampleRate / TARGET_SAMPLE_RATE
    const data = new Float32Array(this.carry.length + chunk.length)
    data.set(this.carry)
    data.set(chunk, this.carry.length)

    let t = this.pos
    while (t + 1 < data.length) {
      const i = Math.floor(t)
      const frac = t - i
      const sample = data[i] * (1 - frac) + data[i + 1] * frac
      const clamped = Math.max(-1, Math.min(1, sample))
      this.frame[this.fill++] = clamped < 0 ? clamped * 0x8000 : clamped * 0x7fff
      if (this.fill === FRAME_SAMPLES) {
        this.emit()
      }
      t += ratio
    }
    const keepFrom = Math.floor(t)
    this.carry = data.slice(keepFrom)
    this.pos = t - keepFrom
  }

  private emit(): void {
    // Copy to a fresh little-endian buffer (Int16Array is platform-endian).
    const out = new ArrayBuffer(FRAME_BYTES)
    const view = new DataView(out)
    for (let i = 0; i < FRAME_SAMPLES; i++) view.setInt16(i * 2, this.frame[i], true)
    this.fill = 0
    this.onFrame(out)
  }

  async stop(): Promise<void> {
    this.node?.port.close()
    this.node?.disconnect()
    this.source?.disconnect()
    this.stream?.getTracks().forEach((t) => t.stop())
    if (this.ctx && this.ctx.state !== 'closed') await this.ctx.close()
    this.ctx = null
    this.stream = null
    this.node = null
    this.source = null
    this.analyser = null
    this.carry = new Float32Array(0)
    this.pos = 0
    this.fill = 0
  }
}
