import {
  type AtprotoDid,
  type OAuthSession as AtprotoOAuthSession,
} from '@atproto/oauth-client-expo'

import {PUBLIC_WEB_ORIGIN} from '#/lib/brand'
import {PUBLIC_ACCOUNT_SERVICE} from '#/lib/constants'
import {createLexClient} from '#/lib/lexClient'
import {IS_WEB} from '#/env'
import {com} from '#/lexicons'
import {networkAwareFetch} from './network'
import {ExpoOAuthClient} from './oauth-client'
import {
  OAUTH_CLIENT_METADATA,
  OAUTH_SCOPE,
  OAUTH_SIGNUP_PROMPT,
} from './oauth-scopes'
import {sessionAccountToSessionData, type SessionData} from './session-data'
import {type SessionAccount} from './types'

type OAuthRedirectUri = `https://${string}` | `${string}.${string}:/${string}`

export const OAUTH_WEB_REDIRECT_URI = `${PUBLIC_WEB_ORIGIN}/oauth/callback`
export const OAUTH_NATIVE_REDIRECT_URI = 'us.edriffles.social:/oauth/callback'

export type OAuthSessionHooks = {
  onUpdated?: (data: SessionData) => void
  onDeleted?: (data: SessionData) => void
  onUpdateFailure?: () => void
}

export type OAuthFlow = 'login' | 'create'

let oauthClient: ExpoOAuthClient | undefined
let oauthInitialization: Promise<AtprotoOAuthSession | undefined> | undefined

export type OAuthProviderSession = AtprotoOAuthSession

export type BrowserOAuthClient = ExpoOAuthClient & {
  init?: () => Promise<{session: AtprotoOAuthSession} | undefined>
}

/** Consume the browser client's one-time callback/restore result. */
export async function initializeBrowserOAuthClient(
  client: BrowserOAuthClient,
): Promise<AtprotoOAuthSession | undefined> {
  const result = await client.init?.()
  return result?.session
}

export function getOAuthClient() {
  return (oauthClient ??= new ExpoOAuthClient({
    clientMetadata: OAUTH_CLIENT_METADATA,
    handleResolver: PUBLIC_ACCOUNT_SERVICE,
    fetch: networkAwareFetch,
  }))
}

/**
 * Initialize the browser OAuth client exactly once at web-app startup.
 * BrowserOAuthClient.init() consumes an authorization callback after a
 * provider redirect and restores an IndexedDB-backed session on a normal
 * reload. Native OAuth clients do not expose this browser-only operation.
 */
export async function initializeOAuthClient(): Promise<
  AtprotoOAuthSession | undefined
> {
  if (!IS_WEB) return undefined
  oauthInitialization ??= (async () => {
    return initializeBrowserOAuthClient(getOAuthClient() as BrowserOAuthClient)
  })()
  return oauthInitialization
}

export async function signInWithOAuth(
  identifierOrService: string,
  hooks: OAuthSessionHooks = {},
  options: {flow?: OAuthFlow} = {},
) {
  return OAuthSessionAdapter.fromSession(
    await getOAuthClient().signIn(identifierOrService, {
      redirect_uri: (IS_WEB
        ? OAUTH_WEB_REDIRECT_URI
        : OAUTH_NATIVE_REDIRECT_URI) as OAuthRedirectUri,
      scope: OAUTH_SCOPE,
      ...(options.flow === 'create' ? {prompt: OAUTH_SIGNUP_PROMPT} : {}),
    }),
    hooks,
  )
}

/**
 * Start the provider-owned OAuth account-creation flow.
 *
 * This is intentionally separate from `signInWithOAuth`: providers that do
 * not advertise `prompt=create` must not be treated as OAuth-native signup
 * providers. The session API keeps the upstream signup method's compatibility
 * shape, but routes it through this provider-owned flow instead of sending
 * email or password fields to a PDS.
 */
export async function signUpWithOAuth(
  service: string,
  hooks: OAuthSessionHooks = {},
) {
  return signInWithOAuth(service, hooks, {flow: 'create'})
}

export async function restoreOAuthSession(
  did: string,
  hooks: OAuthSessionHooks,
  pdsUrl?: string,
) {
  return OAuthSessionAdapter.fromSession(
    await getOAuthClient().restore(did),
    hooks,
    pdsUrl,
  )
}

export async function revokeOAuthSession(did: string) {
  await getOAuthClient().revoke(did)
}

/**
 * A small compatibility boundary for the app's existing Client/provider
 * graph. Tokens and refresh keys stay inside the official OAuth client; the
 * rest of the app receives only identity/session metadata and a DPoP-aware
 * fetch handler.
 */
