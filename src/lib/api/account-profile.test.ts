import {type Client} from '@atproto/lex'
import {describe, expect, it, jest} from '@jest/globals'

import {app, com} from '#/lexicons'
import {fetchAccountProfile, mergeAccountProfileView} from './account-profile'

const actor = 'did:plc:viewer'
const handle = 'edriffles.us'

function fakeClient(
  call: (method: unknown, params: unknown) => Promise<unknown>,
  assertDid?: string,
): Client {
  return {assertDid, call: jest.fn(call)} as unknown as Client
}

function profileRecord() {
  return {
    $type: app.bsky.actor.profile.$type,
    displayName: 'Current PDS name',
    description: 'Current PDS bio',
    website: 'https://edriffles.us',
    pronouns: 'they/them',
    createdAt: '2026-08-27T00:00:00.000Z',
  } as app.bsky.actor.profile.Main
}

describe('account profile reads', () => {
  it('overlays PDS-owned fields over an available AppView profile', async () => {
    const record = profileRecord()
    const pds = fakeClient(method => {
      expect(method).toBe(com.atproto.repo.getRecord)
      return Promise.resolve({
        uri: `at://${actor}/app.bsky.actor.profile/self`,
        value: record,
      })
    }, actor)
    const appview = fakeClient(method => {
      expect(method).toBe(app.bsky.actor.getProfile)
      return Promise.resolve({
        did: actor,
        handle,
        displayName: 'Stale AppView name',
        description: 'Stale AppView bio',
        postsCount: 12,
        avatar: 'https://cdn.example/avatar.jpg',
      })
    })

    await expect(
      fetchAccountProfile({
        pdsClient: pds,
        appviewClient: appview,
        actor,
        handle,
      }),
    ).resolves.toMatchObject({
      did: actor,
      handle,
      displayName: 'Current PDS name',
      description: 'Current PDS bio',
      website: 'https://edriffles.us',
      pronouns: 'they/them',
      postsCount: 12,
      avatar: 'https://cdn.example/avatar.jpg',
    })
  })

  it('builds a usable owner profile when the AppView is unavailable', () => {
    expect(
      mergeAccountProfileView({
        actor,
        handle,
        record: profileRecord(),
      }),
    ).toMatchObject({
      did: actor,
      handle,
      displayName: 'Current PDS name',
      description: 'Current PDS bio',
    })
  })
})
