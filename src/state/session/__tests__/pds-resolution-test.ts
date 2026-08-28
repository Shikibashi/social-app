import {afterEach, describe, expect, it, jest} from '@jest/globals'

import {resolvePdsEndpointForDid} from '../pds-resolution'

const DID = 'did:plc:resolver-test'
const PDS = 'https://pds.example'

describe('DID-backed PDS resolution', () => {
  afterEach(() => {
    jest.restoreAllMocks()
  })

  it('accepts a DID document whose subject matches the requested DID', async () => {
    jest.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({
          id: DID,
          service: [
            {
              id: '#atproto_pds',
              type: 'AtprotoPersonalDataServer',
              serviceEndpoint: PDS,
            },
          ],
        }),
        {status: 200},
      ),
    )

    await expect(resolvePdsEndpointForDid(DID)).resolves.toBe(PDS)
  })

  it('rejects a DID document for a different subject', async () => {
    jest.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({
          id: 'did:plc:another-identity',
          service: [
            {
              id: '#atproto_pds',
              type: 'AtprotoPersonalDataServer',
              serviceEndpoint: PDS,
            },
          ],
        }),
        {status: 200},
      ),
    )

    await expect(resolvePdsEndpointForDid(DID)).resolves.toBeUndefined()
  })
})
