const DEFAULT_PRODUCT_NAME = 'Plumbline'
const DEFAULT_PUBLIC_WEB_ORIGIN = 'https://plumblines.uk'

/** The identity accent used by the Plumbline mark and alignment markers. */
export const PLUMBLINE_BRASS = '#B79A5A'

/**
 * Plumbline's masthead motto records the phrase Tucker used for Liberty's
 * banner. The phrase itself predates Tucker; this is an attribution of use,
 * not a claim that he originated the wording.
 */
export const PLUMBLINE_TUCKER_MOTTO = 'Liberty the Mother of Order'
export const PLUMBLINE_TUCKER_MOTTO_CITATION =
  'Benjamin R. Tucker · Liberty masthead motto'

/**
 * Keep the longer historical quotation for the About surface, where its
 * argument can be read without crowding the masthead.
 */
export const PLUMBLINE_TUCKER_SELF_GOVERNMENT_QUOTE =
  'The right of self-government means with me the right of every individual to govern himself, or it means nothing.'
export const PLUMBLINE_TUCKER_SELF_GOVERNMENT_CITATION =
  'Benjamin R. Tucker · Liberty, Vol. V, No. 22'

export function resolveProductName(value: string | undefined): string {
  const name = value?.trim()
  return name && name.length <= 64 ? name : DEFAULT_PRODUCT_NAME
}

export function resolvePublicWebOrigin(value: string | undefined): string {
  const candidate = value?.trim()
  if (!candidate) return DEFAULT_PUBLIC_WEB_ORIGIN

  try {
    const url = new URL(candidate)
    const isLocalDevelopmentHost =
      url.hostname === 'localhost' ||
      url.hostname === '127.0.0.1' ||
      url.hostname === '::1'
    if (url.protocol !== 'https:' && !isLocalDevelopmentHost) {
      return DEFAULT_PUBLIC_WEB_ORIGIN
    }
    return url.origin
  } catch {
    return DEFAULT_PUBLIC_WEB_ORIGIN
  }
}

/**
 * Keep a hosted production shell bound to its real public origin even when a
 * stale local build variable was accidentally carried into the bundle. Local
 * development origins remain configurable; only the canonical web deployment
 * gets this runtime correction.
 */
export function resolveRuntimePublicWebOrigin(
  configuredOrigin: string,
  runtimeOrigin: string | undefined,
): string {
  return runtimeOrigin === DEFAULT_PUBLIC_WEB_ORIGIN
    ? DEFAULT_PUBLIC_WEB_ORIGIN
    : configuredOrigin
}

export const PRODUCT_NAME = resolveProductName(
  process.env.EXPO_PUBLIC_BRAND_NAME,
)

// Keep the display wordmark faithful to the public product name. Individual
// shells may apply their own deliberate casing, but the shared mark must not
// silently turn "Plumbline" into an all-lowercase fallback.
export const PRODUCT_WORDMARK = PRODUCT_NAME

export const PUBLIC_WEB_ORIGIN = resolvePublicWebOrigin(
  process.env.EXPO_PUBLIC_PUBLIC_WEB_ORIGIN,
)

export function getRuntimePublicWebOrigin(): string {
  return resolveRuntimePublicWebOrigin(
    PUBLIC_WEB_ORIGIN,
    typeof window === 'undefined' || !window.location
      ? undefined
      : window.location.origin,
  )
}
