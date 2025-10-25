//
// ---------------------------------------------------
// --- NEW FILE: api/suggest.ts ----------------------
// ---------------------------------------------------
//
import type { VercelRequest, VercelResponse } from '@vercel/node';
import * as cheerio from 'cheerio';

const FAKE_USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36';

export default async function handler(
  req: VercelRequest,
  res: VercelResponse
) {
  const { url } = req.query;

  if (typeof url !== 'string' || !url) {
    return res.status(400).json({ error: 'URL parameter is required' });
  }

  try {
    const response = await fetch(url, {
      headers: { 'User-Agent': FAKE_USER_AGENT }
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch: ${response.status} ${response.statusText}`);
    }

    const html = await response.text();
    const $ = cheerio.load(html);

    // --- Re-implementing your exact scoring logic from scraperService.ts ---
    const scores = new Map<string, number>();
    const forbiddenTags = 'nav, header, footer, aside, script, style, form, button, a, ul, li, iframe, figure, figcaption';

    $('body').find('div, article, section, main').each((i, el) => {
      const $el = $(el);

      if ($el.parents(forbiddenTags).length > 0) {
        return;
      }

      const directTextLength = $el.contents().filter((i, node) => node.type === 'text')
        .text().trim().length;

      if (directTextLength < 100) return;

      const pCount = $el.find('p').length;
      const linkCount = $el.find('a').length;

      let score = (directTextLength * 1.0) + (pCount * 10) - (linkCount * 5);

      if (score > 100) {
        let selector: string | null = null;
        const id = $el.attr('id');
        const className = $el.attr('class');

        if (id) {
          if ($(`#${id}`).length === 1) {
            selector = `#${id}`;
          }
        } else if (className) {
          const classSelector = `.${className.trim().split(/\s+/).filter(Boolean).join('.')}`;
          try {
            if ($(classSelector).length === 1) {
              selector = classSelector;
            }
          } catch (e) { /* ignore invalid class syntax */ }
        }
        
        if (selector) {
            scores.set(selector, score);
        }
      }
    });

    const sortedCandidates = [...scores.entries()]
      .sort((a, b) => b[1] - a[1]) 
      .map(entry => entry[0]);     

    const suggestions = new Set<string>([
        '#content', 
        '.content', 
        '.chapter-content', 
        'article', 
        ...sortedCandidates
    ]);
    // -----------------------------------------------------------------

    res.setHeader('Cache-Control', 's-maxage=1, stale-while-revalidate=59');
    res.status(200).json(Array.from(suggestions).slice(0, 5));

  } catch (error)
 {
    const message = error instanceof Error ? error.message : 'Unknown suggestion error';
    res.status(500).json({ error: message });
  }
}