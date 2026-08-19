import {app} from '#/lexicons'
import * as bsky from '#/types/bsky'
import {type Embed, parseEmbed} from '#/types/bsky/post'

function collectParsedEmbedText(embed: Embed, output: string[]) {
  switch (embed.type) {
    case 'post':
      if (bsky.isType(app.bsky.feed.post, embed.view.value)) {
        output.push(embed.view.value.text)
      }
      return
    case 'post_with_media':
      collectParsedEmbedText(embed.view, output)
      collectParsedEmbedText(embed.media, output)
      return
    case 'link':
      output.push(embed.view.external.title)
      if (embed.view.external.description) {
        output.push(embed.view.external.description)
      }
      return
    case 'images':
      output.push(...embed.view.images.map(image => image.alt))
      return
    case 'gallery':
      output.push(
        ...embed.view.items
          .filter(item => bsky.isType(app.bsky.embed.gallery.viewImage, item))
          .map(image => image.alt),
      )
      return
    case 'video':
      if (embed.view.alt) output.push(embed.view.alt)
      return
    default:
      return
  }
}

/**
 * Text visibly associated with a feed post. Local policy and curation use
 * this without transmitting the user's preferences to the provider.
 */
export function getFeedCandidateText(
  recordText: string,
  embed: app.bsky.feed.defs.PostView['embed'],
): string {
  const output = [recordText]
  collectParsedEmbedText(parseEmbed(embed), output)
  return output.filter(Boolean).join('\n')
}
