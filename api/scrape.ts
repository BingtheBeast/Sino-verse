//
// ---------------------------------------------------
// --- FINAL FILE: api/scrape.ts ---------------------
// ---------------------------------------------------
//
import type { VercelRequest, VercelResponse } from '@vercel/node';
import * as cheerio from 'cheerio';
import { ScrapedChapter } from '../types';

const FAKE_USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36';

// This free proxy will be used for all requests to bypass IP blocks
const PROXY_URL = 'https://api.codetabs.com/v1/proxy?quest=';

const nextLinkSelectors = [
  "a:contains('Next Chapter')", "a:contains('next chapter')",
  "a:contains('Next')", "a:contains('next')", "a[rel='next']",
  "a.next-page", "a.nav-next", "a#next_chap", "a.btn-next",
  "a:contains('下一章')", "a:contains('下章')",
  "a:contains('다음화')", "a:contains('다음 편')", // Added Korean
  "#goNextBtn" // Added for booktoki
].join(', ');

const prevLinkSelectors = [
  "a:contains('Previous Chapter')", "a:contains('previous chapter')",
  "a:contains('Previous')", "a:contains('previous')", "a[rel='prev']",
  "a.prev-page", "a.nav-previous", "a#prev_chap", "a.btn-prev",
  "a:contains('上一章')", "a:contains('上章')",
  "a:contains('이전화')", "a:contains('이전 편')", // Added Korean
  "#goPrevBtn" // Added for booktoki
].join(', ');

const onPageTitleSelectors = [
  '.chapter-title', '#chapter-title', "*:contains('分卷阅读')",
  "*:contains('Chapter ')", "*:contains('CHAPTER ')", "*:contains('第')",
  '.content-title', '.entry-title', 'h1', 'h2',
  '.toon-title' // Added for booktoki
].join(', ');

function resolveUrl(baseUrl: string, relativeUrl: string | undefined): string | null {
  if (!relativeUrl) return null;
  try {
    return new URL(relativeUrl, baseUrl).href;
  } catch (e) {
    console.warn(`Invalid URL found: ${relativeUrl}`);
    return null;
  }
}

export default async function handler(
  req: VercelRequest,
  res: VercelResponse
) {
  const { url, selector } = req.query; // This is the *original* URL

  if (typeof url !== 'string' || !url) {
    return res.status(400).json({ error: 'URL parameter is required' });
  }
  if (typeof selector !== 'string' || !selector) {
    return res.status(400).json({ error: 'Selector parameter is required' });
  }

  const allTitleSelectors = [
      onPageTitleSelectors,
      `${selector} h1`,
      `${selector} h2`,
      `${selector} h3`,
  ].join(', ');

  try {
    // Always build the proxy URL for every request
    const fetchUrl = PROXY_URL + url; // This proxy doesn't need encoding
    
    // Always send these headers. The proxy will pass them on.
    const fetchOptions = {
      headers: { 
        'User-Agent': FAKE_USER_AGENT,
        'Referer': 'https://www.google.com/' // A generic referer
      }
    };
    
    console.log(`Fetching via proxy: ${fetchUrl}`);
    const response = await fetch(fetchUrl, fetchOptions);

    if (!response.ok) {
      if (response.status === 403) {
           throw new Error(`Failed to fetch: 403 Forbidden. The site is blocking the proxy. You may need to try a different proxy URL in /api/scrape.ts.`);
      }
      throw new Error(`Failed to fetch: ${response.status} ${response.statusText} from ${fetchUrl}`);
    }

    const html = await response.text();
    const $ = cheerio.load(html);

    const $content = $(selector);
    
    if ($content.length === 0) {
        throw new Error(`Content not found. The selector "${selector}" did not match any elements on the page. Try using the "Suggest" button.`);
    }

    const junkSelectors = [
        "*:contains('请在')", 
        "*:contains('read at')", 
        "*:contains('最新章节')",
        "*:contains('本站域名')",
        "*:contains('Advertisement')",
        "*:contains('章节报错')",
        "*:contains('Please support our website')",
        "*:contains('Share this chapter')"
    ];
    
    $content.find(junkSelectors.join(', ')).remove();

    // Enhanced logic:
    // First, try to find <p> tags (for sites like booktoki)
    // If none, fall back to your original logic (for plain sites)
    const paragraphs: string[] = [];
    const $paragraphs = $content.find('p');

    if ($paragraphs.length > 1) { // Check for more than 1 to be sure
        console.log(`Found ${$paragraphs.length} <p> tags, using <p> extraction logic.`);
        $paragraphs.each((i, el) => {
            const text = $(el).text().trim();
            if (text) {
                paragraphs.push(text);
            }
        });
    } else {
        // Fallback for plain HTML sites
        console.log("No <p> tags found, using fallback text extraction.");
        $content.contents().each((i, el) => {
            const $el = $(el);
            let text = '';
            
            if (el.type === 'tag' && (el.name === 'p' || el.name === 'div')) {
                text = $el.text().trim();
            } 
            else if (el.type === 'text') {
                text = $el.text().trim();
            }
            
            if (text) {
                paragraphs.push(text);
            }
        });
    }

    const finalContent = paragraphs.join('\n\n');
    
    const onPageTitle = $(allTitleSelectors).first().text().trim() || "Unknown Chapter";
    
    // Use the *original* URL to resolve relative links
    const nextUrl = resolveUrl(url, $(nextLinkSelectors).first().attr('href'));
    const prevUrl = resolveUrl(url, $(prevLinkSelectors).first().attr('href'));

    // Enhanced chapter number logic
    let chapterNumber: number | null = null;
    let titleMatch = onPageTitle.match(/分卷阅读\s*(\d+)/) ||
                     onPageTitle.match(/chapter[_-]?\s*(\d+)/i) ||
                     onPageTitle.match(/第\s*(\d+)\s*章/) ||
                     onPageTitle.match(/(\d+)\s*화/); // Added Korean "Chapter"

    if (titleMatch) {
      chapterNumber = parseInt(titleMatch[1], 10);
    }

    if (!chapterNumber) {
      const urlMatch = url.match(/\/(\d+)\.html/i) ||
                       url.match(/\/(\d+)\/?$/i) ||
                       url.match(/chapter[_-]?(\d+)/i) ||
                       url.match(/\/novel\/(\d+)/i); // Added: Match booktoki URL
      if (urlMatch) {
        chapterNumber = parseInt(urlMatch[1], 10);
      }
    }
    
    const contentToReturn = finalContent || `Content not found with selector ("${selector}") or was empty after cleaning.`;

    const scrapedData: ScrapedChapter = {
      title: onPageTitle,
      chapterNumber,
      content: contentToReturn,
      nextUrl,
      prevUrl,
    };

    res.setHeader('Cache-Control', 's-maxage=1, stale-while-revalidate=59');
    res.status(200).json(scrapedData);

  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown scraping error';
    res.status(500).json({ error: message });
  }
}
