/**
 * Retry a read without viewer credentials against the same selected provider.
 * This is a public-read fallback, not provider substitution.
 */
export async function callSameProviderPublicFallback<T>(
  authenticatedRead: () => Promise<T>,
  publicRead: () => Promise<T>,
): Promise<T> {
  try {
    return await authenticatedRead()
  } catch {
    return publicRead()
  }
}
