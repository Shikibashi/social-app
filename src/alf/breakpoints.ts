import {useMemo} from 'react'
import {useMediaQuery} from 'react-responsive'

export type Breakpoint = 'gtPhone' | 'gtMobile' | 'gtTablet'

export function useBreakpoints(): Record<Breakpoint, boolean> & {
  activeBreakpoint: Breakpoint | undefined
} {
  const gtPhone = useMediaQuery({minWidth: 500})
  const gtMobile = useMediaQuery({minWidth: 800})
  const gtTablet = useMediaQuery({minWidth: 1300})
  return useMemo(() => {
    let active: Breakpoint | undefined
    if (gtTablet) {
      active = 'gtTablet'
    } else if (gtMobile) {
      active = 'gtMobile'
    } else if (gtPhone) {
      active = 'gtPhone'
    }
    return {
      activeBreakpoint: active,
      gtPhone,
      gtMobile,
      gtTablet,
    }
  }, [gtPhone, gtMobile, gtTablet])
}

/**
 * Fine-tuned breakpoints for the shell layout
 */
export function useLayoutBreakpoints() {
  const rightNavVisible = useMediaQuery({minWidth: 1100})
  const centerColumnOffset = useMediaQuery({minWidth: 1100, maxWidth: 1300})
  // Keep the labeled Navigator visible while the three-pane workbench still
  // fits. The compact rail is the fallback for genuinely narrow desktop
  // widths, not the default for a viewport that still has an Inspector.
  // Page Mode has room for the labeled Index exactly when the marginal
  // Inspector is present. Keeping these thresholds aligned avoids an empty
  // desktop gutter between the compact rail and the reading surface.
  const leftNavMinimal = useMediaQuery({maxWidth: 1099})

  return {
    rightNavVisible,
    centerColumnOffset,
    leftNavMinimal,
  }
}
