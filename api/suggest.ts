import type { VercelRequest, VercelResponse } from '@vercel/node';
import * as cheerio from 'cheerio';
import { Impit } from 'impit';

export default async function handler(
  req: VercelRequest,
  res: VercelResponse
) {
  const { url } = req.query;

  if (typeof url !== 'string' || !url) {
    return res.status(400).json({ error: 'URL parameter is required' });
  }

  try {
    // --- Create an Impit client with impersonation settings ---
    const client = new Impit({
      browser: 'chrome116', // Specify browser profile here
      timeout_ms: 30000,
      // proxyUrl: '...', // Optional proxy
    });
    console.log(`Fetching suggestions with impit.fetch (impersonating ${client.browser}): ${url}`);

    // --- Use client.fetch ---
    const response = await client.fetch(url, {
      method: 'GET',
      // No 'impersonate' or 'timeout_ms' needed here
    });
    // --- End of impit usage ---

    if (!response.ok) {
      let errorBody = '';
      try { errorBody = await response.text(); } catch { /* ignore */ }
      console.error(`Impit suggestion fetch failed: Status ${response.status}, Body: ${errorBody.substring(0, 500)}`);
      throw new Error(`Failed to fetch for suggestions: ${response.status} ${response.statusText} from ${url}`);
    }

    const html = await response.text();
    const $ = cheerio.load(html);

    // --- Keep your existing scoring logic ---
    const scores = new Map<string, number>();
    const forbiddenTags = 'nav, header, footer, aside, script, style, form, button, a, ul, li, iframe, figure, figcaption, input, textarea, select, option';

    $('body').find('div, article, section, main, p').each((_, el) => {
        const $el = $(el);
        if ($el.is(forbiddenTags) || $el.parents(forbiddenTags).length > 0) return;

        const id = $el.attr('id');
        const className = $el.attr('class');
        const isLikelyContentContainer = (id && (id.includes('content') || id.includes('article') || id.includes('chapter'))) || (className && (className.includes('content') || className.includes('article') || className.includes('chapter')));
        const directTextLength = $el.contents().filter((_, node) => node.type === 'text').text().trim().length;
        const pCount = $el.find('p').length;

        if (directTextLength < 50 && pCount < 1 && !isLikelyContentContainer) return;

        const linkCount = $el.find('a').length;
        const childElementCount = $el.children().length;
        let score = (directTextLength * 0.5) + (pCount * 30) - (linkCount * 10) - (childElementCount * 0.1);

        if (id === 'novel_content' || id === 'content' || id === 'chapter-content' || id === 'article' || id === 'main-content') score += 10000;
        if (className && (className.includes('content') || className.includes('chapter-body') || className.includes('article-body') || className.includes('main-text') || className.includes('entry-content'))) score += 500;
        if (pCount > 5) score += (pCount * 15);
        if (id && (id.includes('sidebar') || id.includes('comment'))) score -= 5000;
        if (className && (className.includes('sidebar') || className.includes('comment'))) score -= 5000;

        if (score > 80) {
            let selector: string | null = null;
            const currentId = $el.attr('id');
            const currentClass = $el.attr('class');

            if (currentId && !$el.parents(`[id="${currentId}"]`).length && /^[a-zA-Z][a-zA-Z0-9_-]*$/.test(currentId)) {
                try {
                    const escapedId = currentId.replace(/([^\\])\./g, '$1\\.');
                    if ($(`#${escapedId}`).length === 1) selector = `#${currentId}`;
                } catch (e) { console.warn(`Invalid ID selector generated or failed check: #${currentId}`); }
            }
            if (!selector && currentClass && (score > 300 || pCount > 3 || directTextLength > 500)) {
                const firstClass = currentClass.trim().split(/\s+/).find(cls => /^[a-zA-Z_-][a-zA-Z0-9_-]*$/.test(cls) && cls.length > 2);
                if (firstClass) {
                    const classSelector = `.${firstClass}`;
                    try {
                        const matches = $(classSelector);
                        if (matches.length >= 1 && matches.length <= 5 && (matches.is($el) || matches.find($el).length > 0)) selector = classSelector;
                    } catch (e) { console.warn(`Invalid class selector generated or failed check: ${classSelector}`); }
                }
            }

            if (selector) {
                try { if ($(selector).length === 1) score += 100; } catch { /* ignore */ }
                const existingScore = scores.get(selector) ?? -Infinity;
                if (score > existingScore) scores.set(selector, score);
            }
        }
    });

     const filteredScores = new Map<string, number>();
     for (const [selector, score] of scores.entries()) {
         try {
             if ($(selector).length <= 10 || (score > 5000 && $(selector).length <= 20)) filteredScores.set(selector, score);
             else console.log(`Filtering out broad selector: ${selector} (matches ${$(selector).length})`);
         } catch { /* ignore */ }
     }

    const sortedCandidates = [...filteredScores.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(entry => entry[0]);

    const suggestions = new Set<string>([
        '#content', '#novel_content', '.entry-content', '#main-content',
        ...sortedCandidates,
        '.chapter-content', 'article', '.article-body', '.content', '.main-text'
    ]);

    const finalSuggestions = Array.from(suggestions).slice(0, 7);
    // --- End of scoring logic ---

    res.setHeader('Cache-Control', 's-maxage=10, stale-while-revalidate=59');
    res.status(200).json(finalSuggestions);

  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown suggestion error occurred';
    console.error(`Suggest failed for URL: ${url}`, error);
    res.status(500).json({ error: `Failed to get suggestions for ${url}. Reason: ${message}` });
  }
}
