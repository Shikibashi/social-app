jest.unmock('multiformats/cid')
jest.unmock('crypto')

import {describe, expect, it} from '@jest/globals'

import {
  createMemoryRotationKeyStore,
  createUserHeldRotationKey,
  signPlcOperationWithUserHeldKey,
  verifyUserHeldPlcSignature,
} from './plc-key-custody'
import {type UnsignedPlcOperation} from './plc-key-custody'

const ACCOUNT_DID = 'did:plc:aaaaaaaaaaaaaaaaaaaaaaaa'

describe('user-held PLC key custody', () => {
  it('creates non-exportable custody and signs only an authorized operation', async () => {
    const store = createMemoryRotationKeyStore()
    const cryptoApi = globalThis.crypto
    const handle = await createUserHeldRotationKey(
      ACCOUNT_DID,
      store,
      cryptoApi,
    )
    const privateKey = await store.get(handle.keyId)

    expect(handle.did).toBe(ACCOUNT_DID)
    expect(handle.didKey).toMatch(/^did:key:/)
    expect(handle.publicJwk.d).toBeUndefined()
    expect(privateKey?.extractable).toBe(false)
    await expect(
      cryptoApi.subtle.exportKey('jwk', privateKey as CryptoKey),
    ).rejects.toThrow()

    const unsigned = operation(handle.didKey)
    const signed = await signPlcOperationWithUserHeldKey(
      handle,
      unsigned,
      [handle.didKey],
      store,
      cryptoApi,
    )

    expect(signed.sig).toMatch(/^[A-Za-z0-9_-]+$/)
    expect(await verifyUserHeldPlcSignature(handle, unsigned, signed.sig)).toBe(
      true,
    )
  })

  it('does not turn key generation into rotation authority', async () => {
    const store = createMemoryRotationKeyStore()
    const cryptoApi = globalThis.crypto
    const handle = await createUserHeldRotationKey(
      ACCOUNT_DID,
      store,
      cryptoApi,
    )

    await expect(
      signPlcOperationWithUserHeldKey(
        handle,
        operation(handle.didKey),
        ['did:key:z6MkiNotAuthorized'],
        store,
        cryptoApi,
      ),
    ).rejects.toThrow('not an authorized rotation key')
  })
})

function operation(rotationKey: string): UnsignedPlcOperation {
  return {
    type: 'plc_operation',
    prev: null,
    rotationKeys: [rotationKey],
    verificationMethods: {atproto: rotationKey},
    alsoKnownAs: ['at://example.test'],
    services: {
      atproto_pds: {
        type: 'AtprotoPersonalDataServer',
        endpoint: 'https://pds.example',
      },
    },
  }
}
