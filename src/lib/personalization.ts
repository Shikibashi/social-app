import {isDidString} from '@atproto/lex'
import AsyncStorage from '@react-native-async-storage/async-storage'

import {
  defaultContentFilterPolicy,
  isContextualContentFilterPolicy,
  type ContentFilterPolicy,
  validateContentFilterPolicy,
} from '#/lib/feed-sovereignty/content-filter'
import {
  defaultLocalCurationConfig,
  isLegacyRadlibCurationConfig,
  type RadlibCurationConfig,
  validateRadlibCurationConfig,
} from '#/lib/feed-sovereignty/radlib-curation'
import {emitPersonalizationChanged} from '#/state/events'

export const PERSONALIZATION_FORMAT = 'org.radical-liberal.personalization'
export const PERSONALIZATION_VERSION = 1 as const
export const PERSONALIZATION_STORAGE_PREFIX = 'PERSONALIZATION_V1:'
export const MAX_IMPORT_BYTES = 1_000_000
const MAX_ARRAY_ITEMS = 2_000
const MAX_MAP_ITEMS = 2_000
const MAX_STRING_LENGTH = 512
const PBKDF2_ITERATIONS = 120_000

type ExportLevel = 'settings' | 'profile' | 'archive'

export type ExplicitPreferences = {
  selectedFeedPreset: string
  discovery: number
  familiarity: number
  freshness: number
  variety: number
  conversationActivity: number
  constructiveness?: number
  explorationLevel: number
  explicitInterests: string[]
  explicitAuthors: Array<{did: string; preference: 'prefer' | 'avoid'}>
  explicitPostPreferences: Array<{
    uri: string
    preference: 'prefer' | 'avoid'
  }>
  inferredInterestsEnabled?: boolean
  quietMode: {
    enabled: boolean
    start?: string
    end?: string
    userConfigured?: boolean
  }
  visibleMetrics: string[]
  languages: string[]
  topics: Record<string, number>
  classifierModules: Record<string, 'prefer' | 'neutral' | 'avoid'>
  contentFilterPolicy?: ContentFilterPolicy
  radlibCuration?: RadlibCurationConfig
}

export type LearnedProfile = {
  inferredTopics: Record<string, number>
  authorAffinity: Record<string, number>
  sourceAffinity: Record<string, number>
  languageAffinity: Record<string, number>
  interactionWeights: Record<string, number>
  explorationHistory: string[]
  lastUpdatedAt?: string
}

export type EphemeralState = {
  recentlySeen: string[]
  paginationWindow: string[]
  requestState: Record<string, string>
  rankingTraces: Record<string, string[]>
}

export type ServiceConfiguration = {
  appView?: string
  feedProviders: string[]
  searchProvider?: string
  labelers: string[]
}

export type PersonalizationState = {
  format: typeof PERSONALIZATION_FORMAT
  version: typeof PERSONALIZATION_VERSION
  accountDid: string
  explicit: ExplicitPreferences
  learned: LearnedProfile
  ephemeral: EphemeralState
  services: ServiceConfiguration
  createdAt: string
  updatedAt: string
}

export type PersonalizationExport = {
  format: typeof PERSONALIZATION_FORMAT
  version: typeof PERSONALIZATION_VERSION
  exportLevel: ExportLevel
  createdAt: string
  accountDid: string
  profile: {
    explicit: ExplicitPreferences
    learned?: LearnedProfile
    ephemeral?: EphemeralState
    services?: ServiceConfiguration
  }
  provenance: {
    client: string
    clientVersion?: string
    algorithmProfiles: string[]
  }
}

export type EncryptedPersonalizationExport = {
  format: 'org.radical-liberal.personalization.encrypted'
  version: 1
  accountDid: string
  kdf: 'PBKDF2-SHA-256'
  iterations: number
  cipher: 'AES-256-GCM'
  salt: number[]
  iv: number[]
  ciphertext: number[]
}

