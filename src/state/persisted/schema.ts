import {isDidString} from '@atproto/lex'
import {z} from 'zod'

import {deviceLanguageCodes, deviceLocales} from '#/locale/deviceLocales'
import {findSupportedAppLanguage} from '#/locale/helpers'
import {logger} from '#/logger'
import {PlatformInfo} from '../../../modules/expo-bluesky-swiss-army'

const externalEmbedOptions = ['show', 'hide'] as const

/**
 * A account persisted to storage. Stored in the `accounts[]` array. Contains
 * base account info and access tokens.
 */
const appviewProviderSchema = z.object({
  id: z.string().min(1),
  displayName: z.string().min(1),
  serviceDid: z.string().refine(isDidString),
  serviceFragment: z.string().min(1),
  endpoint: z.string().url(),
  healthPath: z.string().regex(/^\/xrpc\/[A-Za-z0-9._-]+$/).optional(),
  builtin: z.boolean(),
  enabled: z.boolean(),
})
export type PersistedAppViewProvider = z.infer<typeof appviewProviderSchema>
const accountSchema = z.object({
  service: z.string(),
  /**
   * Genuinely validated, not just branded: the refinement rejects malformed
   * values at runtime and narrows the inferred type to `DidString`.
   *
   * Weigh any further tightening of this field carefully. One failing field
   * fails the whole root schema, and {@link tryParse} then discards the ENTIRE
   * persisted state - every account and every preference - so the app boots
   * logged out with defaults. Persisted dids come from com.atproto.server
   * responses and are always canonical, so this particular check is safe.
   */
  did: z.string().refine(isDidString),
  handle: z.string(),
  email: z.string().optional(),
  emailConfirmed: z.boolean().optional(),
  emailAuthFactor: z.boolean().optional(),
  refreshJwt: z.string().optional(), // optional because it can expire
  accessJwt: z.string().optional(), // optional because it can expire
  signupQueued: z.boolean().optional(),
  active: z.boolean().optional(), // optional for backwards compat
  /**
   * Known values: takendown, suspended, deactivated
   * @see https://github.com/bluesky-social/atproto/blob/5441fbde9ed3b22463e91481ec80cb095643e141/lexicons/com/atproto/server/getSession.json
   */
  status: z.string().optional(),
  pdsUrl: z.string().optional(),
  isSelfHosted: z.boolean().optional(),
})
export type PersistedAccount = z.infer<typeof accountSchema>

/**
 * The current account. Stored in the `currentAccount` field.
 *
 * In previous versions, this included tokens and other info. Now, it's used
 * only to reference the `did` field, and all other fields are marked as
 * optional. They should be considered deprecated and not used, but are kept
 * here for backwards compat.
 */
const currentAccountSchema = accountSchema.extend({
  service: z.string().optional(),
  handle: z.string().optional(),
})
export type PersistedCurrentAccount = z.infer<typeof currentAccountSchema>

const schema = z.object({
  appviewProviders: z.array(appviewProviderSchema).optional(),
  appviewSelections: z.record(z.string(), z.string()).optional(),
  appviewFallbacks: z.record(z.string(), z.record(z.string(), z.string())).optional(),
  /** Local read preference; does not change the public data returned by an AppView. */
  threadCurationView: z.enum(['all', 'author']).optional(),
  colorMode: z.enum(['system', 'light', 'dark']),
  darkTheme: z.enum(['dim', 'dark']).optional(),
  session: z.object({
    accounts: z.array(accountSchema),
    currentAccount: currentAccountSchema.optional(),
  }),
  reminders: z.object({
    lastEmailConfirm: z.string().optional(),
  }),
  languagePrefs: z.object({
    /**
     * The target language for translating posts.
     *
     * BCP-47 2-letter language code without region.
     */
    primaryLanguage: z.string(),
    /**
     * The languages the user can read, passed to feeds.
     *
     * BCP-47 2-letter language codes without region.
     */
    contentLanguages: z.array(z.string()),
    /**
     * The language(s) the user is currently posting in, configured within the
     * composer. Multiple languages are separated by commas.
     *
     * BCP-47 2-letter language code without region.
     */
    postLanguage: z.string(),
    /**
     * The user's post language history, used to pre-populate the post language
     * selector in the composer. Within each value, multiple languages are separated
     * by commas.
     *
     * BCP-47 2-letter language codes without region.
     */
    postLanguageHistory: z.array(z.string()),
    /**
     * The language for UI translations in the app.
     *
     * BCP-47 2-letter language code with or without region,
     * to match with {@link AppLanguage}.
     */
    appLanguage: z.string(),
  }),
  requireAltTextEnabled: z.boolean(), // should move to server
  largeAltBadgeEnabled: z.boolean().optional(),
  externalEmbeds: z
    .object({
      giphy: z.enum(externalEmbedOptions).optional(),
      tenor: z.enum(externalEmbedOptions).optional(),
      klipy: z.enum(externalEmbedOptions).optional(),
      youtube: z.enum(externalEmbedOptions).optional(),
      youtubeShorts: z.enum(externalEmbedOptions).optional(),
      twitch: z.enum(externalEmbedOptions).optional(),
      vimeo: z.enum(externalEmbedOptions).optional(),
      spotify: z.enum(externalEmbedOptions).optional(),
      appleMusic: z.enum(externalEmbedOptions).optional(),
      soundcloud: z.enum(externalEmbedOptions).optional(),
      flickr: z.enum(externalEmbedOptions).optional(),
      bandcamp: z.enum(externalEmbedOptions).optional(),
    })
    .optional(),
  invites: z.object({
    copiedInvites: z.array(z.string()),
  }),
  onboarding: z.object({
    step: z.string(),
  }),
  hiddenPosts: z.array(z.string()).optional(), // should move to server
  useInAppBrowser: z.boolean().optional(),
  /** @deprecated */
  lastSelectedHomeFeed: z.string().optional(),
  pdsAddressHistory: z.array(z.string()).optional(),
  disableHaptics: z.boolean().optional(),
  disableAutoplay: z.boolean().optional(),
  kawaii: z.boolean().optional(),
  hasCheckedForStarterPack: z.boolean().optional(),
  subtitlesEnabled: z.boolean().optional(),
  /** @deprecated */
  mutedThreads: z.array(z.string()),
  trendingDisabled: z.boolean().optional(),
  trendingVideoDisabled: z.boolean().optional(),
})
export type Schema = z.infer<typeof schema>

