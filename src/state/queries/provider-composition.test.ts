import {describe, expect, it} from '@jest/globals'

import {
  ProviderCompositionError,
  type ProviderCompositionResult,
} from '#/lib/provider-composition'
import {requireComposedProviderValue} from './provider-composition'

describe('requireComposedProviderValue', () => {
  it('retains the complete composition when policy refuses a value', () => {
    const composition: ProviderCompositionResult<{id: string}> = {
      surface: 'profiles',
      policy: {mode: 'require-agreement'},
      status: 'disagreement',
      observations: [],
      selectedValues: [],
      selectedProviderIds: [],
      distinctResultKeys: ['provider-a', 'provider-b'],
      declaredOperatorIds: [],
      independence: 'not-established',
    }

    expect(() => requireComposedProviderValue(composition)).toThrow(
      ProviderCompositionError,
    )

    try {
      requireComposedProviderValue(composition)
      throw new Error('expected provider composition to fail closed')
    } catch (error) {
      expect(error).toBeInstanceOf(ProviderCompositionError)
      expect(
        (error as ProviderCompositionError<{id: string}>).composition,
      ).toBe(composition)
    }
  })
})
