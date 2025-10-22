import React, { useRef, useEffect } from 'react';
import Loader from './common/Loader';
import { HomeIcon } from './icons';

interface ReaderScreenProps {
  translatedText: string;
  chapterTitle: string;
  chapterNumber: number | null;
  onHome: () => void;
  onNavigate: (url: string, direction: 'next' | 'prev') => void;
  nextUrl: string | null;
  prevUrl: string | null;
  isNavigating: boolean;
  navigatingDirection: 'next' | 'prev' | null;
}

const ReaderScreen: React.FC<ReaderScreenProps> = ({
  translatedText,
  chapterTitle,
  chapterNumber,
  onHome,
  onNavigate,
  nextUrl,
  prevUrl,
  isNavigating,
  navigatingDirection
}) => {
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
        const { scrollTop, scrollHeight, clientHeight } = scrollRef.current;
        if (scrollHeight - scrollTop < clientHeight + 200) {
            scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
        }
    }
  }, [translatedText]);

  useEffect(() => {
    if (scrollRef.current) {
        scrollRef.current.scrollTop = 0;
    }
  }, [chapterTitle]);

  const displayTitle = chapterNumber ? `Chapter ${chapterNumber}` : chapterTitle;

  return (
    <div className="flex flex-col h-full bg-[--app-bg]">
      <header className="flex items-center p-4 border-b border-[--border-color] sticky top-0 bg-[--app-bg]/80 backdrop-blur-sm z-10">
        <button onClick={onHome} className="p-2 rounded-full hover:bg-[--hover-bg]" aria-label="Return to Home Screen">
          <HomeIcon className="w-6 h-6 text-[--text-color]" />
        </button>
        <h2 className="text-xl font-semibold mx-auto text-[--text-color] truncate px-4 text-center">{displayTitle}</h2>
        <div className="w-10"></div>
      </header>
      
      <main ref={scrollRef} className="flex-1 overflow-y-auto p-6 md:p-8">
        <div 
          className="prose dark:prose-invert max-w-3xl mx-auto text-[--text-color] leading-relaxed whitespace-pre-wrap"
        >
          {translatedText}
        </div>
      </main>

      <footer className="p-4 border-t border-[--border-color] flex justify-between items-center sticky bottom-0 bg-[--app-bg]/80 backdrop-blur-sm z-10">
        <button
          onClick={() => prevUrl && onNavigate(prevUrl, 'prev')}
          disabled={!prevUrl || isNavigating}
          className="bg-gray-200 text-gray-800 dark:bg-gray-700 dark:text-gray-200 font-semibold px-6 py-2 rounded-md hover:bg-gray-300 dark:hover:bg-gray-600 disabled:opacity-50 disabled:cursor-not-allowed w-36 h-10 flex items-center justify-center transition-colors"
        >
          {isNavigating && navigatingDirection === 'prev' ? <Loader isButtonLoader /> : 'Previous'}
        </button>
        <button
          onClick={() => nextUrl && onNavigate(nextUrl, 'next')}
          disabled={!nextUrl || isNavigating}
          className="bg-indigo-600 text-white font-semibold px-6 py-2 rounded-md hover:bg-indigo-700 disabled:bg-indigo-400 disabled:cursor-not-allowed w-36 h-10 flex items-center justify-center transition-colors"
        >
          {isNavigating && navigatingDirection === 'next' ? <Loader isButtonLoader /> : 'Next'}
        </button>
      </footer>
    </div>
  );
};

export default ReaderScreen;

