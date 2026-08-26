import {type Agent, type Client} from '@atproto/lex'
import {type DidString} from '@atproto/syntax'

import {createLexClient} from '#/lib/lexClient'
import {resolvePdsEndpointForDid} from '#/state/session/pds-resolution'
import {assertSpacesAlphaDeploymentSafe} from '#/env'
import {com} from '#/lexicons'
import {assertDid, assertSpaceRef, SpacesClient} from './client'
import {toSpaceRpc} from './rpc'

type DpopKey = {
  privateKey: CryptoKey
  publicJwk: JsonWebKey
}

/**
 * Exchange a user's PDS delegation token for a DPoP-bound Space credential.
 * The default endpoint resolver rejects unsafe private-network endpoints; the
 * optional resolver exists for explicitly controlled multi-PDS test harnesses.
 */
export type SpaceCredentialSession = {
  /** The authority endpoint, used for listRepos and writes by the viewer. */
  client: SpacesClient
  /** Build the same credential-bound client at a writer's PDS endpoint. */
  forRepo(repo: DidString): Promise<SpacesClient>
}

export async function createSpaceCredentialSession(
  userClient: Client,
  space: string,
  resolveEndpoint: (
    did: string,
  ) => Promise<string | undefined> = resolvePdsEndpointForDid,
): Promise<SpaceCredentialSession> {
  // Fail before endpoint resolution, delegation exchange, key generation, or
  // credential minting. Spaces alpha must never perform a sensitive operation
  // in a production or otherwise unknown build.
  assertSpacesAlphaDeploymentSafe()
  const authorityDid = parseSpaceAuthority(space)
  const authorityEndpoint = await resolveEndpoint(authorityDid)
  if (!authorityEndpoint) {
    throw new Error(
      `Could not resolve the Space authority PDS for ${authorityDid}`,
    )
  }

  const key = await generateDpopKey()
  const delegation = await userClient.call(toSpaceRpc.getDelegationToken, {
    space,
  })
  const credentialClient = createDpopClient(
    authorityEndpoint,
    key,
    delegation.token,
    undefined,
    userClient.did,
  )
  const credential = await credentialClient.call(
    toSpaceRpc.getSpaceCredential,
    {
      space,
    },
  )

  const makeClient = (endpoint: string) =>
    new SpacesClient(
      createDpopClient(
        endpoint,
        key,
        credential.credential,
        credential.credential,
        userClient.did,
      ),
    )

  return {
    client: makeClient(authorityEndpoint),
    async forRepo(repo) {
      const endpoint = await resolveEndpoint(repo)
      if (!endpoint) {
        throw new Error(`Could not resolve the writer PDS for ${repo}`)
      }
      return makeClient(endpoint)
    },
  }
}

/**
 * Backwards-compatible authority client for callers that do not fan out over
 * multiple writer PDSes.
 */
export async function createSpaceCredentialClient(
  userClient: Client,
  space: string,
  resolveEndpoint?: (did: string) => Promise<string | undefined>,
): Promise<SpacesClient> {
  const session = await createSpaceCredentialSession(
    userClient,
    space,
    resolveEndpoint,
  )
  return session.client
}

/**
 * Mint a short-lived user service-auth token for a Radlib control-plane
 * operation hosted by a Space authority. The authority DID is the application
 * policy audience; this token is accepted only by the matching Radlib route,
 * never by ordinary PDS repo/blob methods.
 */
export async function createRadlibAuthorityClient(
  userClient: Client,
  space: string,
  lxm: string,
  resolveEndpoint: (
    did: string,
  ) => Promise<string | undefined> = resolvePdsEndpointForDid,
): Promise<Client> {
  const authorityDid = parseSpaceAuthority(space)
  return createRadlibAuthorityClientForDid(
    userClient,
    authorityDid,
    lxm,
    resolveEndpoint,
  )
}

export async function createRadlibAuthorityClientForDid(
  userClient: Client,
  authorityDid: DidString,
  lxm: string,
  resolveEndpoint: (
    did: string,
  ) => Promise<string | undefined> = resolvePdsEndpointForDid,
): Promise<Client> {
  assertSpacesAlphaDeploymentSafe()
  const endpoint = await resolveEndpoint(authorityDid)
  if (!endpoint) {
    throw new Error(
      `Could not resolve the Space authority PDS for ${authorityDid}`,
    )
  }
  const {token} = await userClient.call(com.atproto.server.getServiceAuth, {
    aud: authorityDid,
    lxm: lxm as `${string}.${string}.${string}`,
  })
  return createServiceAuthClient(endpoint, token, userClient.did)
}

