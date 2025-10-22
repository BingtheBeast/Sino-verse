import { ScrapedChapter } from '../types';

const getElementSelector = (el: Element): string | null => {
  if (el.id) {
    const selector = `#${el.id}`;
    try {
      if (document.querySelector(selector) === el) return selector;
    } catch (e) {}
  }
  if (el.className && typeof el.className === 'string') {
    const classes = el.className.trim().split(/\s+/).filter(Boolean);
    if (classes.length > 0) {
      const selector = `.${classes.join('.')}`;
       try {
         if (document.querySelectorAll(selector).length === 1) return selector;
       } catch (e) {}
    }
  }
  return null;
}

export const getSelectorSuggestions = async (url: string): Promise<string[]> => {
  console.log('Actively scraping for selector suggestions at:', url);
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

    const scores = new Map<Element, number>();
    const forbiddenTags = new Set(['NAV', 'HEADER', 'FOOTER', 'ASIDE', 'SCRIPT', 'STYLE', 'FORM', 'BUTTON', 'A', 'UL', 'LI', 'IFRAME']);

    doc.body.querySelectorAll('*').forEach(el => {
      if (forbiddenTags.has(el.tagName.toUpperCase())) return;

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

      let directTextLength = 0;
      el.childNodes.forEach(node => {
        if (node.nodeType === Node.TEXT_NODE) {
          directTextLength += node.textContent?.trim().length || 0;
        }
      });

      if (directTextLength < 100) return;
      
      const pCount = el.querySelectorAll('p').length;
      const linkCount = el.querySelectorAll('a').length;

      let score = (directTextLength * 1.5) + (pCount * 50) - (linkCount * 20);
      if (el.children.length > pCount + 10) {
          score -= el.children.length * 5;
      }

      if (score > 100) { 
        scores.set(el, score);
      }
    });

    const sortedCandidates = [...scores.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(entry => entry[0]);

    const suggestions = new Set<string>();
    suggestions.add('#content');
    suggestions.add('.content');
    suggestions.add('.chapter-content');
    suggestions.add('article');

    sortedCandidates.forEach(el => {
      const selector = getElementSelector(el);
      if (selector) {
        suggestions.add(selector);
      }
    });
    
    return Array.from(suggestions);

  } catch (error) {
    console.error('Error scraping for suggestions:', error);
    if (error instanceof Error) {
        throw new Error(`Failed to get suggestions. Reason: ${error.message}. Try entering a selector manually.`);
    }
    throw new Error('An unknown error occurred while getting suggestions.');
  }
};

const SCRAPINGBEE_API_URL = 'https://app.scrapingbee.com/api/v1/';

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
  ];
  
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
  ];
  
  const onPageTitleSelectors = [
      'h1',
      'h2',
      '.chapter-title',
      '#chapter-title',
      '.entry-title',
  ];

  const extractRules = {
    documentTitle: 'title',
    onPageTitle: {
        selector: onPageTitleSelectors,
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
    
    const chapterNumberMatch = url.match(/chapter[_-]?(\d+)/i) || url.match(/\/(\d+)\/?$/) || url.match(/(\d+)(?!.*\d)/);
    const chapterNumber = chapterNumberMatch ? parseInt(chapterNumberMatch[1] || chapterNumberMatch[0], 10) : null;
    
    const finalTitle = scrapedData.onPageTitle?.trim() 
        || (chapterNumber ? `Chapter ${chapterNumber}` : null) 
        || scrapedData.documentTitle 
        || 'Unknown Chapter';

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

