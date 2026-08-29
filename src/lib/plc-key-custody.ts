import {
  formatDidKey,
  parseDidKey,
  randomBytes,
  verifySignature,
} from '@atproto/crypto'
import {type Client} from '@atproto/lex'
import * as cbor from '@ipld/dag-cbor'

import {com} from '#/lexicons'
import {type PlcOperation} from './plc-history'

export type RotationKeyStore = {
  get(keyId: string): Promise<CryptoKey | undefined>
  put(keyId: string, key: CryptoKey): Promise<void>
}

export type UserHeldRotationKey = {
  version: 1
  did: string
  keyId: string
  didKey: string
  algorithm: 'ES256'
  custody: 'non-exportable-webcrypto'
  publicJwk: JsonWebKey
  createdAt: string
}

export type UnsignedPlcOperation = Omit<PlcOperation, 'sig'>

const P256_ORDER = BigInt(
  '0xffffffff00000000ffffffffffffffffbce6faada7179e84f3b9cac2fc632551',
)

/** In-memory store used by tests and short-lived recovery sessions. */
export function createMemoryRotationKeyStore(): RotationKeyStore {
  const keys = new Map<string, CryptoKey>()
  return {
    get: keyId => Promise.resolve(keys.get(keyId)),
    put: (keyId, key) => {
      keys.set(keyId, key)
      return Promise.resolve()
    },
  }
}

/**
 * Browser-only persistent custody backed by IndexedDB's structured-clone
 * support for non-exportable CryptoKey objects. Native callers should provide
 * a platform secure-key implementation instead of serializing private keys.
 */
export function createIndexedDbRotationKeyStore(
  accountDid: string,
): RotationKeyStore {
  const databaseName = `radlib-plc-rotation:${accountDid}`
  let storePromise: Promise<KeyValueStore> | undefined
  const getStore = (): Promise<KeyValueStore> => {
    if (typeof indexedDB === 'undefined') {
      throw new Error('IndexedDB key custody is unavailable in this runtime')
    }
    storePromise ??= import('idb-keyval').then(({createStore}) =>
      createStore(databaseName, 'rotation-keys'),
    )
    return storePromise
  }
  return {
    get: async keyId => {
      const {get} = await import('idb-keyval')
      return get<CryptoKey>(keyId, await getStore())
    },
    put: async (keyId, key) => {
      const {set} = await import('idb-keyval')
      await set(keyId, key, await getStore())
    },
  }
}

/** Generate a user-held rotation key without making the private key exportable. */
export async function createUserHeldRotationKey(
  did: string,
  store: RotationKeyStore,
  cryptoApi?: Crypto,
): Promise<UserHeldRotationKey> {
  assertPlcDid(did)
  const runtimeCrypto = cryptoApi ?? globalThis.crypto
  if (!runtimeCrypto?.subtle || !runtimeCrypto.getRandomValues) {
    throw new Error('User-held PLC custody requires Web Crypto')
  }
  const pair = await runtimeCrypto.subtle.generateKey(
    {name: 'ECDSA', namedCurve: 'P-256'},
    false,
    ['sign', 'verify'],
  )
  if (!isCryptoKeyPair(pair) || pair.privateKey.extractable) {
    throw new Error('PLC rotation key was not created as non-exportable')
  }
  const publicJwk = await runtimeCrypto.subtle.exportKey('jwk', pair.publicKey)
  const didKey = formatDidKey('ES256', publicJwkToBytes(publicJwk))
  parseDidKey(didKey)
  const keyId = `plc-rotation-${base64Url(randomBytes(18))}`
  await store.put(keyId, pair.privateKey)
  return {
    version: 1,
    did,
    keyId,
    didKey,
    algorithm: 'ES256',
    custody: 'non-exportable-webcrypto',
    publicJwk: {
      kty: publicJwk.kty,
      crv: publicJwk.crv,
      x: publicJwk.x,
      y: publicJwk.y,
    },
    createdAt: new Date().toISOString(),
  }
}

/**
 * Sign an already-authorized PLC operation. The caller must prove that this
 * key is currently in the DID document's rotation-key set; key generation
 * alone never grants recovery authority.
 */
export async function signPlcOperationWithUserHeldKey(
  handle: UserHeldRotationKey,
  unsignedOperation: UnsignedPlcOperation,
  authorizedRotationKeys: readonly string[],
  store: RotationKeyStore,
  cryptoApi?: Crypto,
): Promise<PlcOperation> {
  assertPlcDid(handle.did)
  if (!authorizedRotationKeys.includes(handle.didKey)) {
    throw new Error('User-held PLC key is not an authorized rotation key')
  }
  if ('sig' in (unsignedOperation as Record<string, unknown>)) {
    throw new Error('PLC operation must be unsigned before custody signing')
  }
  const privateKey = await store.get(handle.keyId)
  if (!privateKey) throw new Error('User-held PLC private key is unavailable')
  const runtimeCrypto = cryptoApi ?? globalThis.crypto
  if (!runtimeCrypto?.subtle) {
    throw new Error('User-held PLC custody requires Web Crypto')
  }
  const signature = new Uint8Array(
    await runtimeCrypto.subtle.sign(
      {name: 'ECDSA', hash: 'SHA-256'},
      privateKey,
      toArrayBuffer(cbor.encode(unsignedOperation)),
    ),
  )
  return {
    ...unsignedOperation,
    sig: base64Url(toLowSCompactSignature(signature)),
  }
}

