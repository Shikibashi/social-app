import  {type Embed} from '#/types/bsky/post'

/**
 * Keep the provider's blocked-record placeholder out of the media branch.
 * Record embeds have a separate hydration path in Embed/index.tsx so a
 * pairwise block between unrelated actors does not hide a quote from us.
 */
export function shouldSuppressEmbed(embed: Pick<Embed, 'type'>): boolean {
  return embed.type === 'post_blocked'
}
