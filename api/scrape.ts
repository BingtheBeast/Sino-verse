//
// ---------------------------------------------------
// --- NEW FILE: api/scrape.ts -----------------------
// ---------------------------------------------------
//
import type { VercelRequest, VercelResponse } from '@vercel/node';
import * as cheerio from 'cheerio';
import { ScrapedChapter } from '../types'; // Re-uses your exact type

// A realistic User-Agent is CRITICAL to avoid being blocked.
const FAKE_USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36';

// --- Logic replicated 1-to-1 from your original scraperService.ts ---
const nextLinkSelectors = [
  "a:contains('Next Chapter')", "a:contains('next chapter')",
  "a:contains('Next')", "a:contains('next')", "a[rel='next']",
  "a.next-page", "a.nav-next", "a#next_chap", "a.btn-next",
  "a:contains('下一章')", "a:contains('下章')",
].join(', ');

const prevLinkSelectors = [
  "a:contains('Previous Chapter')", "a:contains('previous chapter')",
  "a:contains('Previous')", "a:contains('previous')", "a[rel='prev']",
  "a.prev-page", "a.nav-previous", "a#prev_chap", "a.btn-prev",
  "a:contains('上一章')", "a:contains('上章')",
].join(', ');

const onPageTitleSelectors = [
  '.chapter-title', '#chapter-title', "*:contains('分卷阅读')",
  "*:contains('Chapter ')", "*:contains('CHAPTER ')", "*:contains('第')",
  '.content-title', '.entry-title', 'h1', 'h2',
].join(', ');
// ----------------------------------------------------------

// Helper to resolve relative URLs
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
  const { url, selector } = req.query;

  if (typeof url !== 'string' || !url) {
    return res.status(400).json({ error: 'URL parameter is required' });
  }
  if (typeof selector !== 'string' || !selector) {
    return res.status(400).json({ error: 'Selector parameter is required' });
  }

  // Replicates your logic for finding titles inside/outside the content block
  const allTitleSelectors = [
      onPageTitleSelectors,
      `${selector} h1`,
      `${selector} h2`,
      `${selector} h3`,
  ].join(', ');

  try {
    const response = await fetch(url, {
      headers: { 'User-Agent': FAKE_USER_AGENT }
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch: ${response.status} ${response.statusText}`);
    }

    const html = await response.text();
    const $ = cheerio.load(html);

    // 1. Find the main content block
    const $content = $(selector);

    // 2. --- FIX FOR JUNK TEXT (Problem B) ---
    // Define junk text patterns to find and remove.
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
    
    // Find and remove junk elements *within* the content block
    $content.find(junkSelectors.join(', ')).remove();
    // ------------------------------------------

    // 3. --- FIX FOR PARAGRAPHS (Problem A) ---
    // Iterate over children (like <p> or <div>) to preserve structure.
    const paragraphs: string[] = [];
    $content.contents().each((i, el) => {
        const $el = $(el);
        let text = '';
        
        if (el.type === 'tag' && (el.name === 'p' || el.name ===IA 'div')) {
            text = $el.text().trim();
        } else if (el.type === 'text') {
            text = $el.text().trim();
        }
        
        if (text) {
            paragraphs.push(text);
        }
    });

    // Join with double newlines for `whitespace-pre-wrap`
    const finalContent = paragraphs.join('\n\n');
    // -------------------------------------------

    // --- (The rest is your original, replicated logic) ---
    
    const onPageTitle = $(allTitleSelectors).first().text().trim() || "Unknown Chapter";
    
    const nextUrl = resolveUrl(url, $(nextLinkSelectors).first().attr('href'));
    const prevUrl = resolveUrl(url, $(prevLinkSelectors).first().attr('href'));

    // Replicate chapter number logic
    let chapterNumber: number | null = null;
    let titleMatch = onPageTitle.match(/分卷阅读\s*(\d+)/) ||
                     onPageTitle.match(/chapter[_-]?\s*(\d+)/i) ||
                     onPageTitle.match(/第\s*(\d+)\s*章/);

    if (titleMatch) {
      chapterNumber = parseInt(titleMatch[1], 10);
    }

    if (!chapterNumber) {
      const urlMatch = url.match(/\/(\d+)\.html/i) ||
                       url.match(/\/(\d+)\/?$/i) ||
                       url.match(/chapter[_-]?(\d+)/i);
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