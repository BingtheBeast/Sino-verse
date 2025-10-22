import { ScrapedChapter } from '../types';

const SCRAPINGBEE_API_URL = 'https://app.scrapingbee.com/api/v1/';

export const getSelectorSuggestions = async (url: string): Promise<string[]> => {
  if (!url || !url.startsWith('http')) {
      throw new Error('Please enter a valid URL.');
  }

  const apiKey = import.meta.env.VITE_SCRAPINGBEE_API_KEY;
  if (!apiKey) {
      throw new Error("ScrapingBee API key (VITE_SCRAPINGBEE_API_KEY) is not configured.");
  }

  const params = new URLSearchParams({
    api_key: apiKey,
    url: url,
    render_js: 'false',
  });

  try {
    const response = await fetch(`${SCRAPINGBEE_API_URL}?${params.toString()}`);
    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Scraping for suggestions failed: ${response.status} ${response.statusText}. ${errorText}`);
    }

    const html = await response.text();
    const parser = new DOMParser();
    const doc = parser.parseFromString(html, 'text/html');
    
    const scores = new Map<string, number>();
    const forbiddenTags = new Set(['NAV', 'HEADER', 'FOOTER', 'ASIDE', 'SCRIPT', 'STYLE', 'FORM', 'BUTTON', 'A', 'UL', 'LI', 'IFRAME', 'FIGURE', 'FIGCAPTION']);

    doc.body.querySelectorAll('div, article, section, main').forEach(el => {
      let parent = el.parentElement;
      let isChildOfForbidden = false;
      while(parent && parent !== doc.body) {
        if (forbiddenTags.has(parent.tagName.toUpperCase())) {
          isChildOfForbidden = true;
          break;
        }
        parent = parent.parentElement;
      }
      if (isChildOfForbidden) return;
      
      const directTextLength = Array.from(el.childNodes)
        .filter(node => node.nodeType === Node.TEXT_NODE)
        .reduce((acc, node) => acc + (node.textContent?.trim().length || 0), 0);

      if (directTextLength < 100) return;
      
      const pCount = el.querySelectorAll('p').length;
      const linkCount = el.querySelectorAll('a').length;

      let score = (directTextLength * 1.0) + (pCount * 10) - (linkCount * 5);
      
      if (score > 100) { 
        let selector = el.id ? `#${el.id}` : el.className && typeof el.className === 'string' ? `.${el.className.trim().split(/\s+/).filter(Boolean).join('.')}` : null;
        if(selector) {
            try {
                if (doc.querySelectorAll(selector).length === 1) {
                    scores.set(selector, score);
                }
            } catch(e) {}
        }
      }
    });

    const sortedCandidates = [...scores.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(entry => entry[0]);

    const suggestions = new Set<string>(['#content', '.content', '.chapter-content', 'article', ...sortedCandidates]);
    return Array.from(suggestions).slice(0, 5);

  } catch (error) {
    console.error('Error scraping for suggestions:', error);
    if (error instanceof Error) {
        throw new Error(`Failed to get suggestions. Reason: ${error.message}. Try entering a selector manually.`);
    }
    throw new Error('An unknown error occurred while getting suggestions.');
  }
};