export const defaultExplicitPreferences: ExplicitPreferences = {
  selectedFeedPreset: 'following',
  discovery: 0.4,
  familiarity: 0.55,
  freshness: 0.65,
  variety: 0.5,
  conversationActivity: 0.3,
  explorationLevel: 0.5,
  explicitInterests: [],
  explicitAuthors: [],
  explicitPostPreferences: [],
  inferredInterestsEnabled: true,
  quietMode: {enabled: true, userConfigured: false},
  visibleMetrics: [],
  languages: [],
  topics: {},
  classifierModules: {},
  contentFilterPolicy: defaultContentFilterPolicy,
  radlibCuration: defaultLocalCurationConfig,
}

export const defaultLearnedProfile: LearnedProfile = {
  inferredTopics: {},
  authorAffinity: {},
  sourceAffinity: {},
  languageAffinity: {},
  interactionWeights: {},
  explorationHistory: [],
}

export const defaultEphemeralState: EphemeralState = {
  recentlySeen: [],
  paginationWindow: [],
  requestState: {},
  rankingTraces: {},
}

export const defaultServiceConfiguration: ServiceConfiguration = {
  feedProviders: [],
  labelers: [],
}

function freshDefaultExplicitPreferences(): ExplicitPreferences {
  return {
    ...defaultExplicitPreferences,
    quietMode: {...defaultExplicitPreferences.quietMode},
    explicitInterests: [],
    explicitAuthors: [],
    explicitPostPreferences: [],
    languages: [],
    topics: {},
    classifierModules: {},
    contentFilterPolicy: {
      ...defaultContentFilterPolicy,
      termPacks: [...defaultContentFilterPolicy.termPacks],
      customTerms: [...defaultContentFilterPolicy.customTerms],
      excludedAuthorDids: [...defaultContentFilterPolicy.excludedAuthorDids],
    },
    radlibCuration: {
      ...defaultLocalCurationConfig,
      curationTerms: [...(defaultLocalCurationConfig.curationTerms ?? [])],
      excludedTerms: [...defaultLocalCurationConfig.excludedTerms],
      excludedAuthorDids: [...defaultLocalCurationConfig.excludedAuthorDids],
    },
  }
}

export function createPersonalizationState(
  accountDid: string,
  patch: Partial<
    Pick<
      PersonalizationState,
      'explicit' | 'learned' | 'ephemeral' | 'services'
    >
  > = {},
): PersonalizationState {
  assertDid(accountDid, 'accountDid')
  const now = new Date().toISOString()
  return {
    format: PERSONALIZATION_FORMAT,
    version: PERSONALIZATION_VERSION,
    accountDid,
    explicit: {...freshDefaultExplicitPreferences(), ...patch.explicit},
    learned: {...defaultLearnedProfile, ...patch.learned},
    ephemeral: {...defaultEphemeralState, ...patch.ephemeral},
    services: {...defaultServiceConfiguration, ...patch.services},
    createdAt: now,
    updatedAt: now,
  }
}

export function exportPersonalization(
  state: PersonalizationState,
  exportLevel: ExportLevel,
  provenance: Partial<PersonalizationExport['provenance']> = {},
): string {
  validatePersonalizationState(state)
  const profile: PersonalizationExport['profile'] = {
    explicit: state.explicit,
    services: state.services,
  }
  if (exportLevel !== 'settings') profile.learned = state.learned
  if (exportLevel === 'archive') profile.ephemeral = state.ephemeral
  const output: PersonalizationExport = {
    format: PERSONALIZATION_FORMAT,
    version: PERSONALIZATION_VERSION,
    exportLevel,
    createdAt: new Date().toISOString(),
    accountDid: state.accountDid,
    profile,
    provenance: {
      client: provenance.client ?? 'social-app',
      clientVersion: provenance.clientVersion,
      algorithmProfiles: provenance.algorithmProfiles ?? [],
    },
  }
  return JSON.stringify(output)
}

export function importPersonalization(
  serialized: string,
  expectedAccountDid?: string,
): PersonalizationState {
  if (
    typeof serialized !== 'string' ||
    new TextEncoder().encode(serialized).byteLength > MAX_IMPORT_BYTES
  ) {
    throw new Error('Personalization import exceeds the maximum size')
  }
  let value: unknown
  try {
    value = JSON.parse(serialized)
  } catch {
    throw new Error('Personalization import is not valid JSON')
  }
  const migrated = migratePersonalization(value)
  if (expectedAccountDid && migrated.accountDid !== expectedAccountDid) {
    throw new Error(
      'Personalization account DID does not match the current account',
    )
  }
  validatePersonalizationState(migrated)
  return migrated
}

