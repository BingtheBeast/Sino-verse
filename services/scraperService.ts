import { ScrapedChapter } from '../types';

export const getSelectorSuggestions = async (url: string): Promise<string[]> => {
  console.log('Fetching selector suggestions for:', url);
  await new Promise(res => setTimeout(res, 1000));

  if (!url || !url.startsWith('http')) {
      throw new Error('Please enter a valid URL.');
  }
  return ['#content', '.chapter-content', 'article.post', '.main-content'];
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

  const extractRules = {
    title: 'title',
    content: selector,
    nextUrl: {
      selector: nextLinkSelectors,
      output: '@href',
      type: 'first',
    },
    prevUrl: {
      selector: prevLinkSelectors,
      output: '@href',
      type: 'first',
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
    
    return {
      title: scrapedData.title || `Chapter ${chapterNumber || 'Unknown'}`,
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

