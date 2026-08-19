import {isDidString} from '@atproto/lex'
import {AtUri, type AtUriString} from '@atproto/syntax'
import {CID} from 'multiformats/cid'

export const FEED_PROVIDER_LIMITS = {
  maxResponseBytes: 2_000_000,
  maxCompressedBytes: 1_000_000,
  maxCandidates: 100,
  // ATProto feed providers commonly encode timestamp/index state as an
  // opaque base64 cursor. The current Bluesky Discover cursor is 792 bytes;
  // keep a 4 KiB bound so real cursors pass without accepting unbounded input.
  maxCursorLength: 4_096,
  maxPaginationPages: 20,
  connectTimeoutMs: 3_000,
  readTimeoutMs: 10_000,
  totalTimeoutMs: 15_000,
  maxConcurrentRequests: 2,
} as const

export type ProviderManifest = {
  id: string
  providerDid: string
  endpoint: string
  algorithm: string
  version: string
  manifestHash: string
  signingKeyId?: string
  revoked?: boolean
}

export type ValidatedFeedBatch<T = unknown> = {
  feed: T[]
  cursor?: string
  feedContext?: string
}

export type ProviderFailure =
  | 'timeout'
  | 'malformed-response'
  | 'identity-failure'
  | 'signature-failure'
  | 'stale-batch'
  | 'unavailable'
  | 'circuit-open'
  | 'hydration-disagreement'

export function validateProviderManifest(manifest: unknown): ProviderManifest {
  if (!isPlainObject(manifest))
    throw new Error('Provider manifest must be an object')
  const fields = [
    'id',
    'providerDid',
    'endpoint',
    'algorithm',
    'version',
    'manifestHash',
  ]
  for (const field of fields) {
    if (
      typeof manifest[field] !== 'string' ||
      !manifest[field] ||
      manifest[field].length > 512
    ) {
      throw new Error(`Provider manifest field is invalid: ${field}`)
    }
  }
  if (!isDidString(manifest.providerDid))
    throw new Error('Provider manifest DID is invalid')
  const endpointValue = manifest.endpoint
  if (typeof endpointValue !== 'string')
    throw new Error('Provider manifest endpoint is invalid')
  let endpoint: URL
  try {
    endpoint = new URL(endpointValue)
  } catch {
    throw new Error('Provider manifest endpoint is invalid')
  }
  if (
    endpoint.protocol !== 'https:' ||
    endpoint.username ||
    endpoint.password ||
    endpoint.port ||
    endpoint.hash ||
    endpoint.search
  ) {
    throw new Error(
      'Provider manifest endpoint must be a canonical HTTPS origin',
    )
  }
  if (isPrivateHostname(endpoint.hostname))
    throw new Error(
      'Provider manifest endpoint targets a private or local host',
    )
  if (manifest.revoked === true) throw new Error('Provider manifest is revoked')
  if (
    manifest.signingKeyId !== undefined &&
    (typeof manifest.signingKeyId !== 'string' ||
      manifest.signingKeyId.length > 256)
  )
    throw new Error('Provider signing key identifier is invalid')
  return manifest as unknown as ProviderManifest
}

export function validateCursor(cursor: unknown): string | undefined {
  if (cursor === undefined || cursor === '') return undefined
  if (
    typeof cursor !== 'string' ||
    cursor.length > FEED_PROVIDER_LIMITS.maxCursorLength ||
    /[\u0000-\u001f\u007f\s<>]/.test(cursor)
  )
    throw new Error('Provider cursor is invalid or too large')
  return cursor
}

export function validateAtUri(uri: unknown): AtUriString {
  if (
    typeof uri !== 'string' ||
    uri.length > 1024 ||
    /[\u0000-\u0020<>]/.test(uri)
  )
    throw new Error('Provider candidate URI is invalid')
  try {
    const parsed = new AtUri(uri)
    if (!parsed.did || !parsed.collection || !parsed.rkey)
      throw new Error('incomplete AT URI')
    return uri as AtUriString
  } catch {
    throw new Error('Provider candidate URI is invalid')
  }
}

export function validateCid(cid: unknown): string {
  if (
    typeof cid !== 'string' ||
    cid.length < 10 ||
    cid.length > 256 ||
    !/^b[a-z2-7]+$/.test(cid)
  )
    throw new Error('Provider candidate CID is invalid')
  try {
    CID.parse(cid)
  } catch {
    if (!/^bafy[a-z2-7]{50,}$/.test(cid))
      throw new Error('Provider candidate CID is invalid')
  }
  return cid
}

export function validateFeedBatch<
  T extends {post?: {uri?: unknown; cid?: unknown}},
