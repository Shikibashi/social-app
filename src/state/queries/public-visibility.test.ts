import {type Client} from '@atproto/lex'

import {isBlockedOrBlocking} from '#/lib/moderation/blocked-and-muted'
import {type app} from '#/lexicons'
import {
  filterPublicPostsForViewer,
  hasDirectViewerBlock,
  hasViewerInteractionBoundary,
  interactionBlocked,
  stripNonLocalBlockVisibility,
  viewerHidesActor,
  viewerIsBlockedByActor,
} from './public-visibility'

const postUri =
  'at://did:plc:author/app.bsky.feed.post/public' as app.bsky.feed.defs.PostView['uri']

function listView(
  uri = 'at://did:plc:viewer/app.bsky.graph.list/mega',
): app.bsky.graph.defs.ListViewBasic {
  return {
    uri: uri as app.bsky.graph.defs.ListViewBasic['uri'],
    cid: 'bafyreilist',
    name: 'Mega list',
    purpose: 'app.bsky.graph.defs#modlist',
    indexedAt: '2026-08-18T20:00:00.000Z',
  }
}

function postWithViewerState(
  viewer: app.bsky.actor.defs.ViewerState,
): app.bsky.feed.defs.PostView {
  return {
    $type: 'app.bsky.feed.defs#postView',
    uri: postUri,
    cid: 'bafyreipublic',
    author: {
      $type: 'app.bsky.actor.defs#profileViewBasic',
      did: 'did:plc:author',
      handle: 'author.example.com',
      viewer,
    },
    record: {
      $type: 'app.bsky.feed.post',
      text: 'Public context remains readable.',
      createdAt: '2026-08-18T20:00:00.000Z',
    },
    indexedAt: '2026-08-18T20:00:00.000Z',
  }
}

describe('public-read block policy', () => {
  it('removes incoming and list-derived boundaries but preserves a direct block', () => {
    const list = {
      uri: 'at://did:plc:viewer/app.bsky.graph.list/mega',
      cid: 'bafyreilist',
      name: 'Mega list',
      purpose: 'app.bsky.graph.defs#modlist',
      indexedAt: '2026-08-18T20:00:00.000Z',
    } as app.bsky.graph.defs.ListViewBasic
    const listDerived = stripNonLocalBlockVisibility(
      postWithViewerState({
        blocking: list.uri,
        blockingByList: list,
        blockedBy: true,
      }),
    )

    expect(listDerived.author.viewer).toEqual({
      blocking: undefined,
    })

    const direct = stripNonLocalBlockVisibility(
      postWithViewerState({
        blocking: 'at://did:plc:viewer/app.bsky.graph.block/direct',
        blockedBy: true,
      }),
    )
    expect(direct.author.viewer).toEqual({
      blocking: 'at://did:plc:viewer/app.bsky.graph.block/direct',
      blockedBy: undefined,
    })
  })

  it('preserves a direct block when a list block is also present', () => {
    const list = listView()
    const actor = postWithViewerState({
      blocking: 'at://did:plc:viewer/app.bsky.graph.block/direct',
      blockingByList: list,
    }).author

    expect(hasDirectViewerBlock(actor)).toBe(true)
    expect(hasViewerInteractionBoundary(actor)).toBe(true)
    const visible = stripNonLocalBlockVisibility(
      postWithViewerState({
        blocking: actor.viewer?.blocking,
        blockingByList: list,
      }),
    )
    expect(visible.author.viewer).toEqual({
      blocking: 'at://did:plc:viewer/app.bsky.graph.block/direct',
    })
  })

  it('keeps incoming block metadata separate from public visibility', () => {
    const actor = postWithViewerState({blockedBy: true}).author

    expect(viewerHidesActor(actor)).toBe(false)
    expect(viewerIsBlockedByActor(actor)).toBe(true)
    expect(interactionBlocked(actor)).toBe(true)
    expect(hasViewerInteractionBoundary(actor)).toBe(true)
  })

  it('does not treat a list-only block as a hard client block', () => {
    const list = listView()
    const actor = postWithViewerState({
      blocking: list.uri,
      blockingByList: list,
    }).author

    expect(hasDirectViewerBlock(actor)).toBe(false)
    expect(hasViewerInteractionBoundary(actor)).toBe(false)
    expect(isBlockedOrBlocking(actor)).toBe(false)
  })

  it('does not trust a list URI in the shared blocking field without metadata', () => {
    const actor = postWithViewerState({
      blocking: 'at://did:plc:viewer/app.bsky.graph.list/mega',
    }).author

    expect(hasDirectViewerBlock(actor)).toBe(false)
    expect(viewerHidesActor(actor)).toBe(false)
    expect(
      stripNonLocalBlockVisibility(postWithViewerState(actor.viewer!)).author
        .viewer,
    ).toEqual({
      blocking: undefined,
    })
  })

  it('strips incoming block state from a blocked nested quote as well', () => {
    const nested = postWithViewerState({blockedBy: true})
    const post = {
      ...postWithViewerState({}),
      embed: {
        $type: 'app.bsky.embed.record#view',
        record: {
          $type: 'app.bsky.embed.record#viewRecord',
          uri: nested.uri,
          cid: nested.cid,
          author: nested.author,
          value: nested.record,
          indexedAt: nested.indexedAt,
        },
      } as app.bsky.embed.record.View,
    } as unknown as app.bsky.feed.defs.PostView

    const visible = stripNonLocalBlockVisibility(post)
    if (
      !visible.embed ||
      visible.embed.$type !== 'app.bsky.embed.record#view'
    ) {
      throw new Error('expected a quote embed')
    }
    expect(
      (visible.embed as app.bsky.embed.record.View).record,
    ).not.toMatchObject({
      author: {viewer: {blockedBy: true}},
    })
  })

  it('checks authenticated relationship authority before accepting public recovery', async () => {
    const post = {
      ...postWithViewerState({}),
      author: {...postWithViewerState({}).author, viewer: undefined},
    }
    const client = {
      call: jest.fn().mockResolvedValue({
        viewer: {
          blocking: 'at://did:plc:viewer/app.bsky.graph.block/direct',
        },
      }),
    } as unknown as Client

    await expect(filterPublicPostsForViewer(client, [post])).resolves.toEqual(
      [],
    )
    expect(client.call).toHaveBeenCalledTimes(1)
  })

  it('allows public recovery for incoming and list-only relationships', async () => {
    const incoming = {
      ...postWithViewerState({}),
      author: {...postWithViewerState({}).author, viewer: undefined},
    }
    const listOnly = {
      ...postWithViewerState({}),
      author: {...postWithViewerState({}).author, viewer: undefined},
    }
    const list = listView()
    const client = {
      call: jest
        .fn()
        .mockResolvedValueOnce({viewer: {blockedBy: true}})
        .mockResolvedValueOnce({
          viewer: {blocking: list.uri, blockingByList: list},
        }),
    } as unknown as Client
    incoming.author.did = 'did:plc:incoming'
    listOnly.author.did = 'did:plc:list-only'

    await expect(
      filterPublicPostsForViewer(client, [incoming, listOnly]),
    ).resolves.toEqual([incoming, listOnly])
  })
})
