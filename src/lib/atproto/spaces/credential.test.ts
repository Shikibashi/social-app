import {createSpaceCredentialSession} from './credential'

jest.mock('#/env', () => ({
  assertSpacesAlphaDeploymentSafe: jest.fn(() => {
    throw new Error('Spaces alpha is test-only')
  }),
}))

describe('Spaces credential boundary', () => {
  it('fails before resolving an endpoint or requesting a delegation', async () => {
    const userClient = {call: jest.fn()} as never
    const resolveEndpoint = jest.fn()

    await expect(
      createSpaceCredentialSession(
        userClient,
        'at://did:plc:owner/space/us.edriffles.radlib.account/private',
        resolveEndpoint,
      ),
    ).rejects.toThrow('Spaces alpha is test-only')

    expect(resolveEndpoint).not.toHaveBeenCalled()
    expect((userClient as {call: jest.Mock}).call).not.toHaveBeenCalled()
  })
})
