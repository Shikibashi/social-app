export const SCROLLBAR_OFFSET =
  'calc(-1 * var(--removed-body-scroll-bar-size, 0px) / 2)' as `${number}%`
export const SCROLLBAR_OFFSET_POSITIVE =
  'calc(var(--removed-body-scroll-bar-size, 0px) / 2)' as `${number}%`

/**
 * Useful for visually aligning icons within header buttons with the elements
 * below them on the screen. Apply positively or negatively depending on side
 * of the screen you're on.
 */
export const BUTTON_VISUAL_ALIGNMENT_OFFSET = 3

/**
 * Corresponds to the width of a small square or round button
 */
export const HEADER_SLOT_SIZE = 33

/**
 * How far to shift the center column when the desktop workbench is between
 * the full and wide breakpoints. The smaller shift leaves room for the
 * labeled Navigator as well as the Inspector.
 */
export const CENTER_COLUMN_OFFSET = -50

/**
 * How wide the center column is
 */
export const CENTER_COLUMN_WIDTH = 600
