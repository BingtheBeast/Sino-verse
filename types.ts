export type Novel = {
  id: string;
  title: string;
  url: string; 
  selector: string;
  sourceLanguage: 'chinese' | 'korean';
  customGlossary: string;
  aiProvider: 'gemini' | 'groq';
};

export type ScrapedChapter = {
  title: string;
  chapterNumber: number | null;
  content: string;
  nextUrl: string | null;
  prevUrl: string | null;
};