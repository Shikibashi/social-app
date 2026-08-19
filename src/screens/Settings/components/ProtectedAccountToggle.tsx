import {useCallback} from 'react'
import {View} from 'react-native'
import {Trans} from '@lingui/react/macro'

import {
  useProtectedAccountMutation,
  useProtectedAccountQuery,
} from '#/state/queries/protected-account'
import {atoms as a, useTheme} from '#/alf'
import * as Toggle from '#/components/forms/Toggle'
import {Text} from '#/components/Typography'

export function ProtectedAccountToggle() {
  const t = useTheme()
  const query = useProtectedAccountQuery()
  const mutation = useProtectedAccountMutation()
  const protectedAccount = query.data?.visibility === 'protected'

  const onChange = useCallback(
    (value: boolean) => {
      mutation.mutate(value ? 'protected' : 'public')
    },
    [mutation],
  )

  if (query.isError) {
    return (
      <Text style={[a.flex_1, t.atoms.text_contrast_high]}>
        <Trans>
          Protected accounts are unavailable on this PDS. No private account
          state was changed.
        </Trans>
      </Text>
    )
  }

  return (
    <View style={[a.flex_1, a.gap_sm]}>
      <Toggle.Item
        name="protected_account"
        label="Protected account"
        value={protectedAccount}
        disabled={query.isPending || mutation.isPending}
        onChange={onChange}
        style={[a.w_full]}>
        <Toggle.LabelText style={[a.flex_1]}>
          <Trans>Protected account</Trans>
        </Toggle.LabelText>
        <Toggle.Platform />
      </Toggle.Item>
      <Text style={[a.leading_snug, t.atoms.text_contrast_high]}>
        <Trans>
          This records your protected-account policy on a compatible PDS. The
          public profile shell and existing public posts remain public. The
          current client will not silently turn an ordinary composer post or
          media upload private; private posting is only available after a
          permissioned composer is enabled.
        </Trans>
      </Text>
      {query.data ? (
        <Text style={[a.leading_snug, t.atoms.text_contrast_medium]}>
          <Trans>
            Permissioned account space: available on this PDS. Public posts and
            your public profile remain separate.
          </Trans>
        </Text>
      ) : null}
    </View>
  )
}
