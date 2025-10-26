//
// ---------------------------------------------------
// --- FINAL FILE: api/suggest.ts --------------------
// ---------------------------------------------------
//
import type { VercelRequest, VercelResponse } from '@vercel/node';
import * as cheerio from 'cheerio';

const FAKE_USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36';

// This free proxy will be used for all requests to bypass IP blocks
const PROXY_URL = 'https://api.codetabs.com/v1/proxy?quest=';

export default async function handler(
  req: VercelRequest,
  res: VercelResponse
) {
  const { url } = req.query;

  if (typeof url !== 'string' || !url) {
    return res.status(400).json({ error: 'URL parameter is required' });
  }

  try {
    // Always build the proxy URL for every request
    // --- THIS IS THE FIX ---
    // The target URL MUST be encoded to ensure its query parameters (like &)
    // are treated as part of the proxy's 'quest' value, not as new
    // parameters for the proxy request itself.
    const fetchUrl = PROXY_URL + encodeURIComponent(url);

    // Always send these headers.
    const fetchOptions = {
      headers: { 
        'User-Agent': FAKE_USER_AGENT,
        'Referer': 'https://www.google.com/' 
      }
    };

    console.log(`Fetching for suggest via proxy: ${fetchUrl}`);
    const response = await fetch(fetchUrl, fetchOptions);

    if (!response.ok) {
      if (response.status === 403) {
           throw new Error(`Failed to fetch: 403 Forbidden. The site is blocking the proxy. You may need to try a different proxy URL in /api/suggest.ts.`);
      }
      throw new Error(`Failed to fetch: ${response.status} ${response.statusText} from ${fetchUrl}`);
    }

    const html = await response.text();
    const $ = cheerio.load(html);

    // Scoring logic (with your bug fix + enhancements for booktoki)
    const scores = new Map<string, number>();
    const forbiddenTags = 'nav, header, footer, aside, script, style, form, button, a, ul, li, iframe, figure, figcaption';

    $('body').find('div, article, section, main').each((i, el) => {
      const $el = $(el);

      if ($el.parents(forbiddenTags).length > 0) {
        return;
      }

      const directTextLength = $el.contents().filter((i, node) => node.type === 'text')
        .text().trim().length;

      // Relaxed this condition to catch more possibilities
      if (directTextLength < 50 && $el.find('p').length < 1) return;

      const pCount = $el.find('p').length;
      // Fixed the bug where you had 'a.'
      const linkCount = $el.find('a').length; 

      let score = (directTextLength * 0.5) + (pCount * 20) - (linkCount * 5); // Prioritize <p> tags

      // --- ENHANCEMENT: Boost good selectors ---
      const id = $el.attr('id');
      if (id === 'novel_content' || id === 'content' || id === 'chapter-content' || id === 'article') {
          score += 10000; // Heavily boost common content IDs
      }
      const className = $el.attr('class');
      if (className && (className.includes('content') || className.includes('chapter-body') || className.includes('article-body'))) {
          score += 500; // Also boost common content classes
      }
      // Give even more points if it contains paragraphs, like booktoki
      if(pCount > 5) {
          score += (pCount * 10);
      }
      // --- END OF ENHANCEMENT ---

      if (score > 100) {
        let selector: string | null = null;
        
        if (id) {
          if ($(`#${id}`).length === 1) {
            selector = `#${id}`;
          }
        } else if (className) {
          // Use the first class only for simplicity
          const firstClass = className.trim().split(/\s+/)[0];
          if (firstClass) {
            const classSelector = `.${firstClass}`;
            try {
              if ($(classSelector).length === 1) {
                selector = classSelector;
              }
            } catch (e) { /* ignore invalid class syntax */ }
          }
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
        // Pre-pend the most likely candidates
        '#novel_content', // Specific to booktoki
        '.h3dafc73cd7', // Specific to booktoki inner div
        '#content', 
        '.content', 
        '.chapter-content', 
        'article', 
        ...sortedCandidates
    ]);

    res.setHeader('Cache-Control', 's-maxage=1, stale-while-revalidate=59');
    res.status(200).json(Array.from(suggestions).slice(0, 5));

  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown suggestion error';
    res.status(500).json({ error: message });
  }
}
