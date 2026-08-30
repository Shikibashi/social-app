import {
  composeProviderResults,
  ProviderCompositionError,
  type ProviderCompositionResult,
  type ProviderDescriptor,
  type ProviderReconciliationPolicy,
} from '#/lib/provider-composition'

export type CommunityVisibility =
  'public' | 'restricted' | 'invite-only' | 'private' | 'protected'

/** Metadata returned by the Radlib community control plane. */
export type CommunityDirectoryEntry = {
  uri: string
  authorityDid?: string
  ownerDid?: string
  kind?: 'account' | 'community'
  name?: string
  description?: string
  visibility?: CommunityVisibility
  createdAt?: string
}

export type CommunityDirectorySourceKind =
  'account-pds' | 'community-authority-pds'

/**
 * A source is a read capability, not a new authority domain. The callback is
 * deliberately owned by the caller so this module cannot mint credentials or
 * decide which PDS may serve a private community.
 */
export type CommunityDirectorySource = ProviderDescriptor & {
  kind: CommunityDirectorySourceKind
  read: (signal?: AbortSignal) => Promise<readonly CommunityDirectoryEntry[]>
}

export type CommunityDirectoryComposition = {
  spaces: CommunityDirectoryEntry[]
  composition: ProviderCompositionResult<CommunityDirectoryEntry[]>
}

export type ComposeCommunityDirectoryOptions = {
  /** Directory union is an explicit local policy, not hidden fallback. */
  policy?: ProviderReconciliationPolicy
  signal?: AbortSignal
  maxConcurrentProviders?: number
}

/**
 * Compose directory claims from the account PDS and, for a deep link, the
 * community authority PDS. A merge policy unions records by URI while the
 * complete provider observations retain conflicts and outages for inspection.
 */
export async function composeCommunityDirectory(
  sources: readonly CommunityDirectorySource[],
  options: ComposeCommunityDirectoryOptions = {},
): Promise<CommunityDirectoryComposition> {
  assertUniqueSourceIds(sources)
  const composition = await composeProviderResults(
    sources,
    async provider => {
      const source = sources.find(item => item.id === provider.id)
      if (!source) throw new Error(`Unknown community source: ${provider.id}`)
      return {
        value: [...(await source.read(options.signal))],
        verification: 'unverified' as const,
        retrievedAt: new Date().toISOString(),
      }
    },
    {
      surface: 'communities',
      policy: options.policy ?? {mode: 'merge'},
      claimKey: communityDirectoryClaimKey,
      merge: mergeCommunityDirectoryEntries,
      signal: options.signal,
      maxConcurrentProviders: options.maxConcurrentProviders,
    },
  )

  if (
    composition.status === 'empty' ||
    composition.status === 'unavailable' ||
    composition.selected === undefined
  ) {
    throw new ProviderCompositionError(composition)
  }

  return {spaces: composition.selected, composition}
}

/**
 * Stable claim identity for a directory page. Ordering does not affect
 * agreement, while metadata disagreement for the same URI remains visible.
 */
export function communityDirectoryClaimKey(
  spaces: readonly CommunityDirectoryEntry[],
): string {
  return [...spaces]
    .map(entry => stableCommunityEntryKey(entry))
    .sort()
    .join('\u001e')
}

/**
 * Union directory pages by Space URI. If two sources disagree about metadata,
 * the first source's value is retained deterministically and the composition
 * status remains `disagreement`; callers must display that status rather than
 * presenting the merged entry as independently verified.
 */
export function mergeCommunityDirectoryEntries(
  pages: readonly (readonly CommunityDirectoryEntry[])[],
): CommunityDirectoryEntry[] {
  const entries = new Map<string, CommunityDirectoryEntry>()
  for (const page of pages) {
    for (const entry of page) {
      const existing = entries.get(entry.uri)
      if (!existing) {
        entries.set(entry.uri, {...entry})
        continue
      }
      entries.set(entry.uri, fillMissingCommunityFields(existing, entry))
    }
  }
  return [...entries.values()].sort((left, right) =>
    left.uri.localeCompare(right.uri),
  )
}

function fillMissingCommunityFields(
  existing: CommunityDirectoryEntry,
  incoming: CommunityDirectoryEntry,
): CommunityDirectoryEntry {
  return {
    ...existing,
    authorityDid: existing.authorityDid ?? incoming.authorityDid,
    ownerDid: existing.ownerDid ?? incoming.ownerDid,
    kind: existing.kind ?? incoming.kind,
    name: existing.name ?? incoming.name,
    description: existing.description ?? incoming.description,
    visibility: existing.visibility ?? incoming.visibility,
    createdAt: existing.createdAt ?? incoming.createdAt,
  }
}

function stableCommunityEntryKey(entry: CommunityDirectoryEntry): string {
  return JSON.stringify([
    entry.uri,
    entry.authorityDid ?? null,
    entry.ownerDid ?? null,
    entry.kind ?? null,
    entry.name ?? null,
    entry.description ?? null,
    entry.visibility ?? null,
    entry.createdAt ?? null,
  ])
}

function assertUniqueSourceIds(
  sources: readonly CommunityDirectorySource[],
): void {
  const ids = new Set<string>()
  for (const source of sources) {
    if (!source.id.trim()) throw new Error('Community source id is required')
    if (ids.has(source.id)) {
      throw new Error(`Duplicate community source id: ${source.id}`)
    }
    ids.add(source.id)
  }
}
