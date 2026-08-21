import {l} from '@atproto/lex'

const record = l.lexMap()
// Permissioned record URIs use the Spaces alpha path shape:
// at://{spaceDid}/space/{spaceType}/{skey}/{authorDid}/{collection}/{rkey}
// The pinned social-app syntax runtime only recognizes public at:// URIs, so
// do not apply its narrower at-uri validator to a response from a Space.
const spaceRecordUri = l.string()
const recordResult = l.jsonPayload({
  uri: spaceRecordUri,
  cid: l.string({format: 'cid'}),
  validationStatus: l.optional(l.string()),
})
// The pinned social-app lex runtime predates the `space-ref` format name used
// by the alpha branch's generated PDS lexicons. Keep this as a string at the
// client boundary; the PDS remains authoritative for Space URI validation.
const spaceRef = l.string()
const repoDid = l.string({format: 'did'})
const collection = l.string({format: 'nsid'})
const recordKey = l.string({format: 'record-key'})
const cid = l.string({format: 'cid'})
const tid = l.string({format: 'tid'})

export const getDelegationToken = l.query(
  'com.atproto.space.getDelegationToken',
  l.params({space: spaceRef}),
  l.jsonPayload({token: l.string()}),
)

export const getSpaceCredential = l.procedure(
  'com.atproto.space.getSpaceCredential',
  l.params(),
  l.jsonPayload({
    space: spaceRef,
    clientAttestation: l.optional(l.string()),
  }),
  l.jsonPayload({credential: l.string()}),
)

export const createRecord = l.procedure(
  'com.atproto.space.createRecord',
  l.params(),
  l.jsonPayload({
    space: spaceRef,
    repo: repoDid,
    collection,
    rkey: l.optional(l.string({format: 'record-key', maxLength: 512})),
    validate: l.optional(l.boolean()),
    record,
  }),
  recordResult,
)

export const putRecord = l.procedure(
  'com.atproto.space.putRecord',
  l.params(),
  l.jsonPayload({
    space: spaceRef,
    repo: repoDid,
    collection,
    rkey: l.string({format: 'record-key', maxLength: 512}),
    validate: l.optional(l.boolean()),
    record,
  }),
  recordResult,
)

export const deleteRecord = l.procedure(
  'com.atproto.space.deleteRecord',
  l.params(),
  l.jsonPayload({
    space: spaceRef,
    repo: repoDid,
    collection,
    rkey: recordKey,
  }),
  l.jsonPayload({}),
)

export const getRecord = l.query(
  'com.atproto.space.getRecord',
  l.params({
    space: spaceRef,
    repo: repoDid,
    collection,
    rkey: recordKey,
  }),
  l.jsonPayload({
    uri: spaceRecordUri,
    cid: l.string({format: 'cid'}),
    value: l.lexMap(),
  }),
)

export const listRecords = l.query(
  'com.atproto.space.listRecords',
  l.params({
    space: spaceRef,
    repo: repoDid,
    collection: l.optional(collection),
    limit: l.optional(l.integer({minimum: 1, maximum: 1000})),
    cursor: l.optional(l.string()),
    reverse: l.optional(l.boolean()),
    excludeValues: l.optional(l.boolean()),
  }),
  l.jsonPayload({
    cursor: l.optional(l.string()),
    records: l.array(
      l.object({
        collection,
        rkey: recordKey,
        cid,
        value: l.optional(l.lexMap()),
      }),
    ),
  }),
)

export const getBlob = l.query(
  'com.atproto.space.getBlob',
  l.params({
    space: spaceRef,
    repo: repoDid,
    cid,
  }),
  l.payload('*/*', undefined),
)

export const listBlobs = l.query(
  'com.atproto.space.listBlobs',
  l.params({
    space: spaceRef,
    repo: repoDid,
    since: l.optional(tid),
    limit: l.optional(l.integer({minimum: 1, maximum: 1000})),
    cursor: l.optional(l.string()),
  }),
  l.jsonPayload({
    cursor: l.optional(l.string()),
    cids: l.array(cid),
  }),
)

export const listRepos = l.query(
  'com.atproto.space.listRepos',
  l.params({
    space: spaceRef,
    limit: l.optional(l.integer({minimum: 1, maximum: 1000})),
    cursor: l.optional(l.string()),
  }),
  l.jsonPayload({
    cursor: l.optional(l.string()),
    repos: l.array(
      l.object({
        did: repoDid,
        rev: l.string(),
        hash: l.bytes(),
      }),
    ),
  }),
)

export const getRepo = l.query(
  'com.atproto.space.getRepo',
  l.params({
    space: spaceRef,
    repo: repoDid,
    excludeValues: l.optional(l.boolean()),
  }),
  l.payload('application/vnd.ipld.car', undefined),
)

export const getLatestCommit = l.query(
  'com.atproto.space.getLatestCommit',
  l.params({space: spaceRef, repo: repoDid}),
  l.jsonPayload({commit: l.lexMap()}),
)

export const listRepoOps = l.query(
  'com.atproto.space.listRepoOps',
  l.params({
    space: spaceRef,
    repo: repoDid,
    since: l.optional(tid),
    limit: l.optional(l.integer({minimum: 1, maximum: 1000})),
    cursor: l.optional(l.string()),
    excludeValues: l.optional(l.boolean()),
  }),
  l.jsonPayload({
    ops: l.array(l.lexMap()),
    commit: l.optional(l.lexMap()),
    cursor: l.optional(l.string()),
  }),
)

export const listSpaces = l.query(
  'com.atproto.space.listSpaces',
  l.params({
    type: l.optional(collection),
    did: l.optional(repoDid),
    limit: l.optional(l.integer({minimum: 1, maximum: 100})),
    cursor: l.optional(l.string()),
  }),
  l.jsonPayload({
    cursor: l.optional(l.string()),
    spaces: l.array(l.object({uri: spaceRef})),
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
  listBlobs,
  listRepos,
  getRepo,
  getLatestCommit,
  listRepoOps,
  listSpaces,
} as const
