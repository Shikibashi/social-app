import {describe, expect, it, jest} from '@jest/globals'

import {initializeBrowserOAuthClient} from '../oauth-session'

describe('browser OAuth initialization', () => {
  it('adopts the session returned by the callback/restore initializer', async () => {
    const session = {} as never
    const init = jest.fn().mockResolvedValue({session, state: 'oauth-state'})

    await expect(initializeBrowserOAuthClient({init} as never)).resolves.toBe(
      session,
    )
    expect(init).toHaveBeenCalledTimes(1)
  })

  it('keeps a normal logged-out startup without a restored session', async () => {
    const init = jest.fn().mockResolvedValue(undefined)

    await expect(initializeBrowserOAuthClient({init} as never)).resolves.toBe(
      undefined,
    )
    expect(init).toHaveBeenCalledTimes(1)
  })
})