export function migratePersonalization(input: unknown): PersonalizationState {
  if (!isPlainObject(input))
    throw new Error('Personalization import must be an object')
  rejectUnknown(input, [
    'format',
    'version',
    'exportLevel',
    'createdAt',
    'accountDid',
    'profile',
    'provenance',
  ])
  if (input.format !== PERSONALIZATION_FORMAT)
    throw new Error('Unsupported personalization format')
  if (input.version !== PERSONALIZATION_VERSION && input.version !== 0)
    throw new Error('Unsupported personalization version')
  const accountDid = input.accountDid
  const profile = input.profile
  if (typeof accountDid !== 'string' || !isPlainObject(profile))
    throw new Error('Personalization profile shape is invalid')
  assertDid(accountDid, 'accountDid')
  rejectUnknown(profile, ['explicit', 'learned', 'ephemeral', 'services'])
  const explicit = profile.explicit
  if (!isPlainObject(explicit))
    throw new Error('Personalization explicit settings are missing')
  const now = new Date().toISOString()
  return {
    format: PERSONALIZATION_FORMAT,
    version: PERSONALIZATION_VERSION,
    accountDid,
    explicit: {
      ...freshDefaultExplicitPreferences(),
      ...explicit,
    },
    learned: isPlainObject(profile.learned)
      ? {...defaultLearnedProfile, ...profile.learned}
      : {...defaultLearnedProfile},
    ephemeral: isPlainObject(profile.ephemeral)
      ? {...defaultEphemeralState, ...profile.ephemeral}
      : {...defaultEphemeralState},
    services: isPlainObject(profile.services)
      ? {
          ...defaultServiceConfiguration,
          ...profile.services,
        }
      : {...defaultServiceConfiguration},
    createdAt: typeof input.createdAt === 'string' ? input.createdAt : now,
    updatedAt: now,
  }
}

export function validatePersonalizationState(
  state: PersonalizationState,
): void {
  if (
    !isPlainObject(state) ||
    state.format !== PERSONALIZATION_FORMAT ||
    state.version !== PERSONALIZATION_VERSION
  ) {
    throw new Error('Personalization state version or format is invalid')
  }
  rejectUnknown(state, [
    'format',
    'version',
    'accountDid',
    'explicit',
    'learned',
    'ephemeral',
    'services',
    'createdAt',
    'updatedAt',
  ])
  assertDid(state.accountDid, 'accountDid')
  validateExplicit(state.explicit)
  validateLearned(state.learned)
  validateEphemeral(state.ephemeral)
  validateServices(state.services)
  if (containsCredentialKey(state))
    throw new Error('Personalization state contains credential-like data')
}

export async function encryptPersonalization(
  serialized: string,
  password: string,
): Promise<string> {
  if (!password || !globalThis.crypto?.subtle)
    throw new Error('Authenticated platform cryptography is unavailable')
  if (new TextEncoder().encode(serialized).byteLength > MAX_IMPORT_BYTES)
    throw new Error('Personalization export exceeds the maximum size')
  const validated = importPersonalization(serialized)
  const encoder = new TextEncoder()
  const salt = crypto.getRandomValues(new Uint8Array(16))
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const baseKey = await crypto.subtle.importKey(
    'raw',
    encoder.encode(password),
    'PBKDF2',
    false,
    ['deriveKey'],
  )
  const key = await crypto.subtle.deriveKey(
    {name: 'PBKDF2', salt, iterations: PBKDF2_ITERATIONS, hash: 'SHA-256'},
    baseKey,
    {name: 'AES-GCM', length: 256},
    false,
    ['encrypt'],
  )
  const ciphertext = await crypto.subtle.encrypt(
    {name: 'AES-GCM', iv},
    key,
    encoder.encode(serialized),
  )
  const envelope: EncryptedPersonalizationExport = {
    format: 'org.radical-liberal.personalization.encrypted',
    version: 1,
    accountDid: validated.accountDid,
    kdf: 'PBKDF2-SHA-256',
    iterations: PBKDF2_ITERATIONS,
    cipher: 'AES-256-GCM',
    salt: [...salt],
    iv: [...iv],
    ciphertext: [...new Uint8Array(ciphertext)],
  }
  return JSON.stringify(envelope)
}

