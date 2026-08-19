import {QueryClient} from '@tanstack/react-query'

import {type app} from '#/lexicons'
import {findDirectPostsInQueryCache} from './post-shadow-cache'

describe('direct post shadow cache lookup', () => {
  it('finds posts opened directly before the PDS confirms a like', () => {
    const queryClient = new QueryClient()
    const uri = 'at://did:plc:author/app.bsky.feed.post/1'
    const post = {uri} as unknown as app.bsky.feed.defs.PostView

    queryClient.setQueryData(['post', uri], post)

    expect([...findDirectPostsInQueryCache(queryClient, uri)]).toEqual([post])
  })
})
