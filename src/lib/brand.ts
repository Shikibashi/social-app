const DEFAULT_PRODUCT_NAME = 'Edriffles'
const DEFAULT_PUBLIC_WEB_ORIGIN = 'https://social.edriffles.us'

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