export async function decryptPersonalization(
  encrypted: string,
  password: string,
  expectedAccountDid?: string,
): Promise<PersonalizationState> {
  if (
    !password ||
    typeof encrypted !== 'string' ||
    new TextEncoder().encode(encrypted).byteLength > MAX_IMPORT_BYTES * 2
  )
    throw new Error('Encrypted personalization import is invalid')
  let envelope: EncryptedPersonalizationExport
  try {
    envelope = JSON.parse(encrypted) as EncryptedPersonalizationExport
  } catch {
    throw new Error('Encrypted personalization import is not valid JSON')
  }
  if (
    envelope.format !== 'org.radical-liberal.personalization.encrypted' ||
    envelope.version !== 1 ||
    envelope.kdf !== 'PBKDF2-SHA-256' ||
    envelope.cipher !== 'AES-256-GCM' ||
    envelope.iterations !== PBKDF2_ITERATIONS
  )
    throw new Error('Unsupported encrypted personalization format')
  assertDid(envelope.accountDid, 'accountDid')
  if (expectedAccountDid && envelope.accountDid !== expectedAccountDid)
    throw new Error(
      'Personalization account DID does not match the current account',
    )
  if (
    !validBytes(envelope.salt, 16) ||
    !validBytes(envelope.iv, 12) ||
    !validBytes(envelope.ciphertext, 16)
  )
    throw new Error('Encrypted personalization payload is malformed')
  try {
    const encoder = new TextEncoder()
    const baseKey = await crypto.subtle.importKey(
      'raw',
      encoder.encode(password),
      'PBKDF2',
      false,
      ['deriveKey'],
    )
    const key = await crypto.subtle.deriveKey(
      {
        name: 'PBKDF2',
        salt: new Uint8Array(envelope.salt),
        iterations: PBKDF2_ITERATIONS,
        hash: 'SHA-256',
      },
      baseKey,
      {name: 'AES-GCM', length: 256},
      false,
      ['decrypt'],
    )
    const plaintext = await crypto.subtle.decrypt(
      {name: 'AES-GCM', iv: new Uint8Array(envelope.iv)},
      key,
      new Uint8Array(envelope.ciphertext),
    )
    return importPersonalization(
      new TextDecoder().decode(plaintext),
      expectedAccountDid,
    )
  } catch {
    throw new Error('Unable to decrypt personalization backup')
  }
}

export function resetLearnedState(
  state: PersonalizationState,
): PersonalizationState {
  validatePersonalizationState(state)
  return {
    ...state,
    learned: {...defaultLearnedProfile},
    ephemeral: {...defaultEphemeralState},
    updatedAt: new Date().toISOString(),
  }
}

export function resetExplicitState(
  state: PersonalizationState,
): PersonalizationState {
  validatePersonalizationState(state)
  return {
    ...state,
    explicit: freshDefaultExplicitPreferences(),
    updatedAt: new Date().toISOString(),
  }
}

function migrateImplicitDefaults(
  state: PersonalizationState,
): PersonalizationState {
  let explicit = state.explicit
  let changed = false

  // Early builds persisted the project-specific profile merely by touching
  // another setting. Replace that implicit state for accounts that never
  // changed it, while leaving any edited profile untouched.
  if (isContextualContentFilterPolicy(explicit.contentFilterPolicy)) {
    explicit = {
      ...explicit,
      contentFilterPolicy: freshDefaultExplicitPreferences().contentFilterPolicy,
    }
    changed = true
  }
  if (isLegacyRadlibCurationConfig(explicit.radlibCuration)) {
    explicit = {
      ...explicit,
      radlibCuration: freshDefaultExplicitPreferences().radlibCuration,
    }
    changed = true
  }

  return changed ? {...state, explicit} : state
}