function createServiceAuthClient(
  endpoint: string,
  token: string,
  did: DidString | undefined,
): Client {
  const agent: Agent = {
    did,
    fetchHandler: async (path, init) => {
      const url = new URL(path, endpoint)
      const headers = new Headers(init.headers)
      headers.set('authorization', `Bearer ${token}`)
      return fetch(url, {...init, headers, redirect: 'error'})
    },
  }
  return createLexClient(agent, {appLabelers: null})
}

function createDpopClient(
  endpoint: string,
  key: DpopKey,
  authorizationToken: string,
  dpopCredential: string | undefined,
  did: DidString | undefined,
): Client {
  const agent: Agent = {
    // The DPoP credential authorizes the viewer, while the repo written by a
    // Space client is still the viewer's own PDS repo. Preserve that DID at
    // the client boundary so SpacesClient.putRecord can select the writer.
    did,
    fetchHandler: async (path, init) => {
      const url = new URL(path, endpoint)
      const headers = new Headers(init.headers)
      // Delegation tokens are bearer credentials for the one-time exchange.
      // Space credentials are DPoP-bound and must use the DPoP authorization
      // scheme so the PDS routes them through spaceCredentialAuth.
      headers.set(
        'authorization',
        `${dpopCredential ? 'DPoP' : 'Bearer'} ${authorizationToken}`,
      )
      headers.set(
        'dpop',
        await createDpopProof(key, {
          method: init.method ?? 'GET',
          url: url.toString(),
          credential: dpopCredential,
        }),
      )
      return fetch(url, {...init, headers, redirect: 'error'})
    },
  }
  return createLexClient(agent, {appLabelers: null})
}

async function generateDpopKey(): Promise<DpopKey> {
  const subtle = globalThis.crypto?.subtle
  if (!subtle || !globalThis.crypto.getRandomValues) {
    throw new Error('Spaces alpha requires Web Crypto for DPoP credentials')
  }
  const pair = await subtle.generateKey(
    {name: 'ECDSA', namedCurve: 'P-256'},
    true,
    ['sign', 'verify'],
  )
  if (!('privateKey' in pair)) throw new Error('Could not generate a DPoP key')
  return {
    privateKey: pair.privateKey,
    publicJwk: await subtle.exportKey('jwk', pair.publicKey),
  }
}

async function createDpopProof(
  key: DpopKey,
  opts: {method: string; url: string; credential?: string},
): Promise<string> {
  const header = {
    alg: 'ES256',
    typ: 'dpop+jwt',
    jwk: key.publicJwk,
  }
  const payload = {
    jti: randomTokenId(),
    htm: opts.method.toUpperCase(),
    htu: normalizeUrl(opts.url),
    ...(opts.credential ? {ath: await digest(opts.credential)} : {}),
    iat: Math.floor(Date.now() / 1000),
  }
  const signingInput = `${encodeJson(header)}.${encodeJson(payload)}`
  const signature = new Uint8Array(
    await globalThis.crypto.subtle.sign(
      {name: 'ECDSA', hash: 'SHA-256'},
      key.privateKey,
      new TextEncoder().encode(signingInput),
    ),
  )
  return `${signingInput}.${base64Url(signature)}`
}

function parseSpaceAuthority(space: string): DidString {
  const validatedSpace = assertSpaceRef(space)
  const match = /^at:\/\/(did:[^/]+)\/space\//.exec(validatedSpace)
  if (!match) throw new Error(`Invalid Space URI: ${space}`)
  return assertDid(match[1])
}

function normalizeUrl(value: string): string {
  const url = new URL(value)
  return `${url.origin}${url.pathname}`
}

function encodeJson(value: unknown): string {
  return base64Url(new TextEncoder().encode(JSON.stringify(value)))
}

function randomTokenId(): string {
  const bytes = new Uint8Array(16)
  globalThis.crypto.getRandomValues(bytes)
  return base64Url(bytes)
}

async function digest(value: string): Promise<string> {
  const bytes = await globalThis.crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(value),
  )
  return base64Url(new Uint8Array(bytes))
}

function base64Url(bytes: Uint8Array): string {
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}
