import type { VercelRequest, VercelResponse } from '@vercel/node';
import * as cheerio from 'cheerio';
import { Impit } from 'impit';
import { ScrapedChapter } from '../types';

// --- OXYLABS SCRAPER API SETUP ---
const OXYLABS_USER = process.env.OXYLABS_USER;
const OXYLABS_PASS = process.env.OXYLABS_PASS;
const OXYLABS_API_URL = 'https://realtime.oxylabs.io/v1/queries';

/**
 * Creates the Basic Authentication header for Oxylabs.
 */
function getOxylabsAuth(): string {
  if (!OXYLABS_USER || !OXYLABS_PASS) {
    throw new Error('Oxylabs username or password is not configured in environment variables.');
  }
  return 'Basic ' + Buffer.from(`${OXYLABS_USER}:${OXYLABS_PASS}`).toString('base64');
}

/**
 * Fetches the raw HTML of a URL using the Oxylabs Scraper API.
 * This is used to bypass Cloudflare and other bot-detection.
 */
async function fetchWithOxylabs(url: string): Promise<string> {
  const payload = {
    source: 'universal', // Use 'universal' for scraping specific URLs
    url: url,
    render: 'html',     // Ask Oxylabs to render JavaScript (solves Cloudflare)
    parse: false        // We will parse the HTML ourselves with Cheerio
  };

  const response = await fetch(OXYLABS_API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': getOxylabsAuth()
    },
    body: JSON.stringify(payload)
  });

  if (!response.ok) {
    const errorBody = await response.text();
    console.error(`Oxylabs API failed: Status ${response.status}, Body: ${errorBody.substring(0, 500)}`);
    throw new Error(`Failed to fetch from Oxylabs: ${response.status} ${response.statusText}`);
  }

  const data = await response.json();
  
  // The raw HTML is in the 'content' field of the first result
  const html = data?.results?.[0]?.content;
  if (!html) {
    console.error('Oxylabs response did not contain HTML content.', data);
    throw new Error('Failed to get HTML from Oxylabs response.');
  }
  
  return html;
}
// --- END OXYLABS ---


// --- SELECTORS AND HELPERS (Unchanged) ---
const nextLinkSelectors = [
  "a:contains('Next Chapter')", "a:contains('next chapter')", "a:contains('Next')",
  "a:contains('next')", "a[rel='next']", "a.next-page", "a.nav-next",
  "a#next_chap", "a.btn-next", "a:contains('下一章')", "a:contains('下章')",
  "a:contains('다음화')", "a:contains('다음 편')", "#goNextBtn"
].join(', ');

const prevLinkSelectors = [
  "a:contains('Previous Chapter')", "a:contains('previous chapter')", "a:contains('Previous')",
  "a:contains('previous')", "a[rel='prev']", "a.prev-page", "a.nav-previous",
  "a#prev_chap", "a.btn-prev", "a:contains('上一章')", "a:contains('上章')",
  "a:contains('이전화')", "a:contains('이전 편')", "#goPrevBtn"
].join(', ');

const onPageTitleSelectors = [
  '.chapter-title', '#chapter-title', "*:contains('分卷阅读')", "*:contains('Chapter ')",
  "*:contains('CHAPTER ')", "*:contains('第')", '.content-title', '.entry-title',
  'h1', 'h2', '.toon-title'
].join(', ');

function resolveUrl(baseUrl: string, relativeUrl: string | undefined): string | null {
  if (!relativeUrl) return null;
  if (relativeUrl.startsWith('http://') || relativeUrl.startsWith('https://')) {
    try { new URL(relativeUrl); return relativeUrl; } catch (_) { console.warn(`Found invalid absolute URL: ${relativeUrl}`); return null; }
  }
  if (relativeUrl.startsWith('//')) {
      try { const base = new URL(baseUrl); return `${base.protocol}${relativeUrl}`; } catch (e) { console.warn(`Invalid base URL for protocol-relative URL: base='${baseUrl}', relative='${relativeUrl}', Error: ${e}`); return null; }
  }
  try { return new URL(relativeUrl, baseUrl).href; } catch (e) { console.warn(`Invalid URL resolution: base='${baseUrl}', relative='${relativeUrl}', Error: ${e}`); return null; }
}