export async function verifyUserHeldPlcSignature(
  handle: UserHeldRotationKey,
  unsignedOperation: UnsignedPlcOperation,
  signature: string,
): Promise<boolean> {
  if (handle.algorithm !== 'ES256') return false
  if ('sig' in (unsignedOperation as Record<string, unknown>)) return false
  return verifySignature(
    handle.didKey,
    cbor.encode(unsignedOperation),
    fromBase64Url(signature),
  )
}

/** Submit a signed operation through the account PDS; server rejection is preserved. */
export async function submitUserHeldPlcOperation(
  pdsClient: Client,
  operation: PlcOperation,
): Promise<unknown> {
  return pdsClient.call(com.atproto.identity.submitPlcOperation, {
    operation: operation,
  })
}

function publicJwkToBytes(jwk: JsonWebKey): Uint8Array {
  if (
    jwk.kty !== 'EC' ||
    jwk.crv !== 'P-256' ||
    typeof jwk.x !== 'string' ||
    typeof jwk.y !== 'string' ||
    jwk.d !== undefined
  ) {
    throw new Error('PLC custody public key is not a P-256 public JWK')
  }
  const x = fromBase64Url(jwk.x)
  const y = fromBase64Url(jwk.y)
  if (x.length !== 32 || y.length !== 32) {
    throw new Error('PLC custody public key coordinates are invalid')
  }
  return new Uint8Array([4, ...x, ...y])
}

function toLowSCompactSignature(signature: Uint8Array): Uint8Array {
  const compact = signature.length === 64 ? signature : derToCompact(signature)
  const r = compact.slice(0, 32)
  const s = bytesToBigInt(compact.slice(32))
  const lowS = s > P256_ORDER / 2n ? P256_ORDER - s : s
  return new Uint8Array([...r, ...bigIntToBytes(lowS, 32)])
}

function derToCompact(signature: Uint8Array): Uint8Array {
  if (signature[0] !== 0x30)
    throw new Error('ECDSA signature encoding is invalid')
  let offset = 1
  const sequenceLength = readDerLength(signature, offset)
  offset += sequenceLength.bytes
  if (offset + sequenceLength.value !== signature.length) {
    throw new Error('ECDSA signature length is invalid')
  }
  const r = readDerInteger(signature, offset)
  offset = r.nextOffset
  const s = readDerInteger(signature, offset)
  if (s.nextOffset !== signature.length) {
    throw new Error('ECDSA signature has trailing data')
  }
  return new Uint8Array([
    ...leftPadInteger(r.value),
    ...leftPadInteger(s.value),
  ])
}

function readDerInteger(
  bytes: Uint8Array,
  offset: number,
): {value: Uint8Array; nextOffset: number} {
  if (bytes[offset] !== 0x02) throw new Error('ECDSA integer is missing')
  const length = readDerLength(bytes, offset + 1)
  const start = offset + 1 + length.bytes
  const end = start + length.value
  if (end > bytes.length || length.value === 0) {
    throw new Error('ECDSA integer length is invalid')
  }
  return {value: bytes.slice(start, end), nextOffset: end}
}

function leftPadInteger(value: Uint8Array): Uint8Array {
  let start = 0
  while (start < value.length - 1 && value[start] === 0) start += 1
  const trimmed = value.slice(start)
  if (trimmed.length > 32) throw new Error('ECDSA integer is too large')
  return new Uint8Array([...new Uint8Array(32 - trimmed.length), ...trimmed])
}

function readDerLength(
  bytes: Uint8Array,
  offset: number,
): {value: number; bytes: number} {
  const first = bytes[offset]
  if (first === undefined) throw new Error('DER length is missing')
  if (first < 0x80) return {value: first, bytes: 1}
  const count = first & 0x7f
  if (count < 1 || count > 2 || offset + count >= bytes.length) {
    throw new Error('DER length is invalid')
  }
  let value = 0
  for (let index = 0; index < count; index += 1) {
    value = value * 256 + bytes[offset + 1 + index]
  }
  return {value, bytes: count + 1}
}

function bytesToBigInt(bytes: Uint8Array): bigint {
  return BigInt(
    `0x${Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('')}`,
  )
}

function bigIntToBytes(value: bigint, length: number): Uint8Array {
  const hex = value.toString(16).padStart(length * 2, '0')
  if (hex.length > length * 2) throw new Error('ECDSA integer is too large')
  return new Uint8Array(
    hex.match(/.{2}/g)?.map(byte => Number.parseInt(byte, 16)) ?? [],
  )
}

function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  const buffer = new ArrayBuffer(bytes.byteLength)
  new Uint8Array(buffer).set(bytes)
  return buffer
}

function base64Url(bytes: Uint8Array): string {
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function fromBase64Url(value: string): Uint8Array {
  if (!/^[A-Za-z0-9_-]+$/.test(value)) {
    throw new Error('Base64url value is invalid')
  }
  const normalized = value.replace(/-/g, '+').replace(/_/g, '/')
  const padded = normalized.padEnd(
    normalized.length + ((4 - (normalized.length % 4)) % 4),
    '=',
  )
  const binary = atob(padded)
  return Uint8Array.from(binary, character => character.charCodeAt(0))
}

function assertPlcDid(did: string): void {
  if (!/^did:plc:[a-z2-7]{24}$/.test(did)) {
    throw new Error('User-held rotation custody requires a did:plc identity')
  }
}

function isCryptoKeyPair(value: unknown): value is CryptoKeyPair {
  return (
    typeof value === 'object' &&
    value !== null &&
    'privateKey' in value &&
    'publicKey' in value
  )
}

type KeyValueStore = <T>(
  txMode: IDBTransactionMode,
  callback: (store: IDBObjectStore) => T | PromiseLike<T>,
) => Promise<T>
