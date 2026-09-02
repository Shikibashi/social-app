import {type BalancedCandidate, type BalancedResult} from './balanced'
import {rankBalanced} from './balanced'
import {type CandidateBatch} from './candidate-protocol'
import {type ExplicitPreferences, type LearnedProfile} from './personalization'

export type ExperimentalId =
  'constructive' | 'bridging' | 'high-serendipity' | 'longform' | 'news'
export type ExperimentalManifest = {
  id: ExperimentalId
  version: '1'
  status: 'experimental'
  objective: string
  limitations: string[]
  dependencies: {
    candidateProtocol: '1'
    personalization: '1'
    constitutional: 'attention-v1'
  }
}
export const EXPERIMENTAL_MANIFESTS: Record<
  ExperimentalId,
  ExperimentalManifest
> = {
  constructive: {
    id: 'constructive',
    version: '1',
    status: 'experimental',
    objective: 'favor inspectable constructive-conversation proxies',
    limitations: ['Proxies cannot determine intent or civility reliably'],
    dependencies: {
      candidateProtocol: '1',
      personalization: '1',
      constitutional: 'attention-v1',
    },
  },
  bridging: {
    id: 'bridging',
    version: '1',
    status: 'experimental',
    objective:
      'optional exposure diversity without compulsory ideological balancing',
    limitations: [
      'Bridge proxies are incomplete and viewpoint-neutrality is not guaranteed',
    ],
    dependencies: {
      candidateProtocol: '1',
      personalization: '1',
      constitutional: 'attention-v1',
    },
  },
  'high-serendipity': {
    id: 'high-serendipity',
    version: '1',
    status: 'experimental',
    objective:
      'increase novelty and exploration while preserving hard constraints',
    limitations: ['Novelty can reduce relevance for sparse signals'],
    dependencies: {
      candidateProtocol: '1',
      personalization: '1',
      constitutional: 'attention-v1',
    },
  },
  longform: {
    id: 'longform',
    version: '1',
    status: 'experimental',
    objective: 'favor richer records and independent publishing formats',
    limitations: ['Length is not quality and format metadata may be missing'],
    dependencies: {
      candidateProtocol: '1',
      personalization: '1',
      constitutional: 'attention-v1',
    },
  },
  news: {
    id: 'news',
    version: '1',
    status: 'experimental',
    objective:
      'favor freshness, source diversity, provenance, and story-cluster diversity',
    limitations: [
      'Source reputation is provider evidence, not universal trust',
    ],
    dependencies: {
      candidateProtocol: '1',
      personalization: '1',
      constitutional: 'attention-v1',
    },
  },
}
export function rankExperimental(
  id: ExperimentalId,
  batch: CandidateBatch,
  explicit: ExplicitPreferences,
  learned: LearnedProfile,
  now?: number,
): BalancedResult {
  const candidates = (batch.candidates as BalancedCandidate[]).map(
    candidate => {
      const features = {...candidate.features}
      if (id === 'high-serendipity')
        features.novelty = Math.max(features.novelty ?? 0, 0.85)
      if (id === 'news')
        features.freshness = Math.max(features.freshness ?? 0, 0.9)
      if (id === 'longform')
        features.exploration = Math.max(features.exploration ?? 0, 0.7)
      if (id === 'constructive')
        features.integrity = Math.max(features.integrity ?? 0, 0.65)
      if (id === 'bridging')
        features.novelty = Math.max(features.novelty ?? 0, 0.65)
      return {...candidate, features}
    },
  )
  return rankBalanced({...batch, candidates}, explicit, learned, {now})
}
