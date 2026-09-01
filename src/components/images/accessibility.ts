/**
 * Image records may omit alt text. Interactive image controls still need an
 * accessible name so that opening an image is discoverable to every user.
 */
export function getImageAccessibilityLabel(
  alt: string | null | undefined,
  fallback: string,
): string {
  return alt?.trim() || fallback
}
