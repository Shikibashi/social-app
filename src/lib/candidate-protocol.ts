import {
  validateAtUri,
  validateCid,
  validateCursor,
} from './feed-provider-security'

export const CANDIDATE_PROTOCOL_FORMAT = 'org.radical-liberal.candidate-batch'
export const CANDIDATE_PROTOCOL_VERSION = 1

export type PrivacyMode =
  'public-cacheable' | 'anonymous' | 'pseudonymous' | 'cohort' | 'stable-did'
export type HydrationState =
  'visible' | 'deleted' | 'labelled' | 'access-restricted' | 'unavailable'

export type Candidate = {
  uri: string
  cid: string
  candidateTimestamp: string
  hydration: {state: HydrationState; checkedAt: string}
  rankKey?: string
  reason?: {code: string; value?: string}
}

export type CandidateBatch = {
  format: typeof CANDIDATE_PROTOCOL_FORMAT
  version: 1
  batchId: string
  providerDid: string
  serviceIdentity: string
  source: {id: string; type: 'feed' | 'search' | 'recommendation' | 'custom'}
  manifest: {id: string; version: string; hash: string}
  generatedAt: string
  expiresAt: string
  cursor?: string
  privacyMode: PrivacyMode
  candidates: Candidate[]
  signed: {keyId: string; algorithm: 'ECDSA-P256-SHA256'; signature: string}
}

const MAX_BATCH_BYTES = 2_000_000
const MAX_CANDIDATES = 100
const MAX_ID_LENGTH = 256

export function canonicalize(value: unknown): string {
  return JSON.stringify(sortCanonical(value))
}

export function validateCandidateBatch(
  value: unknown,
  now = Date.now(),
): CandidateBatch {
  if (
    !isPlainObject(value) ||
    value.format !== CANDIDATE_PROTOCOL_FORMAT ||
    value.version !== CANDIDATE_PROTOCOL_VERSION
  )
    throw new Error('Candidate batch version or format is invalid')
  const batch = value
  if (JSON.stringify(value).length > MAX_BATCH_BYTES)
    throw new Error('Candidate batch is too large')
  for (const field of ['batchId', 'providerDid', 'serviceIdentity'])
    if (
      typeof batch[field] !== 'string' ||
      !batch[field] ||
      batch[field].length > MAX_ID_LENGTH
    )
      throw new Error(`Candidate batch field is invalid: ${field}`)
  if (
    typeof batch.providerDid !== 'string' ||
    !/^did:(plc|web):[A-Za-z0-9.:-]+$/.test(batch.providerDid)
  )
    throw new Error('Candidate provider DID is invalid')
  const source = batch.source
  if (
    !isPlainObject(source) ||
    typeof source.type !== 'string' ||
    !['feed', 'search', 'recommendation', 'custom'].includes(source.type) ||
    typeof source.id !== 'string' ||
    source.id.length > MAX_ID_LENGTH
  )
    throw new Error('Candidate source is invalid')
  const manifest = batch.manifest
  if (
    !isPlainObject(manifest) ||
    ['id', 'version', 'hash'].some(
      key => typeof manifest[key] !== 'string' || !manifest[key],
    )
  )
    throw new Error('Candidate manifest reference is invalid')
  const generatedAt = parseTime(batch.generatedAt, 'generatedAt')
  const expiresAt = parseTime(batch.expiresAt, 'expiresAt')
  if (expiresAt <= generatedAt || expiresAt < now)
    throw new Error('Candidate batch is expired or has invalid expiry')
  validateCursor(batch.cursor)
  if (
    typeof batch.privacyMode !== 'string' ||
    ![
      'public-cacheable',
      'anonymous',
      'pseudonymous',
      'cohort',
      'stable-did',
    ].includes(batch.privacyMode)
  )
    throw new Error('Candidate privacy mode is invalid')
  if (
    !Array.isArray(batch.candidates) ||
    batch.candidates.length > MAX_CANDIDATES
  )
    throw new Error('Candidate list is invalid or too large')
  const seen = new Set<string>()
  for (const candidate of batch.candidates) {
    if (!isPlainObject(candidate)) throw new Error('Candidate is malformed')
    const uri = validateAtUri(candidate.uri)
    validateCid(candidate.cid)
    if (seen.has(uri)) throw new Error('Candidate batch contains duplicates')
    seen.add(uri)
    parseTime(candidate.candidateTimestamp, 'candidateTimestamp')
    const hydration = candidate.hydration
    if (
      !isPlainObject(hydration) ||
      typeof hydration.state !== 'string' ||
      ![
        'visible',
        'deleted',
        'labelled',
        'access-restricted',
        'unavailable',
      ].includes(hydration.state)
    )
      throw new Error('Candidate hydration state is invalid')
    parseTime(hydration.checkedAt, 'hydration.checkedAt')
    if (
      candidate.rankKey !== undefined &&
      (typeof candidate.rankKey !== 'string' ||
        !/^(0|[1-9]\d*)(\.\d+)?$/.test(candidate.rankKey))
    )
      throw new Error('Candidate rank key is not canonical')
    const reason = candidate.reason
    if (
      reason !== undefined &&
      (!isPlainObject(reason) ||
        typeof reason.code !== 'string' ||
        !/^[a-z][a-z0-9_.-]{0,63}$/.test(reason.code) ||
        (reason.value !== undefined &&
          (typeof reason.value !== 'string' || reason.value.length > 256)))
    )
      throw new Error('Candidate reason is invalid')
  }
  const signed = batch.signed
  if (
    !isPlainObject(signed) ||
    signed.algorithm !== 'ECDSA-P256-SHA256' ||
    typeof signed.keyId !== 'string' ||
    typeof signed.signature !== 'string'
  )
    throw new Error('Candidate signature metadata is invalid')
  return batch as unknown as CandidateBatch
}

