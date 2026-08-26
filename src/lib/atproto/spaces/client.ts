import {type Client, type LexMap} from '@atproto/lex'
import {
  isValidDid,
  isValidNsid,
  isValidRecordKey,
  type DidString,
  type NsidString,
  type RecordKeyString,
} from '@atproto/syntax'
import {CID} from 'multiformats/cid'

import {assertSpacesAlphaDeploymentSafe} from '#/env'
import {toSpaceRpc} from './rpc'

export type SpaceRecord = {
  collection: NsidString
  rkey: RecordKeyString
  cid: string
  value?: LexMap
}

export type SpaceRecordPage = {
  records: SpaceRecord[]
  cursor?: string
}

export type SpaceBlobPage = {
  cids: string[]
  cursor?: string
}

export type SpaceRepoOp = {
  rev: string
  collection: NsidString
  rkey: RecordKeyString
  cid: string | null
  prev: string | null
  value?: LexMap
}

export type SpaceRepoOpsPage = {
  ops: SpaceRepoOp[]
  commit?: LexMap
  cursor?: string
}

const SPACE_REF_RE = /^at:\/\/([^/]+)\/space\/([^/]+)\/([^/?#]+)$/

/** Validate alpha Space identifiers at the product boundary. */
export function assertSpaceRef(value: string): string {
  const match = value.match(SPACE_REF_RE)
  if (
    !match ||
    !isValidDid(match[1]) ||
    !isValidNsid(match[2]) ||
    !isValidRecordKey(match[3])
  ) {
    throw new Error(`Invalid Space reference: ${value}`)
  }
  return value
}

export function assertDid(value: string): DidString {
  if (!isValidDid(value)) throw new Error(`Invalid DID: ${value}`)
  return value as DidString
}

export function assertNsid(value: string): NsidString {
  if (!isValidNsid(value)) throw new Error(`Invalid NSID: ${value}`)
  return value as NsidString
}

function assertRecordKey(value: string): RecordKeyString {
  if (!isValidRecordKey(value)) throw new Error(`Invalid record key: ${value}`)
  return value as RecordKeyString
}

function assertSpaceOp(value: unknown): SpaceRepoOp {
  if (!value || typeof value !== 'object')
    throw new Error('Invalid Space repo operation')
  const op = value as Record<string, unknown>
  if (
    typeof op.rev !== 'string' ||
    typeof op.collection !== 'string' ||
    typeof op.rkey !== 'string' ||
    (op.cid !== null && typeof op.cid !== 'string') ||
    (op.prev !== null && typeof op.prev !== 'string')
  ) {
    throw new Error('Invalid Space repo operation shape')
  }
  return {
    rev: op.rev,
    collection: assertNsid(op.collection),
    rkey: assertRecordKey(op.rkey),
    cid: op.cid,
    prev: op.prev,
    ...(op.value && typeof op.value === 'object'
      ? {value: op.value as LexMap}
      : {}),
  }
}

/**
 * Thin product-facing wrapper around the alpha com.atproto.space methods.
 * Protected-account/community policy remains in us.edriffles.radlib.private; this
 * class owns only record/blob transport and accepts either an OAuth-backed
 * PDS client or a DPoP-bound Space client.
 */
export class SpacesClient {
  constructor(private readonly client: Client) {
    assertSpacesAlphaDeploymentSafe()
  }

  get did(): DidString | undefined {
    return this.client.did
  }

  putRecord(input: {
    space: string
    collection: string
    rkey: string
    record: LexMap
    validate?: boolean
  }) {
    assertSpaceRef(input.space)
    assertNsid(input.collection)
    assertRecordKey(input.rkey)
    const repo = requireDid(this.did)
    return this.client.call(toSpaceRpc.putRecord, {
      ...input,
      repo,
      collection: input.collection as NsidString,
    })
  }

  createRecord(input: {
    space: string
    collection: string
    rkey?: string
    record: LexMap
    validate?: boolean
  }) {
    assertSpaceRef(input.space)
    assertNsid(input.collection)
    if (input.rkey) assertRecordKey(input.rkey)
    const repo = requireDid(this.did)
    return this.client.call(toSpaceRpc.createRecord, {
      ...input,
      repo,
      collection: input.collection as NsidString,
    })
  }

  deleteRecord(input: {space: string; collection: string; rkey: string}) {
    assertSpaceRef(input.space)
    assertNsid(input.collection)
    assertRecordKey(input.rkey)
    const repo = requireDid(this.did)
    return this.client.call(toSpaceRpc.deleteRecord, {
      ...input,
      repo,
      collection: input.collection as NsidString,
    })
  }

  getRecord(input: {
    space: string
    repo?: string
    collection: string
    rkey: string
  }) {
    assertSpaceRef(input.space)
    if (input.repo) assertDid(input.repo)
    assertNsid(input.collection)
    assertRecordKey(input.rkey)
    return this.client.call(toSpaceRpc.getRecord, {
      ...input,
      repo: (input.repo ?? requireDid(this.did)) as DidString,
      collection: input.collection as NsidString,
    })
  }

  listRecords(input: {
    space: string
    repo?: string
    collection?: string
    limit?: number
    cursor?: string
    reverse?: boolean
    excludeValues?: boolean
  }): Promise<SpaceRecordPage> {
    assertSpaceRef(input.space)
    if (input.repo) assertDid(input.repo)
    if (input.collection) assertNsid(input.collection)
    return this.client.call(toSpaceRpc.listRecords, {
      space: input.space,
      repo: (input.repo ?? requireDid(this.did)) as DidString,
      ...(input.collection ? {collection: input.collection as NsidString} : {}),
      ...(input.limit ? {limit: input.limit} : {}),
      ...(input.cursor ? {cursor: input.cursor} : {}),
      ...(input.reverse !== undefined ? {reverse: input.reverse} : {}),
      ...(input.excludeValues !== undefined
        ? {excludeValues: input.excludeValues}
        : {}),
    })
  }

  getBlob(input: {space: string; repo?: string; cid: string}) {
    assertSpaceRef(input.space)
    if (input.repo) assertDid(input.repo)
    assertCid(input.cid)
    return this.client.call(toSpaceRpc.getBlob, {
      ...input,
      repo: (input.repo ?? requireDid(this.did)) as DidString,
    })
  }

  listBlobs(input: {
    space: string
    repo?: string
    since?: string
    limit?: number
    cursor?: string
  }): Promise<SpaceBlobPage> {
    assertSpaceRef(input.space)
    if (input.repo) assertDid(input.repo)
    return this.client.call(toSpaceRpc.listBlobs, {
      space: input.space,
      repo: (input.repo ?? requireDid(this.did)) as DidString,
      ...(input.since ? {since: input.since} : {}),
      ...(input.limit ? {limit: input.limit} : {}),
      ...(input.cursor ? {cursor: input.cursor} : {}),
    })
  }

  listRepos(input: {space: string; limit?: number; cursor?: string}) {
    assertSpaceRef(input.space)
    return this.client.call(toSpaceRpc.listRepos, {
      space: input.space,
      ...(input.limit ? {limit: input.limit} : {}),
      ...(input.cursor ? {cursor: input.cursor} : {}),
    })
  }

  getRepo(input: {space: string; repo?: string; excludeValues?: boolean}) {
    assertSpaceRef(input.space)
    if (input.repo) assertDid(input.repo)
    return this.client.call(toSpaceRpc.getRepo, {
      space: input.space,
      repo: (input.repo ?? requireDid(this.did)) as DidString,
      ...(input.excludeValues !== undefined
        ? {excludeValues: input.excludeValues}
        : {}),
    })
  }

  getLatestCommit(input: {space: string; repo?: string}) {
    assertSpaceRef(input.space)
    if (input.repo) assertDid(input.repo)
    return this.client.call(toSpaceRpc.getLatestCommit, {
      space: input.space,
      repo: (input.repo ?? requireDid(this.did)) as DidString,
    })
  }

  listRepoOps(input: {
    space: string
    repo?: string
    since?: string
    limit?: number
    cursor?: string
    excludeValues?: boolean
  }): Promise<SpaceRepoOpsPage> {
    assertSpaceRef(input.space)
    if (input.repo) assertDid(input.repo)
    return this.client
      .call(toSpaceRpc.listRepoOps, {
        space: input.space,
        repo: (input.repo ?? requireDid(this.did)) as DidString,
        ...(input.since ? {since: input.since} : {}),
        ...(input.limit ? {limit: input.limit} : {}),
        ...(input.cursor ? {cursor: input.cursor} : {}),
        ...(input.excludeValues !== undefined
          ? {excludeValues: input.excludeValues}
          : {}),
      })
      .then(page => ({
        ...page,
        // The alpha operation entry contains required nullable fields, which
        // the pinned client lex runtime cannot express without its newer
        // generated nullable helper. Keep the wire descriptor permissive and
        // expose the documented shape at this wrapper boundary.
        ops: page.ops.map(assertSpaceOp),
      }))
  }

  registerNotify(input: {space: string; service: string}) {
    assertSpaceRef(input.space)
    assertDid(input.service)
    return this.client.call(toSpaceRpc.registerNotify, input)
  }

  unregisterNotify(input: {space: string; service: string}) {
    assertSpaceRef(input.space)
    assertDid(input.service)
    return this.client.call(toSpaceRpc.unregisterNotify, input)
  }

  listSpaces(
    input: {
      type?: NsidString
      did?: DidString
      limit?: number
      cursor?: string
    } = {},
  ) {
    if (input.type !== undefined) assertNsid(input.type)
    if (input.did !== undefined) assertDid(input.did)
    return this.client.call(toSpaceRpc.listSpaces, {
      ...(input.type ? {type: input.type} : {}),
      ...(input.did ? {did: input.did} : {}),
      ...(input.limit ? {limit: input.limit} : {}),
      ...(input.cursor ? {cursor: input.cursor} : {}),
    })
  }
}

export function spacesClient(client: Client): SpacesClient {
  return new SpacesClient(client)
}

function requireDid(did: DidString | undefined): DidString {
  if (!did) throw new Error('A signed-in DID is required for a Space request')
  return did
}

function assertCid(value: string): string {
  if (!value) throw new Error('A blob CID is required')
  try {
    CID.parse(value)
  } catch {
    throw new Error(`Invalid blob CID: ${value}`)
  }
  return value
}
