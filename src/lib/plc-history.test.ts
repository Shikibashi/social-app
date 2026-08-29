jest.unmock('multiformats/cid')
jest.unmock('crypto')

import {P256Keypair} from '@atproto/crypto'
import * as cbor from '@ipld/dag-cbor'
import {describe, expect, it} from '@jest/globals'

import {
  didForCreateOperation,
  operationCid,
  type PlcOperation,
  verifyPlcHistory,
} from './plc-history'
import {
  type PlcResolverDescriptor,
  resolvePlcWithResolvers,
} from './plc-resolver'

const resolverA: PlcResolverDescriptor = {
  id: 'replica-a',
  displayName: 'Replica A',
  endpoint: 'https://replica-a.example',
  operatorId: 'operator-a',
}
const resolverB: PlcResolverDescriptor = {
  id: 'replica-b',
  displayName: 'Replica B',
  endpoint: 'https://replica-b.example',
  operatorId: 'operator-b',
}

describe('PLC history verification', () => {
  it('verifies a signed genesis operation and derives its DID', async () => {
    const fixture = await createHistory()
    const result = await verifyPlcHistory(fixture.did, [fixture.first])

    expect(result).toMatchObject({
      did: fixture.did,
      status: 'verified',
      verifiedOperations: 1,
      document: {did: fixture.did},
    })
    expect(result.headCid).toBe(await operationCid(fixture.first))
  })

  it('rejects tampered signatures and broken chain links', async () => {
    const fixture = await createHistory()
    const tampered = {
      ...fixture.first,
      alsoKnownAs: ['at://tampered.example'],
    }
    const tamperedResult = await verifyPlcHistory(fixture.did, [tampered])
    expect(tamperedResult.status).toBe('invalid')

    const broken = {...fixture.second, prev: await operationCid(tampered)}
    const brokenResult = await verifyPlcHistory(fixture.did, [
      fixture.first,
      broken,
    ])
    expect(brokenResult.status).toBe('invalid')
    expect(brokenResult.invalidAt).toBe(1)
  })

  it('exposes resolver disagreement after independently verified histories', async () => {
    const fixture = await createHistory()
    const alternate = await signOperation(fixture.key, {
      ...stripSignature(fixture.first),
      prev: await operationCid(fixture.first),
      alsoKnownAs: ['at://alternate.example'],
    })
    const responses = new Map<string, unknown>([
      [resolverA.id, [fixture.first, fixture.second]],
      [resolverB.id, [fixture.first, alternate]],
    ])
    const result = await resolvePlcWithResolvers(
      fixture.did,
      [resolverA, resolverB],
      {
        fetcher: input => {
          const url =
            typeof input === 'string'
              ? input
              : input instanceof URL
                ? input.toString()
                : input.url
          const resolver = url.includes('replica-a') ? resolverA : resolverB
          return Promise.resolve(
            new Response(JSON.stringify(responses.get(resolver.id)), {
              status: 200,
              headers: {'content-type': 'application/json'},
            }),
          )
        },
      },
    )

    expect(result.status).toBe('disagreement')
    expect(result.selected).toBeUndefined()
    expect(result.claims).toHaveLength(2)
    expect(
      result.claims.every(claim => claim.verification?.status === 'verified'),
    ).toBe(true)
    expect(result.declaredOperatorIds).toEqual(['operator-a', 'operator-b'])
  })

  it('retains an invalid replica claim instead of treating HTTP success as authority', async () => {
    const fixture = await createHistory()
    const result = await resolvePlcWithResolvers(fixture.did, [resolverA], {
      fetcher: () =>
        Promise.resolve(
          new Response(
            JSON.stringify([{...fixture.first, sig: 'not-a-signature'}]),
            {
              status: 200,
            },
          ),
        ),
    })

    expect(result.status).toBe('unavailable')
    expect(result.claims[0].verification?.status).toBe('invalid')
    expect(result.claims[0].error).toBeUndefined()
  })
})

async function createHistory() {
  const key = await P256Keypair.create()
  const unsigned: Omit<PlcOperation, 'sig'> = {
    type: 'plc_operation',
    prev: null,
    rotationKeys: [key.did()],
    verificationMethods: {atproto: key.did()},
    alsoKnownAs: ['at://example.test'],
    services: {
      atproto_pds: {
        type: 'AtprotoPersonalDataServer',
        endpoint: 'https://pds.example',
      },
    },
  }
  const first = await signOperation(key, unsigned)
  const did = await didForCreateOperation(first)
  const second = await signOperation(key, {
    ...unsigned,
    prev: await operationCid(first),
    alsoKnownAs: ['at://updated.example'],
  })
  return {did, first, second, key}
}

async function signOperation(
  key: P256Keypair,
  unsigned: Omit<PlcOperation, 'sig'>,
): Promise<PlcOperation> {
  const sig = await key.sign(cbor.encode(unsigned))
  return {...unsigned, sig: base64Url(sig)}
}

function stripSignature(operation: PlcOperation): Omit<PlcOperation, 'sig'> {
  const {sig: _sig, ...unsigned} = operation
  return unsigned
}

function base64Url(bytes: Uint8Array): string {
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}
