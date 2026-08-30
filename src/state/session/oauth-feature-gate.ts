import {useCallback, useRef} from 'react'

import {useSession, useSessionApi} from '#/state/session'
import {type OAuthFeature} from '#/state/session/oauth-scopes'
import {requiresOAuthFeatureUpgrade} from './oauth-authority'

/**
 * Gate an action at its feature boundary.
 *
 * Password/app-password sessions and already-authorized OAuth sessions pass
 * without a prompt. A missing OAuth feature starts the existing consent flow
 * and resolves false only after that flow returns; callers must stop the
 * current action because its captured client may belong to the pre-consent
 * session bundle.
 */
export function useEnsureOAuthFeature() {
  const {currentAccount} = useSession()
  const {upgradeOAuthFeature} = useSessionApi()
  const pendingUpgrades = useRef(new Map<OAuthFeature, Promise<void>>())

  return useCallback(
    async (feature: OAuthFeature): Promise<boolean> => {
      const account = currentAccount
      if (!requiresOAuthFeatureUpgrade(account, feature)) {
        return true
      }

      let upgrade = pendingUpgrades.current.get(feature)
      if (!upgrade) {
        upgrade = upgradeOAuthFeature(feature)
        pendingUpgrades.current.set(feature, upgrade)
        const clearPending = () => {
          if (pendingUpgrades.current.get(feature) === upgrade) {
            pendingUpgrades.current.delete(feature)
          }
        }
        void upgrade.then(clearPending, clearPending)
      }

      await upgrade
      return false
    },
    [currentAccount, upgradeOAuthFeature],
  )
}