const configuredProjectAppViewDid =
  process.env.EXPO_PUBLIC_APPVIEW_SERVICE_DID ||
  (__DEV__ ? 'did:plc:dw4kbjf5mn7nhenabiqpkyh3' : 'did:example:unconfigured-appview')
const configuredProjectAppViewEndpoint =
  process.env.EXPO_PUBLIC_PUBLIC_APPVIEW_URL ||
  process.env.EXPO_PUBLIC_APPVIEW_ENDPOINT ||
  (__DEV__ ? 'http://localhost:2584' : 'https://appview.invalid')
const configuredProjectAppViewHealthPath =
  process.env.EXPO_PUBLIC_APPVIEW_HEALTH_PATH || '/xrpc/_health'
export const defaults: Schema = {
  appviewProviders: [
    {
      id: 'project-appview',
      displayName:
        process.env.EXPO_PUBLIC_APPVIEW_DISPLAY_NAME || 'Project AppView',
      serviceDid: configuredProjectAppViewDid,
      serviceFragment:
        process.env.EXPO_PUBLIC_APPVIEW_SERVICE_FRAGMENT || 'bsky_appview',
      endpoint: configuredProjectAppViewEndpoint,
      healthPath: configuredProjectAppViewHealthPath,
      builtin: true,
      enabled: configuredProjectAppViewEndpoint !== 'https://appview.invalid',
    },
  ],
  appviewSelections: {},
  appviewFallbacks: {},
  threadCurationView: 'all',
  colorMode: 'system',
  darkTheme: 'dim',
  session: {
    accounts: [],
    currentAccount: undefined,
  },
  reminders: {
    lastEmailConfirm: undefined,
  },
  languagePrefs: {
    primaryLanguage: deviceLanguageCodes[0] || 'en',
    contentLanguages: deviceLanguageCodes || [],
    postLanguage: deviceLanguageCodes[0] || 'en',
    postLanguageHistory: (deviceLanguageCodes || [])
      .concat(['en', 'ja', 'pt', 'de'])
      .slice(0, 6),
    // try full language tag first, then fallback to language code
    appLanguage: findSupportedAppLanguage([
      deviceLocales.at(0)?.languageTag,
      deviceLanguageCodes[0],
    ]),
  },
  requireAltTextEnabled: false,
  largeAltBadgeEnabled: false,
  externalEmbeds: {},
  mutedThreads: [],
  invites: {
    copiedInvites: [],
  },
  onboarding: {
    step: 'Home',
  },
  hiddenPosts: [],
  useInAppBrowser: undefined,
  lastSelectedHomeFeed: undefined,
  pdsAddressHistory: [],
  disableHaptics: false,
  disableAutoplay: PlatformInfo.getIsReducedMotionEnabled(),
  kawaii: false,
  hasCheckedForStarterPack: false,
  subtitlesEnabled: true,
  trendingDisabled: false,
  trendingVideoDisabled: false,
}

export function tryParse(rawData: string): Schema | undefined {
  let objData
  try {
    objData = JSON.parse(rawData)
  } catch (e) {
    logger.error('persisted state: failed to parse root state from storage', {
      message: e,
    })
  }
  if (!objData) {
    return undefined
  }
  const parsed = schema.safeParse(objData)
  if (parsed.success) {
    return objData
  } else {
    const errors =
      parsed.error?.errors?.map(e => ({
        code: e.code,
        // @ts-ignore exists on some types
        expected: e?.expected,
        path: e.path?.join('.'),
      })) || []
    logger.error(`persisted store: data failed validation on read`, {errors})
    return undefined
  }
}

export function tryStringify(value: Schema): string | undefined {
  try {
    schema.parse(value)
    return JSON.stringify(value)
  } catch (e) {
    logger.error(`persisted state: failed stringifying root state`, {
      message: e,
    })
    return undefined
  }
}