// --- MAIN HANDLER ---
export default async function handler(
  req: VercelRequest,
  res: VercelResponse
) {
  const { url, selector, useProxy } = req.query;

  if (typeof url !== 'string' || !url) {
    return res.status(400).json({ error: 'URL parameter is required' });
  }
  if (typeof selector !== 'string' || !selector) {
    return res.status(400).json({ error: 'Selector parameter is required' });
  }

  const allTitleSelectors = [
      onPageTitleSelectors, `${selector} h1`, `${selector} h2`, `${selector} h3`,
  ].join(', ');

  try {
    let html: string;

    if (useProxy === 'true') {
      // --- Use Oxylabs Scraper API to bypass Cloudflare ---
      console.log(`Fetching with Oxylabs Scraper API for URL: ${url}`);
      html = await fetchWithOxylabs(url);
    } else {
      // --- MODIFIED BLOCK: Use standard fetch (no proxy) for simple sites ---
      console.log(`Fetching with standard fetch (no proxy): ${url}`);

      const response = await fetch(url, {
        method: 'GET',
        headers: {
          // Add a basic user-agent just in case
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/100.0.4896.127 Safari/537.36'
        }
      });

      if (!response.ok) {
          let errorBody = '';
          try { errorBody = await response.text(); } catch { /* ignore */ }
          console.error(`Standard fetch failed: Status ${response.status}, Body: ${errorBody.substring(0, 500)}`);
          throw new Error(`Failed to fetch: ${response.status} ${response.statusText} from ${url}`);
      }
      html = await response.text();
    }
    
    // --- PARSING LOGIC (Runs on HTML from either source) ---
    const $ = cheerio.load(html);

    const $content = $(selector);

    if ($content.length === 0) {
        throw new Error(`Content not found. The selector "${selector}" did not match any elements on the page ${url}. Try using the "Suggest" button.`);
    }

    const junkSelectors = [
        "*:contains('请在')", "*:contains('read at')", "*:contains('最新章节')",
        "*:contains('本站域名')", "*:contains('Advertisement')", "*:contains('章节报错')",
        "*:contains('Please support our website')", "*:contains('Share this chapter')",
        "script", "style", "iframe", ".ads", "#ads", "[class*='advert']",
        "[id*='advert']", ".ad", ".advertisement", "#ad-container",
        "#comments", ".comment-section", ".post-comments"
    ];
    $content.find(junkSelectors.join(', ')).remove();

    const paragraphs: string[] = [];
    const $paragraphs = $content.find('p');
    if ($paragraphs.length > 3 && $content.text().length > 200) {
        console.log(`Found ${$paragraphs.length} <p> tags...`);
        $paragraphs.each((_, el) => {
            const text = $(el).text().trim();
            if (text && text.length > 0 && !text.toLowerCase().includes('advertisement')) paragraphs.push(text);
        });
    }

    if (paragraphs.length < 3) {
        console.log("Using fallback text extraction...");
        paragraphs.length = 0;
        $content.contents().each((_, el) => {
            const $el = $(el);
            let text = '';
            if (el.type === 'tag') {
                if (el.name === 'div' || el.name === 'section' || el.name === 'article') text = $el.text().trim();
                else if (el.name === 'br' && paragraphs.length > 0 && paragraphs[paragraphs.length - 1] !== '') paragraphs.push('');
            } else if (el.type === 'text') text = $el.text().trim();
            if (text && text.length > 0 && !text.toLowerCase().includes('advertisement') && (paragraphs.length === 0 || paragraphs[paragraphs.length - 1] !== text)) paragraphs.push(text);
        });
    }
    const finalParagraphs = paragraphs.filter(p => p.trim().length > 0);
    const finalContent = finalParagraphs.join('\n\n');

    const onPageTitle = $(allTitleSelectors).first().text().trim() || "Unknown Chapter";
    const nextUrl = resolveUrl(url, $(nextLinkSelectors).first().attr('href'));
    const prevUrl = resolveUrl(url, $(prevLinkSelectors).first().attr('href'));

    let chapterNumber: number | null = null;
    const combinedMatchers = [ /chapter[_-]?\s*(\d+)/i, /第\s*(\d+)\s*[章話篇]/, /(\d+)\s*화/, /分卷阅读\s*(\d+)/, /\/(\d+)\.html$/i, /\/(\d+)\/?$/, /\/novel\/(\d+)/i, /view_?num=(\d+)/i ];
    for (const regex of combinedMatchers.slice(0, 4)) { const titleMatch = onPageTitle.match(regex); if (titleMatch && titleMatch[1]) { chapterNumber = parseInt(titleMatch[1], 10); break; }}
    if (!chapterNumber) { for (const regex of combinedMatchers.slice(4)) { const urlMatch = url.match(regex); if (urlMatch && urlMatch[1]) { chapterNumber = parseInt(urlMatch[1], 10); break; }}}
    console.log(`Extracted Chapter Number: ${chapterNumber}`);

    const contentToReturn = finalContent || `Content not found with selector ("${selector}") on ${url} or was empty after cleaning.`;

    const scrapedData: ScrapedChapter = {
      title: onPageTitle,
      chapterNumber,
      content: contentToReturn,
      nextUrl,
      prevUrl,
    };

    res.setHeader('Cache-Control', 's-maxage=10, stale-while-revalidate=59');
    res.status(200).json(scrapedData);

  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown scraping error occurred';
    console.error(`Scraping failed for URL: ${url}`, error);
    // --- THIS IS THE CORRECTED LINE ---
    res.status(500).json({ error: `Failed to scrape chapter content from ${url}. Reason: ${message}` });
  }
}
