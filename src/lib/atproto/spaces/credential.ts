import {type Agent, type Client} from '@atproto/lex'
import {type DidString} from '@atproto/syntax'

import {createLexClient} from '#/lib/lexClient'
import {resolvePdsEndpointForDid} from '#/state/session/pds-resolution'
import {SpacesClient} from './client'
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
export async function createSpaceCredentialClient(
  userClient: Client,
  space: string,
  resolveEndpoint: (
    did: string,
  ) => Promise<string | undefined> = resolvePdsEndpointForDid,
): Promise<SpacesClient> {
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
  )
  const credential = await credentialClient.call(
    toSpaceRpc.getSpaceCredential,
    {
      space,
    },
  )

  return new SpacesClient(
    createDpopClient(
      authorityEndpoint,
      key,
      credential.credential,
      credential.credential,
    ),
  )
}

function createDpopClient(
  endpoint: string,
  key: DpopKey,
  authorizationToken: string,
  dpopCredential: string | undefined,
): Client {
  const agent: Agent = {
    did: undefined,
    fetchHandler: async (path, init) => {
      const url = new URL(path, endpoint)
      const headers = new Headers(init.headers)
      headers.set('authorization', `Bearer ${authorizationToken}`)
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
  const match = /^at:\/\/(did:[^/]+)\/space\//.exec(space)
  if (!match) throw new Error(`Invalid Space URI: ${space}`)
  return match[1] as DidString
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
