import {
  getAccountScopedLikeShadow,
  setAccountScopedLikeShadow,
} from './post-interaction-shadow'

describe('account-scoped post interaction shadow', () => {
  it('follows a post URI across replacement view objects', () => {
    const accountDid = 'did:plc:viewer'
    const postUri = 'at://did:plc:author/app.bsky.feed.post/1'
    const likeUri = `at://${accountDid}/app.bsky.feed.like/1` as const

    setAccountScopedLikeShadow(accountDid, postUri, likeUri)

    expect(getAccountScopedLikeShadow(accountDid, postUri)).toEqual({likeUri})
  })

  it("does not expose one account's like state to another account", () => {
    const postUri = 'at://did:plc:author/app.bsky.feed.post/2'
    const accountDid = 'did:plc:viewer-a'
    const otherAccountDid = 'did:plc:viewer-b'

    setAccountScopedLikeShadow(
      accountDid,
      postUri,
      `at://${accountDid}/app.bsky.feed.like/2`,
    )

    expect(getAccountScopedLikeShadow(otherAccountDid, postUri)).toBeUndefined()
  })

  it('preserves an unlike decision while a provider is stale', () => {
    const accountDid = 'did:plc:viewer-unlike'
    const postUri = 'at://did:plc:author/app.bsky.feed.post/3'

    setAccountScopedLikeShadow(accountDid, postUri, undefined)

    expect(getAccountScopedLikeShadow(accountDid, postUri)).toEqual({
      likeUri: undefined,
    })
  })
})