export class OAuthSessionAdapter {
  private disposed = false

  private constructor(
    private current: AtprotoOAuthSession | undefined,
    private snapshot: SessionData,
    private readonly hooks: OAuthSessionHooks,
  ) {}

  static async fromSession(
    session: AtprotoOAuthSession,
    hooks: OAuthSessionHooks = {},
    pdsUrl?: string,
  ) {
    const snapshot = await readSessionData(session, pdsUrl)
    return new OAuthSessionAdapter(session, snapshot, hooks)
  }

  static fromStoredAccount(
    account: SessionAccount,
    hooks: OAuthSessionHooks = {},
  ) {
    const snapshot = {
      ...sessionAccountToSessionData(account),
      authType: 'oauth' as const,
    }
    return new OAuthSessionAdapter(undefined, snapshot, hooks)
  }

  get destroyed() {
    return this.disposed
  }

  get did(): AtprotoDid {
    return this.snapshot.did as AtprotoDid
  }

  get service() {
    return this.snapshot.service
  }

  get session() {
    return this.snapshot
  }

  async fetchHandler(path: string, init?: RequestInit) {
    if (this.disposed) throw new Error('OAuth session disposed')
    try {
      const session = await this.ensureCurrent()
      return await session.fetchHandler(toPathname(path), init)
    } catch (error) {
      if (isTerminalOAuthError(error)) {
        this.disposed = true
        this.hooks.onDeleted?.(this.snapshot)
      } else {
        this.hooks.onUpdateFailure?.()
      }
      throw error
    }
  }

  async refresh() {
    if (this.disposed) throw new Error('OAuth session disposed')
    try {
      const next = await getOAuthClient().restore(this.did, true)
      const nextSnapshot = await readSessionData(next)
      this.current = next
      this.snapshot = nextSnapshot
      this.hooks.onUpdated?.(nextSnapshot)
      return nextSnapshot
    } catch (error) {
      if (isTerminalOAuthError(error)) {
        this.disposed = true
        this.hooks.onDeleted?.(this.snapshot)
      } else {
        this.hooks.onUpdateFailure?.()
      }
      throw error
    }
  }

  async signOut() {
    if (this.disposed) return
    try {
      if (this.current) {
        await this.current.signOut()
      } else {
        await revokeOAuthSession(this.did)
      }
    } finally {
      this.disposed = true
    }
  }

  async logout() {
    return this.signOut()
  }

  kill() {
    this.disposed = true
  }

  private async ensureCurrent() {
    if (!this.current) {
      this.current = await getOAuthClient().restore(this.did)
    }
    return this.current
  }
}

async function readSessionData(
  session: AtprotoOAuthSession,
  pdsUrl?: string,
): Promise<SessionData> {
  const data = (await createLexClient(session).call(
    // The OAuth scope authorizes this identity read without exposing tokens.
    com.atproto.server.getSession,
    {},
  )) as {
    did: string
    handle: string
    email?: string
    emailConfirmed?: boolean
    emailAuthFactor?: boolean
    active?: boolean
    status?: string
    didDoc?: SessionData['didDoc']
  }
  const endpoint = pdsUrl ?? extractPdsEndpoint(data.didDoc)
  const didDoc = endpoint
    ? {
        id: data.did,
        service: [
          {
            id: '#atproto_pds',
            type: 'AtprotoPersonalDataServer',
            serviceEndpoint: endpoint,
          },
        ],
      }
    : data.didDoc

  return {
    authType: 'oauth',
    did: data.did,
    handle: data.handle,
    email: data.email,
    emailConfirmed: data.emailConfirmed,
    emailAuthFactor: data.emailAuthFactor,
    active: data.active,
    status: data.status,
    service: new URL(session.serverMetadata.issuer).toString(),
    didDoc,
  }
}

function extractPdsEndpoint(didDoc: SessionData['didDoc']) {
  const service = didDoc?.service?.find(
    item =>
      item.type === 'AtprotoPersonalDataServer' || item.id === '#atproto_pds',
  )
  return typeof service?.serviceEndpoint === 'string'
    ? service.serviceEndpoint
    : undefined
}

function toPathname(path: string) {
  try {
    const url = new URL(path)
    return `${url.pathname}${url.search}`
  } catch {
    return path
  }
}

function isTerminalOAuthError(error: unknown) {
  const name = error instanceof Error ? error.name : ''
  return (
    name === 'TokenInvalidError' ||
    name === 'TokenRevokedError' ||
    name === 'TokenRefreshError'
  )
}
