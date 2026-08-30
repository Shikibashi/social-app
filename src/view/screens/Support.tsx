import {msg} from '@lingui/core/macro'
import {useLingui} from '@lingui/react'
import {Trans} from '@lingui/react/macro'

import {HELP_DESK_URL} from '#/lib/constants'
import {usePalette} from '#/lib/hooks/usePalette'
import {
  type CommonNavigatorParams,
  type NativeStackScreenProps,
} from '#/lib/routes/types'
import {s} from '#/lib/styles'
import {TextLink} from '#/view/com/util/Link'
import {Text} from '#/view/com/util/text/Text'
import {ViewHeader} from '#/view/com/util/ViewHeader'
import {CenteredView} from '#/view/com/util/Views'
import * as Layout from '#/components/Layout'

type Props = NativeStackScreenProps<CommonNavigatorParams, 'Support'>
export const SupportScreen = (_props: Props) => {
  const pal = usePalette('default')
  const {_} = useLingui()

  return (
    <Layout.Screen>
      <ViewHeader title={_(msg`Support`)} />
      <CenteredView>
        <Text type="title-xl" style={[pal.text, s.p20, s.pb5]}>
          <Trans>Support</Trans>
        </Text>
        <Text style={[pal.text, s.p20]}>
          <Trans>
            The hosting provider's support form is available here. If you need
            help, please{' '}
            <TextLink
              href={HELP_DESK_URL}
              text={_(msg`open the hosting provider's support form`)}
              style={pal.link}
            />
            .
          </Trans>
        </Text>
      </CenteredView>
    </Layout.Screen>
  )
}
