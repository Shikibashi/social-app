import {l} from '@atproto/lex'

const record = l.lexMap()
const recordResult = l.jsonPayload({
  uri: l.string({format: 'at-uri'}),
  cid: l.string({format: 'cid'}),
  validationStatus: l.optional(l.string()),
})

export const getDelegationToken = l.query(
  'com.atproto.space.getDelegationToken',
  l.params({space: l.string()}),
  l.jsonPayload({token: l.string()}),
)

export const getSpaceCredential = l.procedure(
  'com.atproto.space.getSpaceCredential',
  l.params(),
  l.jsonPayload({
    space: l.string(),
    clientAttestation: l.optional(l.string()),
  }),
  l.jsonPayload({credential: l.string()}),
)

export const createRecord = l.procedure(
  'com.atproto.space.createRecord',
  l.params(),
  l.jsonPayload({
    space: l.string(),
    repo: l.string({format: 'did'}),
    collection: l.string({format: 'nsid'}),
    rkey: l.optional(l.string({format: 'record-key', maxLength: 512})),
    record,
  }),
  recordResult,
)

export const putRecord = l.procedure(
  'com.atproto.space.putRecord',
  l.params(),
  l.jsonPayload({
    space: l.string(),
    repo: l.string({format: 'did'}),
    collection: l.string({format: 'nsid'}),
    rkey: l.string({format: 'record-key', maxLength: 512}),
    record,
  }),
  recordResult,
)

export const deleteRecord = l.procedure(
  'com.atproto.space.deleteRecord',
  l.params(),
  l.jsonPayload({
    space: l.string(),
    repo: l.string({format: 'did'}),
    collection: l.string({format: 'nsid'}),
    rkey: l.string({format: 'record-key'}),
  }),
  l.jsonPayload({}),
)

export const getRecord = l.query(
  'com.atproto.space.getRecord',
  l.params({
    space: l.string(),
    repo: l.string({format: 'did'}),
    collection: l.string({format: 'nsid'}),
    rkey: l.string({format: 'record-key'}),
  }),
  l.jsonPayload({
    uri: l.string({format: 'at-uri'}),
    cid: l.string({format: 'cid'}),
    value: l.lexMap(),
  }),
)

export const listRecords = l.query(
  'com.atproto.space.listRecords',
  l.params({
    space: l.string(),
    repo: l.string({format: 'did'}),
    collection: l.optional(l.string({format: 'nsid'})),
    limit: l.optional(l.integer({minimum: 1, maximum: 1000})),
    cursor: l.optional(l.string()),
    reverse: l.optional(l.boolean()),
    excludeValues: l.optional(l.boolean()),
  }),
  l.jsonPayload({
    cursor: l.optional(l.string()),
    records: l.array(
      l.object({
        collection: l.string({format: 'nsid'}),
        rkey: l.string({format: 'record-key'}),
        cid: l.string({format: 'cid'}),
        value: l.optional(l.lexMap()),
      }),
    ),
  }),
)

export const getBlob = l.query(
  'com.atproto.space.getBlob',
  l.params({
    space: l.string(),
    repo: l.string({format: 'did'}),
    cid: l.string({format: 'cid'}),
  }),
  l.payload('*/*', undefined),
)

export const listRepos = l.query(
  'com.atproto.space.listRepos',
  l.params({
    space: l.string(),
    limit: l.optional(l.integer({minimum: 1, maximum: 1000})),
    cursor: l.optional(l.string()),
  }),
  l.jsonPayload({
    cursor: l.optional(l.string()),
    repos: l.array(
      l.object({
        did: l.string({format: 'did'}),
        rev: l.string(),
        hash: l.bytes(),
      }),
    ),
  }),
)

export const toSpaceRpc = {
  getDelegationToken,
  getSpaceCredential,
  createRecord,
  putRecord,
  deleteRecord,
  getRecord,
  listRecords,
  getBlob,
  listRepos,
} as const
