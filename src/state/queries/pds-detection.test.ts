import {afterEach, describe, expect, it, jest} from '@jest/globals'

import {createServiceClient} from '#/lib/lexClient'

import {resolvePdsForIdentifier} from './pds-detection'

jest.mock('#/lib/constants', () => ({
  DEFAULT_SERVICE: 'http://fixture.invalid',
  PUBLIC_ACCOUNT_SERVICE: 'https://account-entryway.example',
}))

jest.mock('#/lib/lexClient', () => ({
  createServiceClient: jest.fn(),
}))

const did = 'did:plc:3ijrhre2q5e4tt2f4ph2sneo'
const pds = 'https://yellowfoot.us-west.host.bsky.network'

describe('resolvePdsForIdentifier', () => {
  afterEach(() => {
    jest.restoreAllMocks()
    jest.clearAllMocks()
  })

  it('resolves handles through the account entryway, then follows the DID PDS', async () => {
    const resolveHandle = jest.fn().mockResolvedValue({did})
    jest.mocked(createServiceClient).mockReturnValue({
      call: resolveHandle,
    } as never)
    jest.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        id: did,
        service: [
          {
            id: '#atproto_pds',
            type: 'AtprotoPersonalDataServer',
            serviceEndpoint: pds,
          },
        ],
      }),
    } as Response)

    await expect(resolvePdsForIdentifier('EDRIFFLES.US')).resolves.toEqual({
      did,
      pdsUrl: pds,
    })
    expect(createServiceClient).toHaveBeenCalledWith(
      'https://account-entryway.example',
    )
    expect(resolveHandle).toHaveBeenCalledTimes(1)
  })
})
