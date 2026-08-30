import {describe, expect, it} from '@jest/globals'

import {
  applyViewerSovereignModeration,
  getModerationPolicyTrace,
  type InterpretedLabelValueDefinition,
  moderatePost,
  ModerationDecision,
  type ModerationOpts,
} from './moderation'

const labelerDid = 'did:plc:labeler.test'
const authorDid = 'did:plc:author.test'
const labelValue = 'radlib-example'

const ordinaryNoOverrideDefinition: InterpretedLabelValueDefinition = {
  identifier: labelValue,
  severity: 'alert',
  blurs: 'content',
  configurable: false,
  defaultSetting: 'hide',
  flags: ['no-override'],
  behaviors: {
    content: {contentList: 'blur', contentView: 'alert'},
  },
  locales: [],
}

const baseOpts = (preference: 'ignore' | 'warn' | 'hide'): ModerationOpts => ({
  userDid: 'did:plc:viewer.test',
  prefs: {
    adultContentEnabled: true,
    labels: {},
    labelers: [{did: labelerDid, labels: {[labelValue]: preference}}],
    mutedWords: [],
    hiddenPosts: [],
  },
  labelDefs: {[labelerDid]: [ordinaryNoOverrideDefinition]},
})

const post = {
  uri: 'at://did:plc:author.test/app.bsky.feed.post/example',
  cid: 'bafyreih6x7nq4q6z2xq4jv4z7y2q4w6b6yqv5o6e6l5c5m5r7o5q5e5w5u',
  author: {
    did: authorDid,
    handle: 'author.test',
    displayName: 'Author',
    labels: [],
    viewer: {},
  },
  record: {
    $type: 'app.bsky.feed.post',
    text: 'A public post carrying a third-party label.',
    createdAt: '2026-01-01T00:00:00.000Z',
  },
  labels: [
    {
      $type: 'com.atproto.label.defs#label',
      src: labelerDid,
      uri: 'at://did:plc:author.test/app.bsky.feed.post/example',
      val: labelValue,
      cts: '2026-01-01T00:00:00.000Z',
    },
  ],
} as never

const preferenceCases: Array<
  ['ignore' | 'warn' | 'hide', false, boolean, 'ignore' | 'warn' | 'hide']
> = [
  ['ignore', false, false, 'ignore'],
  ['warn', false, true, 'warn'],
  ['hide', false, true, 'hide'],
]

describe('viewer-sovereign moderation policy', () => {
  it.each(preferenceCases)(
    'keeps provenance while honoring the viewer %s choice',
    (preference, noOverride, hasAlert, setting) => {
      const decision = moderatePost(post, baseOpts(preference))
      const cause = decision.labelCauses[0]

      expect(cause).toBeDefined()
      expect(cause.source).toEqual({type: 'labeler', did: labelerDid})
      expect(cause.label.val).toBe(labelValue)
      expect(cause.setting).toBe(setting)
      expect(cause.noOverride).toBe(noOverride)
      expect(decision.ui('contentView').noOverride).toBe(false)
      expect(decision.ui('contentView').alerts.length > 0).toBe(hasAlert)
      expect(decision.ui('contentList').filters.length > 0).toBe(
        preference === 'hide',
      )

      if (cause?.type !== 'label') {
        throw new Error('Expected a label moderation cause')
      }
      const trace = getModerationPolicyTrace(cause)
      expect(trace.source).toEqual({type: 'labeler', did: labelerDid})
      expect(trace.assertion.label.val).toBe(labelValue)
      expect(trace.assertion.target).toBe('content')
      expect(trace.userRule).toBe(setting)
      expect(trace.userOverridable).toBe(true)
      expect(trace.clientBehavior).toEqual(
        setting === 'ignore'
          ? {}
          : setting === 'warn'
            ? {contentList: 'blur', contentView: 'alert'}
            : {contentList: 'blur', contentView: 'alert'},
      )
    },
  )

  it('does not override system no-override causes', () => {
    const decision = new ModerationDecision()
    decision.causes.push({
      type: 'label',
      source: {type: 'labeler', did: labelerDid},
      label: {
        src: labelerDid,
        uri: 'at://did:plc:author.test/app.bsky.feed.post/example',
        val: '!hide',
        cts: '2026-01-01T00:00:00.000Z',
      },
      labelDef: {
        identifier: '!hide',
        severity: 'alert',
        blurs: 'content',
        configurable: false,
        defaultSetting: 'hide',
        flags: ['no-override'],
        behaviors: {content: {contentView: 'blur'}},
        locales: [],
      },
      target: 'content',
      setting: 'hide',
      behavior: {contentView: 'blur'},
      noOverride: true,
      priority: 1,
    })

    applyViewerSovereignModeration(decision)

    expect(decision.causes[0].type).toBe('label')
    if (decision.causes[0].type !== 'label') {
      throw new Error('Expected a label moderation cause')
    }
    const trace = getModerationPolicyTrace(decision.causes[0])
    expect(trace.userRule).toBe('hide')
    expect(trace.userOverridable).toBe(false)
    expect(trace.clientBehavior).toEqual({contentView: 'blur'})
    expect(decision.ui('contentView').noOverride).toBe(true)
  })

  it('does not turn block causes into viewer-overridable labels', () => {
    const decision = new ModerationDecision()
    decision.addBlocking(authorDid)

    applyViewerSovereignModeration(decision)

    expect(decision.blocked).toBe(true)
    expect(decision.ui('contentView').noOverride).toBe(true)
  })
})
