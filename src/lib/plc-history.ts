import {
  parseDidKey,
  sha256 as atprotoSha256,
  verifySignature,
} from '@atproto/crypto'
import * as cbor from '@ipld/dag-cbor'
import {CID} from 'multiformats/cid'
import {create as createMultihash} from 'multiformats/hashes/digest'

export type PlcService = {
  type: string
  endpoint: string
}

export type PlcOperation = {
  type: 'plc_operation'
  prev: string | null
  rotationKeys: string[]
  verificationMethods: Record<string, string>
  alsoKnownAs: string[]
  services: Record<string, PlcService>
  sig: string
}

export type PlcTombstone = {
  type: 'plc_tombstone'
  prev: string
  sig: string
}

export type PlcHistoryEntry = PlcOperation | PlcTombstone

export type PlcDocumentData = {
  did: string
  verificationMethods: Record<string, string>
  rotationKeys: string[]
  alsoKnownAs: string[]
  services: Record<string, PlcService>
}

export type PlcHistoryVerification = {
  did: string
  status: 'verified' | 'tombstoned' | 'invalid' | 'empty'
  verifiedOperations: number
  headCid?: string
  document?: PlcDocumentData
  invalidAt?: number
  error?: string
}

/**
 * Validate a canonical PLC audit log without trusting the resolver that
 * delivered it. The verification follows the PLC operation chain: genesis DID
 * hash, previous CID, rotation-key signatures, canonical DAG-CBOR, and the
 * terminal tombstone rule.
 */
export async function verifyPlcHistory(
  did: string,
  history: readonly unknown[],
): Promise<PlcHistoryVerification> {
  if (history.length === 0) {
    return {did, status: 'empty', verifiedOperations: 0}
  }
  if (!isPlcDid(did)) {
    return invalidHistory(did, 0, 'DID is not a valid did:plc identifier')
  }

  let previous: PlcHistoryEntry | undefined
  let document: PlcDocumentData | undefined
  let headCid: string | undefined

  for (const [index, rawOperation] of history.entries()) {
    try {
      const operation = validateOperationShape(rawOperation)
      if (operation.type === 'plc_operation') {
        validateKeys(operation)
      }
      const expectedPrev = previous ? await operationCid(previous) : undefined
      if (operation.type === 'plc_operation') {
        if (index === 0) {
          if (operation.prev !== null) {
            return invalidHistory(
              did,
              index,
              'Genesis operation must have null prev',
            )
          }
          const expectedDid = await didForCreateOperation(operation)
          if (!expectedDid.startsWith(did)) {
            return invalidHistory(
              did,
              index,
              'Genesis operation does not derive the DID',
            )
          }
        } else if (operation.prev !== expectedPrev) {
          return invalidHistory(
            did,
            index,
            'Operation prev does not match the prior CID',
          )
        }

        const allowedKeys = document?.rotationKeys ?? operation.rotationKeys
        if (!(await verifiesWithAnyKey(allowedKeys, operation))) {
          return invalidHistory(
            did,
            index,
            'Operation signature is not valid for the active rotation keys',
          )
        }
        document = operationToDocument(did, operation)
      } else {
        if (index === 0 || operation.prev !== expectedPrev) {
          return invalidHistory(
            did,
            index,
            'Tombstone prev does not match the prior CID',
          )
        }
        const allowedKeys = document?.rotationKeys ?? []
        if (!(await verifiesWithAnyKey(allowedKeys, operation))) {
          return invalidHistory(
            did,
            index,
            'Tombstone signature is not valid for the active rotation keys',
          )
        }
        if (index !== history.length - 1) {
          return invalidHistory(
            did,
            index,
            'A tombstone must terminate the history',
          )
        }
        document = undefined
      }
      headCid = await operationCid(operation)
      previous = operation
    } catch (error) {
      return invalidHistory(did, index, safeErrorMessage(error))
    }
  }

  return {
    did,
    status: document ? 'verified' : 'tombstoned',
    verifiedOperations: history.length,
    headCid,
    document,
  }
}

export async function operationCid(
  operation: PlcHistoryEntry,
): Promise<string> {
  // Use the ATProto crypto primitive so this boundary remains portable to
  // React Native and does not depend on Node's `crypto` module.
  const digest = createMultihash(
    0x12,
    await atprotoSha256(cbor.encode(operation)),
  )
  return CID.createV1(cbor.code, digest).toString()
}

export async function didForCreateOperation(
  operation: PlcOperation,
): Promise<string> {
  const digest = await atprotoSha256(cbor.encode(operation))
  return `did:plc:${base32Encode(digest).slice(0, 24)}`
}

function operationToDocument(
  did: string,
  operation: PlcOperation,
): PlcDocumentData {
  return {
    did,
    verificationMethods: {...operation.verificationMethods},
    rotationKeys: [...operation.rotationKeys],
    alsoKnownAs: [...operation.alsoKnownAs],
    services: {...operation.services},
  }
}