export async function loadPersonalization(
  accountDid: string,
): Promise<PersonalizationState> {
  assertDid(accountDid, 'accountDid')
  const value = await AsyncStorage.getItem(
    PERSONALIZATION_STORAGE_PREFIX + accountDid,
  )
  if (!value) return createPersonalizationState(accountDid)
  try {
    const parsed = JSON.parse(value) as unknown
    if (
      isPlainObject(parsed) &&
      parsed.format === PERSONALIZATION_FORMAT &&
      parsed.version === PERSONALIZATION_VERSION &&
      'profile' in parsed
    ) {
      return migrateImplicitDefaults(importPersonalization(value, accountDid))
    }
    const stored = parsed as PersonalizationState
    const migrated =
      isPlainObject(stored.explicit) &&
      stored.explicit.inferredInterestsEnabled === undefined
        ? {
            ...stored,
            explicit: {
              ...stored.explicit,
              inferredInterestsEnabled: true,
            },
          }
        : stored
    validatePersonalizationState(migrated)
    if (migrated.accountDid !== accountDid)
      throw new Error('Personalization account mismatch')
    return migrateImplicitDefaults(migrated)
  } catch {
    return createPersonalizationState(accountDid)
  }
}

export async function savePersonalization(
  state: PersonalizationState,
): Promise<void> {
  validatePersonalizationState(state)
  await AsyncStorage.setItem(
    PERSONALIZATION_STORAGE_PREFIX + state.accountDid,
    JSON.stringify({...state, updatedAt: new Date().toISOString()}),
  )
  emitPersonalizationChanged(state.accountDid)
}

export async function setExplicitPostPreference(
  accountDid: string,
  uri: string,
  preference: 'prefer' | 'avoid',
): Promise<void> {
  if (!uri || uri.length > MAX_STRING_LENGTH) {
    throw new Error('Invalid explicit post preference URI')
  }
  const state = await loadPersonalization(accountDid)
  const nextPreferences = state.explicit.explicitPostPreferences.filter(
    item => item.uri !== uri,
  )
  nextPreferences.push({uri, preference})
  await savePersonalization({
    ...state,
    explicit: {
      ...state.explicit,
      explicitPostPreferences: nextPreferences.slice(-MAX_ARRAY_ITEMS),
    },
    updatedAt: new Date().toISOString(),
  })
}

export async function clearExplicitPostPreference(
  accountDid: string,
  uri: string,
): Promise<void> {
  if (!uri || uri.length > MAX_STRING_LENGTH) {
    throw new Error('Invalid explicit post preference URI')
  }
  const state = await loadPersonalization(accountDid)
  const nextPreferences = state.explicit.explicitPostPreferences.filter(
    item => item.uri !== uri,
  )
  if (
    nextPreferences.length === state.explicit.explicitPostPreferences.length
  ) {
    return
  }
  await savePersonalization({
    ...state,
    explicit: {
      ...state.explicit,
      explicitPostPreferences: nextPreferences,
    },
    updatedAt: new Date().toISOString(),
  })
}

export async function resetLearnedPersonalization(
  accountDid: string,
): Promise<PersonalizationState> {
  const state = await loadPersonalization(accountDid)
  const next = resetLearnedState(state)
  await savePersonalization(next)
  return next
}

export async function resetFeedPreferences(
  accountDid: string,
): Promise<PersonalizationState> {
  const state = await loadPersonalization(accountDid)
  const next = resetExplicitState(state)
  await savePersonalization(next)
  return next
}

export async function deletePersonalization(accountDid: string): Promise<void> {
  assertDid(accountDid, 'accountDid')
  await AsyncStorage.removeItem(PERSONALIZATION_STORAGE_PREFIX + accountDid)
  emitPersonalizationChanged(accountDid)
}

