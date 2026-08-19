import {sha256} from 'js-sha256'

export const LISTBLOCK_MIGRATION_RECEIPT_VERSION =
  'radlib-listblock-migration/1' as const
export const LISTBLOCK_MIGRATION_POLICY_VERSION = 'radlib-moderation/1' as const

export type LegacyListblockRecord = {
  uri: string
  cid: string
  subjectListUri: string
  createdAt: string
}

export type ListblockMigrationReceipt = {
  receiptVersion: typeof LISTBLOCK_MIGRATION_RECEIPT_VERSION
  policyVersion: typeof LISTBLOCK_MIGRATION_POLICY_VERSION
  listblocksDiscovered: number
  convertedToPrivateMute: number
  providerMutesAttested: number
  deleted: number
  failed: number
  directBlocksBefore: number
  directBlocksAfter: number
  directBlockDelta: number
  remainingListblocks: number
  failedSourceHashes: string[]
  status: 'complete' | 'failed'
}

export type ListblockMigrationAdapter = {
  ensurePrivateListMute: (listUri: string) => Promise<void>
  verifyPrivateListMute: (listUri: string) => Promise<boolean>
  attestPrivateListMute?: (
    listUri: string,
    listUriHash: string,
  ) => Promise<void>
  deleteListblock: (record: LegacyListblockRecord) => Promise<void>
  verifyListblockDeleted: (uri: string) => Promise<boolean>
}

/**
 * Converts public listblock records to private list mutes without ever
 * creating a durable block. Records are sorted before processing so receipts
 * and retries are deterministic. A failed mute leaves the source record
 * untouched; a failed delete leaves the verified private mute in place.
 */
export async function migrateLegacyListblocks(
  records: LegacyListblockRecord[],
  adapter: ListblockMigrationAdapter,
  opts: {directBlocksBefore?: number; explicitReviewBlocks?: number} = {},
): Promise<ListblockMigrationReceipt> {
  const ordered = [...records].sort((a, b) =>
    `${a.createdAt}\u0000${a.uri}`.localeCompare(
      `${b.createdAt}\u0000${b.uri}`,
    ),
  )
  const directBlocksBefore = opts.directBlocksBefore ?? 0
  const explicitReviewBlocks = opts.explicitReviewBlocks ?? 0
  let convertedToPrivateMute = 0
  let providerMutesAttested = 0
  let deleted = 0
  const failedSourceHashes: string[] = []

  for (const record of ordered) {
    try {
      await adapter.ensurePrivateListMute(record.subjectListUri)
      if (!(await adapter.verifyPrivateListMute(record.subjectListUri))) {
        throw new Error('private list mute could not be verified')
      }
      if (adapter.attestPrivateListMute) {
        await adapter.attestPrivateListMute(
          record.subjectListUri,
          hashListUri(record.subjectListUri),
        )
        providerMutesAttested += 1
      }
      convertedToPrivateMute += 1

      await adapter.deleteListblock(record)
      if (!(await adapter.verifyListblockDeleted(record.uri))) {
        throw new Error('listblock deletion could not be verified')
      }
      deleted += 1
    } catch {
      // Hash only the source identifier. Do not put the moderation graph or
      // record contents into the portable/audit receipt.
      failedSourceHashes.push(hashSource(record.uri))
    }
  }

  const directBlockDelta = explicitReviewBlocks
  const directBlocksAfter = directBlocksBefore + directBlockDelta
  const failed = failedSourceHashes.length

  return {
    receiptVersion: LISTBLOCK_MIGRATION_RECEIPT_VERSION,
    policyVersion: LISTBLOCK_MIGRATION_POLICY_VERSION,
    listblocksDiscovered: ordered.length,
    convertedToPrivateMute,
    providerMutesAttested,
    deleted,
    failed,
    directBlocksBefore,
    directBlocksAfter,
    directBlockDelta,
    remainingListblocks: ordered.length - deleted,
    failedSourceHashes,
    status: failed === 0 ? 'complete' : 'failed',
  }
}

export function hashListUri(uri: string): string {
  return Array.from(new Uint8Array(sha256.arrayBuffer(uri)), byte =>
    byte.toString(16).padStart(2, '0'),
  ).join('')
}

function hashSource(uri: string): string {
  // This receipt identifier is only a stable, non-reversible source handle;
  // it is not used for authentication or integrity. Use the existing
  // cross-platform SHA-256 utility rather than a short non-cryptographic hash
  // because source URIs may contain a small, guessable moderation graph.
  return `sha256:${hashListUri(uri)}`
}