function validateKeys(operation: PlcOperation): void {
  if (
    operation.rotationKeys.length < 1 ||
    operation.rotationKeys.length > 5 ||
    Object.keys(operation.verificationMethods).length < 1
  ) {
    throw new Error('PLC operation has an invalid key set')
  }
  for (const key of [
    ...operation.rotationKeys,
    ...Object.values(operation.verificationMethods),
  ]) {
    parseDidKey(key)
  }
}

async function verifiesWithAnyKey(
  allowedKeys: readonly string[],
  operation: PlcHistoryEntry,
): Promise<boolean> {
  const {sig, ...unsigned} = operation
  const data = cbor.encode(unsigned)
  const signature = decodeBase64Url(sig)
  for (const key of allowedKeys) {
    try {
      if (await verifySignature(key, data, signature)) return true
    } catch {
      // A malformed candidate key is not allowed to make another candidate authoritative.
    }
  }
  return false
}

function validateOperationShape(value: unknown): PlcHistoryEntry {
  if (!isRecord(value)) {
    throw new Error('PLC history entry is not an object')
  }
  const operation = value
  if (operation.type === 'plc_operation') {
    if (
      !Array.isArray(operation.rotationKeys) ||
      operation.rotationKeys.some(item => typeof item !== 'string') ||
      !isStringRecord(operation.verificationMethods) ||
      !Array.isArray(operation.alsoKnownAs) ||
      operation.alsoKnownAs.some(item => typeof item !== 'string') ||
      !isServiceRecord(operation.services) ||
      typeof operation.sig !== 'string' ||
      (operation.prev !== null && typeof operation.prev !== 'string')
    ) {
      throw new Error('PLC operation shape is invalid')
    }
    return operation as unknown as PlcOperation
  } else if (
    operation.type !== 'plc_tombstone' ||
    typeof operation.prev !== 'string' ||
    typeof operation.sig !== 'string'
  ) {
    throw new Error('PLC history entry shape is invalid')
  }
  return operation as unknown as PlcTombstone
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isStringRecord(value: unknown): value is Record<string, string> {
  return (
    typeof value === 'object' &&
    value !== null &&
    !Array.isArray(value) &&
    Object.values(value).every(item => typeof item === 'string')
  )
}

function isServiceRecord(value: unknown): value is Record<string, PlcService> {
  return (
    isRecord(value) &&
    Object.values(value).every(
      item =>
        isRecord(item) &&
        typeof item.type === 'string' &&
        typeof item.endpoint === 'string',
    )
  )
}

function invalidHistory(
  did: string,
  index: number,
  error: string,
): PlcHistoryVerification {
  return {
    did,
    status: 'invalid',
    verifiedOperations: index,
    invalidAt: index,
    error,
  }
}

function isPlcDid(did: string): boolean {
  return /^did:plc:[a-z2-7]{24}$/.test(did)
}

function decodeBase64Url(value: string): Uint8Array {
  const normalized = value.replace(/-/g, '+').replace(/_/g, '/')
  if (
    !/^[A-Za-z0-9+/]*={0,2}$/.test(normalized) ||
    normalized.length % 4 === 1
  ) {
    throw new Error('PLC signature is not valid base64url')
  }
  const padded = normalized.padEnd(
    normalized.length + ((4 - (normalized.length % 4)) % 4),
    '=',
  )
  const bytes: number[] = []
  for (let index = 0; index < padded.length; index += 4) {
    const a = base64Value(padded[index])
    const b = base64Value(padded[index + 1])
    const c = padded[index + 2] === '=' ? 0 : base64Value(padded[index + 2])
    const d = padded[index + 3] === '=' ? 0 : base64Value(padded[index + 3])
    bytes.push((a << 2) | (b >> 4))
    if (padded[index + 2] !== '=') bytes.push(((b & 15) << 4) | (c >> 2))
    if (padded[index + 3] !== '=') bytes.push(((c & 3) << 6) | d)
  }
  return new Uint8Array(bytes)
}

function base64Value(value: string | undefined): number {
  if (!value) throw new Error('PLC signature is truncated')
  const index =
    'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'.indexOf(
      value,
    )
  if (index < 0) throw new Error('PLC signature contains an invalid character')
  return index
}

function base32Encode(bytes: Uint8Array): string {
  const alphabet = 'abcdefghijklmnopqrstuvwxyz234567'
  let output = ''
  let buffer = 0
  let bits = 0
  for (const byte of bytes) {
    buffer = (buffer << 8) | byte
    bits += 8
    while (bits >= 5) {
      output += alphabet[(buffer >>> (bits - 5)) & 31]
      bits -= 5
    }
  }
  if (bits > 0) output += alphabet[(buffer << (5 - bits)) & 31]
  return output
}

function safeErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}
