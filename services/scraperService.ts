import { ScrapedChapter } from '../types';

const SCRAPINGBEE_API_URL = 'https://app.scrapingbee.com/api/v1/';

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

    const scores = new Map<string, number>();
    const commonSelectors = [
        '#content', '.content', '#chapter-content', '.chapter-content', 
        'article', '.entry-content', '.main-content', '#text', '.text'
    ];
    
    commonSelectors.forEach(selector => {
        if (doc.querySelector(selector)) {
            scores.set(selector, 100); 
        }
    });

    doc.querySelectorAll('*').forEach(el => {
        const textLength = el.textContent?.trim().length || 0;
        if (textLength > 200 && el.children.length < 5) {
            let selector: string | null = null;
            if (el.id) {
                selector = `#${el.id}`;
            } else if (el.className && typeof el.className === 'string') {
                const classes = el.className.trim().split(/\s+/).filter(Boolean);
                if (classes.length > 0) {
                    selector = `.${classes.join('.')}`;
                }
            }
            
            if (selector) {
                try {
                    if (doc.querySelectorAll(selector).length === 1) {
                        scores.set(selector, (scores.get(selector) || 0) + textLength);
                    }
                } catch (e) { /* Invalid selector */ }
            }
        }
    });

    const suggestions = [...scores.entries()]
        .sort((a, b) => b[1] - a[1])
        .map(entry => entry[0]);

    return Array.from(new Set([...commonSelectors.filter(s => scores.has(s)), ...suggestions])).slice(0, 10);

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
  ].join(', ');
  
  const onPageTitleSelectors = [
      'h1',
      'h2',
      '.chapter-title',
      '#chapter-title',
      '.entry-title',
  ].join(', ');

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
    
    const onPageTitle = scrapedData.onPageTitle?.trim() || '';
    
    let chapterNumber: number | null = null;
    const titleMatch = onPageTitle.match(/chapter[_-]?\s*(\d+)/i) || onPageTitle.match(/(\d+)(?!.*\d)/);
    const urlMatch = url.match(/chapter[_-]?(\d+)/i) || url.match(/\/(\d+)\/?$/) || url.match(/(\d+)(?!.*\d)/);

    if (titleMatch) {
        chapterNumber = parseInt(titleMatch[1] || titleMatch[0], 10);
    } else if (urlMatch) {
        chapterNumber = parseInt(urlMatch[1] || urlMatch[0], 10);
    }
    
    const finalTitle = chapterNumber 
        ? `Chapter ${chapterNumber}` 
        : (onPageTitle || scrapedData.documentTitle || 'Unknown Chapter');

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
