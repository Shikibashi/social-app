import {type DidDocument, getPdsEndpoint} from '@atproto/common-web'

import {logger} from '#/logger'
import {getPlcResolvers, resolvePlcIdentity} from './plc-resolvers'

const RESOLUTION_TIMEOUT = 10_000

/**
 * Resolve the PDS declared by an account DID without using the account
 * entryway. Older stored entryway sessions can lack the DID document returned
 * by login, which otherwise sends service-auth requests back to bsky.social.
 *
 * This is a read-only recovery hint. A failed lookup returns undefined so an
 * offline session can still resume and surface the actual service boundary.
 */
export async function resolvePdsEndpointForDid(
  did: string,
): Promise<string | undefined> {
  let url: string
  if (did.startsWith('did:plc:')) {
    /*
     * Keep the primary endpoint as the compatibility path when no user has
     * configured another operator. Once a read replica is configured, query
     * the primary and the replica together and only use a cryptographically
     * verified document. A resolver disagreement is deliberately surfaced as
     * unavailable rather than hidden by choosing the first response.
     */
    if (getPlcResolvers().length > 0) {
      const result = await resolvePlcIdentity(did)
      const services = result.selected?.services
      const pds = services
        ? Object.values(services).find(
            service => service.type === 'AtprotoPersonalDataServer',
          )?.endpoint
        : undefined
      if (pds) return pds
      logger.debug('session: PLC resolver quorum did not select a PDS', {
        did,
        status: result.status,
        distinctDocumentKeys: result.distinctDocumentKeys.length,
      })
      return undefined
    }
    url = `https://plc.directory/${did}`
  } else if (did.startsWith('did:web:')) {
    const domain = did.slice('did:web:'.length)
    if (domain.includes(':')) return undefined
    url = `https://${decodeURIComponent(domain)}/.well-known/did.json`
  } else {
    return undefined
  }

  try {
    const response = await fetch(url, {
      redirect: 'error',
      signal: AbortSignal.timeout(RESOLUTION_TIMEOUT),
    })
    if (!response.ok) return undefined
    const document = (await response.json()) as DidDocument
    if (document.id !== did) {
      logger.debug(
        'session: DID document subject did not match requested DID',
        {
          did,
          documentId: document.id,
        },
      )
      return undefined
    }
    return getPdsEndpoint(document) ?? undefined
  } catch (error) {
    logger.debug('session: could not resolve account PDS endpoint', {
      did,
      error: String(error),
    })
    return undefined
  }
}