>(
  value: unknown,
  requestedLimit: number = FEED_PROVIDER_LIMITS.maxCandidates,
): ValidatedFeedBatch<T> {
  if (!isPlainObject(value) || !Array.isArray(value.feed))
    throw new Error('Provider feed response is malformed')
  const limit = Math.max(
    1,
    Math.min(FEED_PROVIDER_LIMITS.maxCandidates, Math.floor(requestedLimit)),
  )
  if (value.feed.length > limit)
    throw new Error('Provider returned too many candidates')
  const seen = new Set<string>()
  const feed = value.feed.map((item, index) => {
    const post = isPlainObject(item) ? item.post : undefined
    if (!isPlainObject(item) || !isPlainObject(post))
      throw new Error(`Provider candidate ${index} is malformed`)
    const uri = validateAtUri(post.uri)
    validateCid(post.cid)
    const candidate = item
    const reason = candidate.reason
    if (isPlainObject(reason) && reason.reasonMetadata !== undefined) {
      validateReasonMetadata(reason.reasonMetadata)
    }
    if (candidate.reasonMetadata !== undefined) {
      validateReasonMetadata(candidate.reasonMetadata)
    }
    if (seen.has(uri)) throw new Error('Provider returned duplicate candidates')
    seen.add(uri)
    return item as T
  })
  return {
    feed,
    cursor: validateCursor(value.cursor),
    feedContext: validateFeedContext(value.feedContext),
  }
}

function validateFeedContext(value: unknown): string | undefined {
  if (value === undefined || value === '') return undefined
  if (
    typeof value !== 'string' ||
    value.length > FEED_PROVIDER_LIMITS.maxCursorLength ||
    /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(value)
  ) {
    throw new Error('Provider feed context is invalid or too large')
  }
  return value
}

export function validateReasonMetadata(
  reason: unknown,
): Record<string, string> | undefined {
  if (reason === undefined || reason === null) return undefined
  if (!isPlainObject(reason))
    throw new Error('Provider candidate reason is malformed')
  const output: Record<string, string> = {}
  for (const [key, value] of Object.entries(reason)) {
    if (
      !/^[A-Za-z][A-Za-z0-9_.-]{0,63}$/.test(key) ||
      typeof value !== 'string' ||
      value.length > 512
    )
      throw new Error('Provider candidate reason is malformed')
    output[key] = value
  }
  return output
}

/**
 * Return only a bounded, provider-declared explanation that is safe to show
 * next to a post. Scores, weights, model names, and other opaque fields are
 * deliberately ignored. An unknown typed reason still gets an honest
 * attribution when the provider did not publish a readable explanation.
 */
export function publicProviderReason(reason: unknown): string | undefined {
  if (!isPlainObject(reason) || typeof reason.$type !== 'string') return
  if (
    reason.$type === 'reasonFeedSource' ||
    reason.$type === 'app.bsky.feed.defs#reasonRepost' ||
    reason.$type === 'app.bsky.feed.defs#reasonPin'
  )
    return

  const metadata = reason.reasonMetadata
  if (metadata !== undefined) {
    let validated: Record<string, string> | undefined
    try {
      validated = validateReasonMetadata(metadata)
    } catch {
      return 'provider supplied no public ranking explanation'
    }
    for (const key of ['label', 'reason', 'explanation']) {
      const value = validated?.[key]
      if (value) return `provider supplied: ${value.slice(0, 200)}`
    }
  }

  for (const key of ['label', 'reason', 'explanation']) {
    const value = reason[key]
    if (typeof value === 'string' && value.length > 0)
      return `provider supplied: ${value.slice(0, 200)}`
  }

  return 'provider supplied no public ranking explanation'
}

export function classifyProviderFailure(error: unknown): ProviderFailure {
  const message =
    error instanceof Error
      ? error.message.toLowerCase()
      : String(error).toLowerCase()
  if (message.includes('timeout') || message.includes('aborted'))
    return 'timeout'
  if (
    message.includes('identity') ||
    message.includes('manifest') ||
    message.includes('did')
  )
    return 'identity-failure'
  if (message.includes('signature') || message.includes('key'))
    return 'signature-failure'
  if (message.includes('stale') || message.includes('cursor'))
    return 'stale-batch'
  if (message.includes('hydration')) return 'hydration-disagreement'
  if (message.includes('circuit')) return 'circuit-open'
  if (message.includes('malformed') || message.includes('invalid'))
    return 'malformed-response'
  return 'unavailable'
}

export class ProviderCircuitBreaker {
  private failures = 0
  private openedUntil = 0
  constructor(
    private readonly threshold = 3,
    private readonly cooldownMs = 30_000,
  ) {}
  canRequest(now = Date.now()): boolean {
    return now >= this.openedUntil
  }
  recordSuccess(): void {
    this.failures = 0
    this.openedUntil = 0
  }
  recordFailure(now = Date.now()): void {
    this.failures += 1
    if (this.failures >= this.threshold)
      this.openedUntil = now + this.cooldownMs
  }
  isOpen(now = Date.now()): boolean {
    return !this.canRequest(now)
  }
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return (
    typeof value === 'object' &&
    value !== null &&
    !Array.isArray(value) &&
    Object.getPrototypeOf(value) === Object.prototype
  )
}
function isPrivateHostname(hostname: string): boolean {
  const host = hostname.toLowerCase()
  if (
    host === 'localhost' ||
    host.endsWith('.localhost') ||
    host === '::1' ||
    host === '0.0.0.0' ||
    host.endsWith('.local')
  )
    return true
  const ipv4 = host.match(/^(\d+)\.(\d+)\.(\d+)\.(\d+)$/)
  if (!ipv4) return false
  const [a, b] = ipv4.slice(1, 3).map(Number)
  return (
    a === 10 ||
    a === 127 ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    a === 0
  )
}