export const scrapeChapter = async (
  url: string,
  selector: string
): Promise<ScrapedChapter> => {
  const nextLinkSelectors = [
      "a:contains('Next Chapter')",
      "a:contains('next chapter')",
      "a:contains('Next')",
      "a:contains('next')",
      "a[rel='next']",
      "a.next-page",
      "a.nav-next",
      "a#next_chap",
      "a.btn-next",
      "a:contains('下一章')",
      "a:contains('下章')",
  ].join(', ');
  
  const prevLinkSelectors = [
      "a:contains('Previous Chapter')",
      "a:contains('previous chapter')",
      "a:contains('Previous')",
      "a:contains('previous')",
      "a[rel='prev']",
      "a.prev-page",
      "a.nav-previous",
      "a#prev_chap",
      "a.btn-prev",
      "a:contains('上一章')",
      "a:contains('上章')",
  ].join(', ');
  
  const onPageTitleSelectors = [
      `${selector} h1`,
      `${selector} h2`,
      `${selector} h3`,
      '.chapter-title',
      '#chapter-title',
      '.content-title',
  ].join(', ');

  const chapterNumberHintSelectors = [
      "div:contains('分卷阅读')",
      "span:contains('分卷阅读')",
      "div:contains('章')",
      "span:contains('章')",
      '.page-title',
  ].join(', ');

  const extractRules = {
    onPageTitle: {
        selector: onPageTitleSelectors,
        output: 'text',
        type: 'item',
    },
    chapterHint: {
        selector: chapterNumberHintSelectors,
        output: 'text',
        type: 'item',
    },
    content: selector,
    nextUrl: {
      selector: nextLinkSelectors,
      output: '@href',
      type: 'item',
    },
    prevUrl: {
      selector: prevLinkSelectors,
      output: '@href',
      type: 'item',
    },
  };
  
  const apiKey = import.meta.env.VITE_SCRAPINGBEE_API_KEY;
  if (!apiKey) {
      throw new Error("ScrapingBee API key (VITE_SCRAPINGBEE_API_KEY) is not configured in environment variables.");
  }

  const params = new URLSearchParams({
    api_key: apiKey,
    url: url,
    extract_rules: JSON.stringify(extractRules),
  });

  try {
    const response = await fetch(`${SCRAPINGBEE_API_URL}?${params.toString()}`);

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Scraping failed: ${response.status} ${response.statusText}. Response: ${errorText}`);
    }

    const scrapedData = await response.json();

    const resolveUrl = (relativeOrAbsoluteUrl: string | null): string | null => {
        if (!relativeOrAbsoluteUrl) return null;
        try {
            return new URL(relativeOrAbsoluteUrl, url).href;
        } catch (e) {
            console.warn(`Invalid URL found: ${relativeOrAbsoluteUrl}`);
            return null;
        }
    }

    const content = scrapedData.content || `Content not found with the provided selector ("${selector}"). Please check the selector in the novel's settings.`;
    
    const onPageTitle = scrapedData.onPageTitle?.trim() || '';
    const chapterHint = scrapedData.chapterHint?.trim() || '';
    
    let chapterNumber: number | null = null;
    
    let hintMatch = chapterHint.match(/分卷阅读\s*(\d+)/) || 
                      chapterHint.match(/第\s*(\d+)\s*章/);
    
    if (hintMatch) {
        chapterNumber = parseInt(hintMatch[1], 10);
    }
    
    if (!chapterNumber) {
        let titleMatch = onPageTitle.match(/chapter[_-]?\s*(\d+)/i) || 
                           onPageTitle.match(/第\s*(\d+)\s*章/);
                           
        if (titleMatch) {
            chapterNumber = parseInt(titleMatch[1], 10);
        }
    }
    
    if (!chapterNumber) {
        const urlMatch = url.match(/\/(\d+)\.html/i) || 
                         url.match(/\/(\d+)\/?$/i);
        if (urlMatch) {
            chapterNumber = parseInt(urlMatch[1], 10);
        }
    }
    
    const finalTitle = onPageTitle || "Unknown Chapter"; 

    return {
      title: finalTitle,
      chapterNumber,
      content,
      nextUrl: resolveUrl(scrapedData.nextUrl),
      prevUrl: resolveUrl(scrapedData.prevUrl),
    };

  } catch (error) {
    console.error('Error calling ScrapingBee API:', error);
    if (error instanceof Error) {
        throw new Error(`Failed to scrape chapter content. Reason: ${error.message}`);
    }
    throw new Error('An unknown error occurred while scraping the chapter.');
  }
};


