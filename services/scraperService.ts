//
// ---------------------------------------------------
// --- MODIFIED FILE: services/scraperService.ts -----
// ---------------------------------------------------
//
import { ScrapedChapter } from '../types';

/**
 * Fetches suggestions for CSS selectors from our new serverless function.
 * This is now just a simple wrapper for our /api/suggest endpoint.
 */
export const getSelectorSuggestions = async (url: string): Promise<string[]> => {
  if (!url || !url.startsWith('http')) {
    throw new Error('Please enter a valid URL.');
  }

  const params = new URLSearchParams({ url });

  try {
    // Call our own /api/suggest endpoint. This works on mobile!
    const response = await fetch(`/api/suggest?${params.toString()}`);

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ error: 'Failed to get suggestions' }));
      throw new Error(errorData.error || `Failed to get suggestions: ${response.statusText}`);
    }

    const suggestions = await response.json();
    if (!Array.isArray(suggestions)) {
      throw new Error('Server returned an invalid response.');
    }
    return suggestions;

  } catch (error) {
    console.error('Error fetching selector suggestions:', error);
    const message = error instanceof Error ? error.message : 'An unknown error occurred.';
    // Provide a more helpful error to the user in NewNovelModal
    throw new Error(`Failed to get suggestions. Reason: ${message}. Try entering a selector manually.`);
  }
};

/**
 * Scrapes chapter content using our new serverless function.
 * This is now just a simple wrapper for our /api/scrape endpoint.
 */
export const scrapeChapter = async (
  url: string,
  selector: string
): Promise<ScrapedChapter> => {

  const params = new URLSearchParams({
    url: url,
    selector: selector,
  });

  try {
    // Call our own /api/scrape endpoint. This also works on mobile!
    const response = await fetch(`/api/scrape?${params.toString()}`);

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ error: 'Scraping failed with no JSON response' }));
      throw new Error(errorData.error || `Scraping failed: ${response.status} ${response.statusText}`);
    }

    // The data returned from the API matches the ScrapedChapter type exactly
    const scrapedData: ScrapedChapter = await response.json();
    return scrapedData;

  } catch (error) {
    console.error('Error calling local scrape API:', error);
    const message = error instanceof Error ? error.message : 'An unknown error occurred.';
    throw new Error(`Failed to scrape chapter content. Reason: ${message}`);
  }
};
