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
  }): Promise<SpaceRecordPage> {
    return this.client.call(toSpaceRpc.listRecords, {
      space: input.space,
      repo: (input.repo ?? requireDid(this.did)) as DidString,
      ...(input.collection ? {collection: input.collection as NsidString} : {}),
      ...(input.limit ? {limit: input.limit} : {}),
      ...(input.cursor ? {cursor: input.cursor} : {}),
      ...(input.reverse !== undefined ? {reverse: input.reverse} : {}),
    })
  }

  getBlob(input: {space: string; repo?: string; cid: string}) {
    return this.client.call(toSpaceRpc.getBlob, {
      ...input,
      repo: (input.repo ?? requireDid(this.did)) as DidString,
    })
  }

  listRepos(space: string) {
    return this.client.call(toSpaceRpc.listRepos, {space})
  }
}

export function spacesClient(client: Client): SpacesClient {
  return new SpacesClient(client)
}

function requireDid(did: DidString | undefined): DidString {
  if (!did) throw new Error('A signed-in DID is required for a Space request')
  return did
}
