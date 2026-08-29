import {
  auditLogUrl,
  type PlcResolverCompositionResult,
  type PlcResolverDescriptor,
  type PlcResolverFetch,
  resolvePlcWithResolvers,
} from '#/lib/plc-resolver'
import * as persisted from '#/state/persisted'
import {type PersistedPlcResolver} from '#/state/persisted/schema'

const MAX_RESOLVERS = 12

/** The current public PLC directory remains a compatibility fallback. */
export const PRIMARY_PLC_RESOLVER: PlcResolverDescriptor = {
  id: 'plc-directory',
  displayName: 'PLC Directory (primary)',
  endpoint: 'https://plc.directory',
  operatorId: 'plc-directory-operator',
}

/**
 * Return all locally registered resolver declarations, including disabled
 * entries. Endpoint ownership is not inferred from the hostname; the operator
 * declaration is displayed so a user can see when two entries make the same
 * control claim.
 */
export function getRegisteredPlcResolvers(): PersistedPlcResolver[] {
  const configured = configuredResolver()
  const persistedResolvers = persisted.get('plcResolvers') ?? []
  const entries = configured
    ? [
        configured,
        ...persistedResolvers.filter(item => item.id !== configured.id),
      ]
    : persistedResolvers
  return entries
    .map(item => {
      try {
        return validatePlcResolver(item)
      } catch {
        return undefined
      }
    })
    .filter((item): item is PersistedPlcResolver => Boolean(item))
}

/** Only enabled custom entries participate in the resolver fanout. */
export function getPlcResolvers(): PersistedPlcResolver[] {
  return getRegisteredPlcResolvers().filter(item => item.enabled)
}

/** Include the primary directory as an explicitly attributable fallback. */
export function getEffectivePlcResolvers(): PlcResolverDescriptor[] {
  return [
    PRIMARY_PLC_RESOLVER,
    ...getPlcResolvers()
      .map(toDescriptor)
      .filter(item => item.id !== PRIMARY_PLC_RESOLVER.id),
  ]
}

export function validatePlcResolver(
  resolver: PersistedPlcResolver,
): PersistedPlcResolver {
  if (
    !resolver.id ||
    !resolver.displayName ||
    !resolver.operatorId ||
    resolver.id === PRIMARY_PLC_RESOLVER.id
  ) {
    throw new Error('PLC resolver identity is invalid')
  }
  let endpoint: URL
  try {
    endpoint = new URL(resolver.endpoint)
  } catch {
    throw new Error('PLC resolver endpoint is invalid')
  }
  if (
    endpoint.protocol !== 'https:' ||
    endpoint.username ||
    endpoint.password ||
    endpoint.search ||
    endpoint.hash ||
    isLocalHostname(endpoint.hostname)
  ) {
    throw new Error('PLC resolver endpoint must be a public HTTPS origin')
  }
  return {
    ...resolver,
    endpoint: endpoint.toString().replace(/\/$/, ''),
  }
}

export async function registerPlcResolver(
  resolver: PersistedPlcResolver,
): Promise<PersistedPlcResolver> {
  const validated = validatePlcResolver(resolver)
  const current = persisted.get('plcResolvers') ?? []
  const next = [...current.filter(item => item.id !== validated.id), validated]
  if (next.length > MAX_RESOLVERS) {
    throw new Error(`At most ${MAX_RESOLVERS} PLC resolvers may be registered`)
  }
  await persisted.write('plcResolvers', next)
  return validated
}

export async function setPlcResolverEnabled(
  resolverId: string,
  enabled: boolean,
): Promise<void> {
  const resolver = (persisted.get('plcResolvers') ?? []).find(
    item => item.id === resolverId,
  )
  if (!resolver) throw new Error('Unknown PLC resolver')
  await persisted.write(
    'plcResolvers',
    (persisted.get('plcResolvers') ?? []).map(item =>
      item.id === resolverId ? {...item, enabled} : item,
    ),
  )
}

export async function resolvePlcIdentity(
  did: string,
  fetcher?: PlcResolverFetch,
): Promise<PlcResolverCompositionResult> {
  return resolvePlcWithResolvers(did, getEffectivePlcResolvers(), {
    fetcher,
  })
}

export {auditLogUrl}

function toDescriptor(resolver: PersistedPlcResolver): PlcResolverDescriptor {
  return {
    id: resolver.id,
    displayName: resolver.displayName,
    endpoint: resolver.endpoint,
    operatorId: resolver.operatorId,
  }
}

function configuredResolver(): PersistedPlcResolver | undefined {
  const endpoint = process.env.EXPO_PUBLIC_PLC_RESOLVER_URL
  const operatorId = process.env.EXPO_PUBLIC_PLC_RESOLVER_OPERATOR_ID
  if (!endpoint || !operatorId) return undefined
  return {
    id: process.env.EXPO_PUBLIC_PLC_RESOLVER_ID || 'configured-plc-resolver',
    displayName:
      process.env.EXPO_PUBLIC_PLC_RESOLVER_NAME ||
      'Configured PLC read replica',
    endpoint,
    operatorId,
    builtin: true,
    enabled: true,
  }
}

function isLocalHostname(hostname: string): boolean {
  return (
    hostname === 'localhost' ||
    hostname.endsWith('.local') ||
    hostname === '::1' ||
    /^127\./.test(hostname) ||
    /^10\./.test(hostname) ||
    /^192\.168\./.test(hostname) ||
    /^172\.(1[6-9]|2\d|3[01])\./.test(hostname)
  )
}
