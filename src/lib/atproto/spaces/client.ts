import {type Client, type LexMap} from '@atproto/lex'
import {
  type DidString,
  type NsidString,
  type RecordKeyString,
} from '@atproto/syntax'

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

/**
 * Thin product-facing wrapper around the alpha com.atproto.space methods.
 * Protected-account/community policy remains in org.radlib.private; this
 * class owns only record/blob transport and accepts either an OAuth-backed
 * PDS client or a DPoP-bound Space client.
 */
export class SpacesClient {
  constructor(private readonly client: Client) {}

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
    const repo = requireDid(this.did)
    return this.client.call(toSpaceRpc.createRecord, {
      ...input,
      repo,
      collection: input.collection as NsidString,
    })
  }

  deleteRecord(input: {space: string; collection: string; rkey: string}) {
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
    return this.client.call(toSpaceRpc.listBlobs, {
      space: input.space,
      repo: (input.repo ?? requireDid(this.did)) as DidString,
      ...(input.since ? {since: input.since} : {}),
      ...(input.limit ? {limit: input.limit} : {}),
      ...(input.cursor ? {cursor: input.cursor} : {}),
    })
  }

  listRepos(input: {space: string; limit?: number; cursor?: string}) {
    return this.client.call(toSpaceRpc.listRepos, {
      space: input.space,
      ...(input.limit ? {limit: input.limit} : {}),
      ...(input.cursor ? {cursor: input.cursor} : {}),
    })
  }

  getRepo(input: {space: string; repo?: string; excludeValues?: boolean}) {
    return this.client.call(toSpaceRpc.getRepo, {
      space: input.space,
      repo: (input.repo ?? requireDid(this.did)) as DidString,
      ...(input.excludeValues !== undefined
        ? {excludeValues: input.excludeValues}
        : {}),
    })
  }

  getLatestCommit(input: {space: string; repo?: string}) {
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
        ops: page.ops as unknown as SpaceRepoOp[],
      }))
  }

  registerNotify(input: {space: string; service: string}) {
    return this.client.call(toSpaceRpc.registerNotify, input)
  }

  unregisterNotify(input: {space: string; service: string}) {
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
