import {createMMKV} from 'react-native-mmkv'

import {type DB} from '#/storage/archive/db/types'

export function create({id}: {id: string}): DB {
  const store = createMMKV({id})

  return {
    get(key: string) {
      return store.getString(key)
    },
    set(key: string, value: string) {
      return store.set(key, value)
    },
    delete(key: string) {
      store.remove(key)
    },
    clear() {
      return store.clearAll()
    },
  }
}
