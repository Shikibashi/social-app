import {IS_DEV} from '#/env'
import {type Geolocation} from '#/geolocation/types'

const localEnabled = false
export const enabled = IS_DEV && localEnabled
export const geolocation: Geolocation = {
  countryCode: 'AA',
  regionCode: undefined,
}

const deviceLocalEnabled = false
export const deviceGeolocation: Geolocation | undefined = deviceLocalEnabled
  ? {
      countryCode: 'AA',
      regionCode: undefined,
    }
  : undefined

export async function resolve<T>(data: T) {
  await new Promise(y => setTimeout(y, 500)) // simulate network
  return data
}