function rejectUnknown(
  value: Record<string, unknown>,
  allowed: string[],
): void {
  for (const key of Object.keys(value)) {
    if (!allowed.includes(key))
      throw new Error(`Unsupported personalization field: ${key}`)
  }
}
function assertDid(value: unknown, field: string): asserts value is string {
  if (typeof value !== 'string' || !isDidString(value))
    throw new Error(`Invalid personalization ${field}`)
}
function isPlainObject(value: unknown): value is Record<string, unknown> {
  return (
    typeof value === 'object' &&
    value !== null &&
    !Array.isArray(value) &&
    Object.getPrototypeOf(value) === Object.prototype
  )
}
function finiteUnit(value: unknown, field: string): void {
  if (
    typeof value !== 'number' ||
    !Number.isFinite(value) ||
    value < 0 ||
    value > 1
  )
    throw new Error(`Invalid personalization value: ${field}`)
}
function validateExplicit(
  value: unknown,
): asserts value is ExplicitPreferences {
  if (!isPlainObject(value))
    throw new Error('Explicit personalization settings are invalid')
  rejectUnknown(value, [
    'selectedFeedPreset',
    'discovery',
    'familiarity',
    'freshness',
    'variety',
    'conversationActivity',
    'constructiveness',
    'explorationLevel',
    'explicitInterests',
    'explicitAuthors',
    'explicitPostPreferences',
    'inferredInterestsEnabled',
    'quietMode',
    'visibleMetrics',
    'languages',
    'topics',
    'classifierModules',
    'contentFilterPolicy',
    'radlibCuration',
  ])
  for (const field of [
    'discovery',
    'familiarity',
    'freshness',
    'variety',
    'conversationActivity',
    'explorationLevel',
  ])
    finiteUnit(value[field], field)
  if (value.constructiveness !== undefined)
    finiteUnit(value.constructiveness, 'constructiveness')
  if (
    typeof value.selectedFeedPreset !== 'string' ||
    value.selectedFeedPreset.length > MAX_STRING_LENGTH
  )
    throw new Error('Invalid selected feed preset')
  validateStringArray(value.explicitInterests, 'explicitInterests')
  if (
    value.inferredInterestsEnabled !== undefined &&
    typeof value.inferredInterestsEnabled !== 'boolean'
  )
    throw new Error('Invalid inferred interest setting')
  validateStringArray(value.languages, 'languages')
  validateStringArray(value.visibleMetrics, 'visibleMetrics')
  if (
    !Array.isArray(value.explicitAuthors) ||
    value.explicitAuthors.length > MAX_ARRAY_ITEMS
  )
    throw new Error('Invalid explicit author preferences')
  for (const author of value.explicitAuthors) {
    if (!isPlainObject(author))
      throw new Error('Invalid explicit author preference')
    assertDid(author.did, 'explicit author DID')
    if (author.preference !== 'prefer' && author.preference !== 'avoid')
      throw new Error('Invalid explicit author preference')
  }
  if (
    !Array.isArray(value.explicitPostPreferences) ||
    value.explicitPostPreferences.length > MAX_ARRAY_ITEMS
  )
    throw new Error('Invalid explicit post preferences')
  for (const item of value.explicitPostPreferences) {
    if (
      !isPlainObject(item) ||
      typeof item.uri !== 'string' ||
      !item.uri ||
      item.uri.length > MAX_STRING_LENGTH ||
      (item.preference !== 'prefer' && item.preference !== 'avoid')
    )
      throw new Error('Invalid explicit post preference')
  }
  validateNumberMap(value.topics, 'topics')
  validateChoiceMap(value.classifierModules, 'classifierModules')
  if (value.contentFilterPolicy !== undefined) {
    validateContentFilterPolicy(value.contentFilterPolicy)
    for (const did of value.contentFilterPolicy.excludedAuthorDids) {
      assertDid(did, 'content filter excluded author DID')
    }
  }
  if (value.radlibCuration !== undefined) {
    validateRadlibCurationConfig(value.radlibCuration)
    for (const did of value.radlibCuration.excludedAuthorDids) {
      assertDid(did, 'radical-liberal curation excluded author DID')
    }
  }
  if (
    !isPlainObject(value.quietMode) ||
    typeof value.quietMode.enabled !== 'boolean' ||
    (value.quietMode.userConfigured !== undefined &&
      typeof value.quietMode.userConfigured !== 'boolean')
  )
    throw new Error('Invalid quiet mode')
}
function validateLearned(value: unknown): asserts value is LearnedProfile {
  if (!isPlainObject(value))
    throw new Error('Learned personalization is invalid')
  rejectUnknown(value, [
    'inferredTopics',
    'authorAffinity',
    'sourceAffinity',
    'languageAffinity',
    'interactionWeights',
    'explorationHistory',
    'lastUpdatedAt',
  ])
  validateNumberMap(value.inferredTopics, 'inferredTopics')
  validateNumberMap(value.authorAffinity, 'authorAffinity')
  validateNumberMap(value.sourceAffinity, 'sourceAffinity')
  validateNumberMap(value.languageAffinity, 'languageAffinity')
  validateNumberMap(value.interactionWeights, 'interactionWeights')
  validateStringArray(value.explorationHistory, 'explorationHistory')
}
function validateEphemeral(value: unknown): asserts value is EphemeralState {
  if (!isPlainObject(value))
    throw new Error('Ephemeral personalization is invalid')
  rejectUnknown(value, [
    'recentlySeen',
    'paginationWindow',
    'requestState',
    'rankingTraces',
  ])
  validateStringArray(value.recentlySeen, 'recentlySeen')
  validateStringArray(value.paginationWindow, 'paginationWindow')
  if (!isPlainObject(value.requestState) || !isPlainObject(value.rankingTraces))
    throw new Error('Ephemeral personalization maps are invalid')
}
function validateServices(
  value: unknown,
): asserts value is ServiceConfiguration {
  if (!isPlainObject(value))
    throw new Error('Service personalization is invalid')
  rejectUnknown(value, [
    'appView',
    'feedProviders',
    'searchProvider',
    'labelers',
  ])
  validateStringArray(value.feedProviders, 'feedProviders')
  validateStringArray(value.labelers, 'labelers')
  const serviceArrays: Array<[string, string[]]> = [
    ['feedProviders', value.feedProviders as string[]],
    ['labelers', value.labelers as string[]],
  ]
  for (const [field, items] of serviceArrays) {
    for (const item of items) rejectCredentialValue(item, field)
  }
  if (value.appView !== undefined) {
    if (typeof value.appView !== 'string')
      throw new Error('Invalid AppView provider identifier')
    rejectCredentialValue(value.appView, 'appView')
  }
  if (value.searchProvider !== undefined) {
    if (typeof value.searchProvider !== 'string')
      throw new Error('Invalid search provider identifier')
    rejectCredentialValue(value.searchProvider, 'searchProvider')
  }
}
function validateStringArray(value: unknown, field: string): void {
  if (
    !Array.isArray(value) ||
    value.length > MAX_ARRAY_ITEMS ||
    value.some(
      item => typeof item !== 'string' || item.length > MAX_STRING_LENGTH,
    )
  )
    throw new Error(`Invalid personalization array: ${field}`)
}
function rejectCredentialValue(value: string, field: string): void {
  if (
    /(bearer\s|access.?token|refresh.?token|service.?auth|private.?key|password|passphrase|secret|oauth|jwt|recovery\s+key)/i.test(
      value,
    )
  )
    throw new Error(`Credential-like personalization value: ${field}`)
}
function validateNumberMap(value: unknown, field: string): void {
  if (!isPlainObject(value) || Object.keys(value).length > MAX_MAP_ITEMS)
    throw new Error(`Invalid personalization map: ${field}`)
  for (const [key, item] of Object.entries(value)) {
    if (key.length > MAX_STRING_LENGTH)
      throw new Error(`Invalid personalization key: ${field}`)
    finiteUnit(item, `${field}.${key}`)
  }
}
function validateChoiceMap(value: unknown, field: string): void {
  if (!isPlainObject(value) || Object.keys(value).length > MAX_MAP_ITEMS)
    throw new Error(`Invalid personalization map: ${field}`)
  for (const item of Object.values(value))
    if (item !== 'prefer' && item !== 'neutral' && item !== 'avoid')
      throw new Error(`Invalid personalization choice: ${field}`)
}
function validBytes(value: unknown, exactMin: number): value is number[] {
  return (
    Array.isArray(value) &&
    value.length >= exactMin &&
    value.length <= MAX_IMPORT_BYTES &&
    value.every(item => Number.isInteger(item) && item >= 0 && item <= 255)
  )
}
function containsCredentialKey(value: unknown): boolean {
  if (!isPlainObject(value)) return false
  for (const [key, item] of Object.entries(value)) {
    if (
      /(token|password|secret|oauth|refreshjwt|accessjwt|privatekey|serviceauth|apikey|bearer|jwt|passphrase|recovery)/i.test(
        key,
      )
    )
      return true
    if (isPlainObject(item) && containsCredentialKey(item)) return true
    if (Array.isArray(item) && item.some(containsCredentialKey)) return true
  }
  return false
}
