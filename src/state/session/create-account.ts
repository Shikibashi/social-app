import {TID} from '@atproto/common-web'
import {type Client} from '@atproto/lex'
import {toDatetimeString} from '@atproto/syntax'
import {overwriteSavedFeeds, upsertProfile} from '@bsky/sdk'

import {networkRetry} from '#/lib/async/retry'
import {
  DISCOVER_SAVED_FEED,
  IS_PROD_SERVICE,
  TIMELINE_SAVED_FEED,
} from '#/lib/constants'
import {logger} from '#/logger'
import {snoozeEmailConfirmationPrompt} from '#/state/shell/reminders'
import {features} from '#/analytics'
import {type app} from '#/lexicons'
import {configureModerationForAccount} from './moderation'
import {signUpWithOAuth} from './oauth-session'
import {
  buildBundle,
  finishPreparation,
  makeSessionHooks,
  type OnSessionChange,
  registerBundleKillSwitch,
  type SessionBundle,
  type SessionTransport,
} from './session-core'
import {sessionDataToSessionAccount} from './session-data'
import {type SessionAccount} from './types'

/**
 * The pre-OAuth signup API is retained only so stale test fixtures fail with a
 * useful error instead of silently dropping authentication fields.
 */
export class LegacySignupRequiresOAuthError extends Error {
  constructor() {
    super(
      'Password-based signup is no longer supported; start account creation through the provider-owned OAuth signup flow',
    )
    this.name = 'LegacySignupRequiresOAuthError'
  }
}

export function createSessionBundleAndCreateAccount(
  {
    service,
  }: {
    service: string
    email: string
    password: string
    handle: string
    birthDate: Date
    inviteCode?: string
    verificationPhone?: string
    verificationCode?: string
  },
  onSessionChange: OnSessionChange,
): Promise<{account: SessionAccount; bundle: SessionBundle}> {
  // Do not accept-and-ignore the legacy fields. The active UI calls `signUp`;
  // stale callers must fail explicitly so a password is never mistaken for a
  // credential that the provider accepted.
  void service
  void onSessionChange
  return Promise.reject(new LegacySignupRequiresOAuthError())
}

/** Create an account through the provider-owned OAuth signup surface. */
export async function createSessionBundleAndOAuthSignup(
  {service}: {service: string},
  onSessionChange: OnSessionChange,
): Promise<{account: SessionAccount; bundle: SessionBundle}> {
  let bundle!: SessionBundle
  let accountDid = ''
  const hooks = makeSessionHooks({
    onSessionChange,
    getBundle: () => bundle,
    getDid: () => accountDid,
  })
  const session = await signUpWithOAuth(service, hooks)

  bundle = buildBundle(session)
  registerBundleKillSwitch(bundle, hooks.kill)
  const earlyAccount = snapshotNewAccount(session)
  accountDid = earlyAccount.did

  const gates = features.refresh({strategy: 'prefer-fresh-gates'})
  configureModerationForAccount(bundle, earlyAccount)

  const createdAt = toDatetimeString(new Date())
  const isProd = Boolean(IS_PROD_SERVICE(service))
  const postSignupTasks: Promise<unknown>[] = [
    initializeProfile(bundle.pdsClient, {
      handle: earlyAccount.handle,
      createdAt,
      isProd,
    }),
  ]
  if (isProd) {
    postSignupTasks.push(initializeSavedFeeds(bundle.pdsClient))
  }
  void reportPostSignupFailures(postSignupTasks)

  try {
    snoozeEmailConfirmationPrompt()
  } catch (e) {
    logger.error(e instanceof Error ? e : String(e), {
      message: `session: failed snoozeEmailConfirmationPrompt`,
    })
  }

  const account = await finishPreparation(bundle, gates, () =>
    snapshotNewAccount(session),
  )
  hooks.arm()
  return {account, bundle}
}

/** Snapshot a provider-created OAuth session as a `SessionAccount`. */
function snapshotNewAccount(
  session: SessionTransport,
  email?: string,
): SessionAccount {
  const account = sessionDataToSessionAccount(
    session.session,
    session.session.service,
  )
  if (!account) {
    throw Error('Expected an active session')
  }
  return {
    ...account,
    ...(email
      ? {
          email: account.email ?? email,
          emailConfirmed: account.emailConfirmed ?? false,
          emailAuthFactor: account.emailAuthFactor ?? false,
        }
      : {}),
    active: account.active ?? true,
  }
}

function initializeProfile(
  client: Client,
  {
    handle,
    createdAt,
    isProd,
  }: {
    handle: string
    createdAt: ReturnType<typeof toDatetimeString>
    isProd: boolean
  },
) {
  return retryPostSignupTask('set initial profile', 3, () =>
    client.call(upsertProfile, prev => {
      const next: Partial<app.bsky.actor.profile.Main> = prev || {}
      if (isProd) {
        next.displayName = handle
        next.createdAt = createdAt
      } else {
        next.createdAt = prev?.createdAt || toDatetimeString(new Date())
      }
      return next
    }),
  )
}

function initializeSavedFeeds(client: Client) {
  return retryPostSignupTask('set initial feeds', 1, () =>
    client.call(overwriteSavedFeeds, [
      {...DISCOVER_SAVED_FEED, id: TID.nextStr()},
      {...TIMELINE_SAVED_FEED, id: TID.nextStr()},
    ]),
  )
}

function retryPostSignupTask<T>(
  description: string,
  retries: number,
  task: () => Promise<T>,
) {
  return networkRetry(retries, task).catch(e => {
    logger.info(`createSessionBundleAndOAuthSignup: failed to ${description}`)
    throw e
  })
}

async function reportPostSignupFailures(tasks: Promise<unknown>[]) {
  const results = await Promise.allSettled(tasks)
  if (results.some(result => result.status === 'rejected')) {
    logger.error(
      `session: createSessionBundleAndOAuthSignup failed to save post-signup settings`,
    )
  }
}
