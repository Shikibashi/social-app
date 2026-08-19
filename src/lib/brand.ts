const DEFAULT_PRODUCT_NAME = 'Social'
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

export const PRODUCT_NAME = resolveProductName(
  process.env.EXPO_PUBLIC_BRAND_NAME,
)

export const PUBLIC_WEB_ORIGIN = resolvePublicWebOrigin(
  process.env.EXPO_PUBLIC_PUBLIC_WEB_ORIGIN,
)