export function unsignedBatch(
  batch: CandidateBatch,
): Omit<CandidateBatch, 'signed'> {
  const {signed: _signed, ...unsigned} = batch
  return unsigned
}

export function compareCandidates(a: Candidate, b: Candidate): number {
  const left = a.rankKey ?? '0'
  const right = b.rankKey ?? '0'
  return left < right
    ? -1
    : left > right
      ? 1
      : a.uri < b.uri
        ? -1
        : a.uri > b.uri
          ? 1
          : 0
}

export async function signCandidateBatch(
  batch: CandidateBatch,
  privateKey: CryptoKey,
): Promise<CandidateBatch> {
  validateCandidateBatch(batch)
  const data = new TextEncoder().encode(canonicalize(unsignedBatch(batch)))
  const signature = await crypto.subtle.sign(
    {name: 'ECDSA', hash: 'SHA-256'},
    privateKey,
    toArrayBuffer(data),
  )
  return {
    ...batch,
    signed: {
      ...batch.signed,
      signature: toBase64Url(new Uint8Array(signature)),
    },
  }
}

export async function verifyCandidateBatch(
  batch: CandidateBatch,
  publicKey: CryptoKey,
  now = Date.now(),
): Promise<boolean> {
  validateCandidateBatch(batch, now)
  const data = new TextEncoder().encode(canonicalize(unsignedBatch(batch)))
  return crypto.subtle.verify(
    {name: 'ECDSA', hash: 'SHA-256'},
    publicKey,
    toArrayBuffer(fromBase64Url(batch.signed.signature)),
    toArrayBuffer(data),
  )
}

export class ReplayGuard {
  private readonly seen = new Set<string>()
  constructor(private readonly maxEntries = 1000) {}
  accept(batch: CandidateBatch, now = Date.now()): void {
    validateCandidateBatch(batch, now)
    if (this.seen.has(batch.batchId))
      throw new Error('Candidate batch replay detected')
    if (this.seen.size >= this.maxEntries)
      this.seen.delete(this.seen.values().next().value as string)
    this.seen.add(batch.batchId)
  }
}

function parseTime(value: unknown, field: string): number {
  if (
    typeof value !== 'string' ||
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/.test(value)
  )
    throw new Error(`Candidate ${field} is invalid`)
  const parsed = Date.parse(value)
  if (!Number.isFinite(parsed)) throw new Error(`Candidate ${field} is invalid`)
  return parsed
}
function sortCanonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortCanonical)
  if (isPlainObject(value))
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .map(key => [key, sortCanonical(value[key])]),
    )
  if (typeof value === 'number' && !Number.isFinite(value))
    throw new Error('Non-finite canonical value')
  if (value === undefined) throw new Error('Undefined canonical value')
  return value
}
function isPlainObject(value: unknown): value is Record<string, unknown> {
  return (
    typeof value === 'object' &&
    value !== null &&
    !Array.isArray(value) &&
    Object.getPrototypeOf(value) === Object.prototype
  )
}
function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  const buffer = new ArrayBuffer(bytes.byteLength)
  new Uint8Array(buffer).set(bytes)
  return buffer
}
function toBase64Url(bytes: Uint8Array): string {
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}
function fromBase64Url(value: string): Uint8Array {
  if (!/^[A-Za-z0-9_-]+$/.test(value))
    throw new Error('Candidate signature encoding is invalid')
  const binary = atob(value.replace(/-/g, '+').replace(/_/g, '/'))
  return Uint8Array.from(binary, char => char.charCodeAt(0))
}
