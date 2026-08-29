import {type AtUriString} from '@atproto/syntax'

export type AccountScopedLikeUri = AtUriString | 'pending' | undefined
export type AccountScopedLikeShadow = {likeUri: AccountScopedLikeUri}

const MAX_ACCOUNT_SCOPED_LIKES = 500
const likeShadows = new Map<string, AccountScopedLikeShadow>()

function key(accountDid: string, postUri: string): string {
  return `${accountDid}\u0000${postUri}`
}

export function getAccountScopedLikeShadow(
  accountDid: string,
  postUri: string,
): AccountScopedLikeShadow | undefined {
  return likeShadows.get(key(accountDid, postUri))
}

export function setAccountScopedLikeShadow(
  accountDid: string,
  postUri: string,
  likeUri: AccountScopedLikeUri,
): void {
  likeShadows.set(key(accountDid, postUri), {likeUri})

  while (likeShadows.size > MAX_ACCOUNT_SCOPED_LIKES) {
    const oldest = likeShadows.keys().next().value
    if (oldest === undefined) return
    likeShadows.delete(oldest)
  }
}
