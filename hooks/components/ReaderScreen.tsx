import React, { useState, useEffect, useRef } from 'react';
import { Novel } from '../../types';
import { translateTextStream, generateGlossarySuggestions } from '../../services/aiService';
import { scrapeChapter } from '../../services/scraperService';
import Loader from './common/Loader';
import { ArrowLeftIcon, ArrowRightIcon, RefreshIcon, SettingsIcon, ListIcon, XIcon } from './icons';

interface ReaderScreenProps {
  novel: Novel;
  onClose: ();
  onSettings: (novelId: string) => void;
  onNav: (url: string | null) => void;
}

const ReaderScreen: React.FC<ReaderScreenProps> = ({ novel, onClose, onSettings, onNav }) => {
  const [translatedText, setTranslatedText] = useState('');
  const [originalText, setOriginalText] = useState('');
  const [chapterTitle, setChapterTitle] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showOriginal, setShowOriginal] = useState(false);
  const [nextUrl, setNextUrl] = useState<string | null>(null);
  const [prevUrl, setPrevUrl] = useState<string | null>(null);
  
  const [showGlossaryTooltip, setShowGlossaryTooltip] = useState(false);
  const [selectedText, setSelectedText] = useState('');
  const [tooltipPosition, setTooltipPosition] = useState({ top: 0, left: 0 });
  const [isSuggesting, setIsSuggesting] = useState(false);

  const readerBodyRef = useRef<HTMLDivElement>(null);
  const selectionTimeoutRef = useRef<number | null>(null);

  const fetchAndTranslate = async () => {
    if (!novel.currentChapterUrl) {
      setError('No chapter URL selected.');
      return;
    }

    setIsLoading(true);
    setError(null);
    setTranslatedText('');
    setOriginalText('');
    setChapterTitle('');
    setNextUrl(null);
    setPrevUrl(null);

    try {
      // 1. Scrape
      const scrapedData = await scrapeChapter(novel.currentChapterUrl, novel.selector);
      setOriginalText(scrapedData.content);
      setChapterTitle(scrapedData.title || 'Chapter');
      setNextUrl(scrapedData.nextUrl);
      setPrevUrl(scrapedData.prevUrl);
      
      if (readerBodyRef.current) {
        readerBodyRef.current.scrollTop = 0;
      }

      // 2. Translate
      const stream = translateTextStream(scrapedData.content, novel);
      for await (const chunk of stream) {
        setTranslatedText(prev => prev + chunk);
      }
    } catch (err) {
      console.error(err);
      setError(err instanceof Error ? err.message : 'An unknown error occurred.');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchAndTranslate();
  }, [novel.currentChapterUrl, novel.aiProvider, novel.customGlossary]); // Re-translate if core settings change

  const handleSelection = () => {
    if (selectionTimeoutRef.current) {
      clearTimeout(selectionTimeoutRef.current);
    }
    
    selectionTimeoutRef.current = window.setTimeout(() => {
      const selection = window.getSelection();
      const text = selection?.toString().trim() || '';
      
      if (text.length > 2 && text.length < 100) {
        const range = selection?.getRangeAt(0);
        if (range) {
          const rect = range.getBoundingClientRect();
          const readerRect = readerBodyRef.current?.getBoundingClientRect();
          if (readerRect) {
            setSelectedText(text);
            setTooltipPosition({
              top: rect.bottom - readerRect.top + 10, // 10px below selection
              left: (rect.left + rect.right) / 2 - readerRect.left, // Centered
            });
            setShowGlossaryTooltip(true);
          }
        }
      } else {
        setShowGlossaryTooltip(false);
      }
    }, 500);
  };
  
  const handleSuggest = async () => {
    if (!selectedText) return;
    setIsSuggesting(true);
    try {
      const suggestion = await generateGlossarySuggestions(
        selectedText, 
        novel.sourceLanguage, 
        novel.aiProvider
      );
      // For now, just log it. In future, could show a modal
      console.log('Suggested glossary entry:', suggestion);
      alert(`Suggested Glossary:\n\n${suggestion}`);
    } catch (error) {
      console.error('Error suggesting glossary:', error);
      alert(`Error: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
      setIsSuggesting(false);
      setShowGlossaryTooltip(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-[--bg-color] z-20 flex flex-col">
      {/* Header */}
      <header className="flex-shrink-0 flex items-center justify-between p-4 border-b border-[--border-color]">
        <button onClick={onClose} className="p-2 rounded-full hover:bg-[--hover-bg]">
          <ListIcon className="h-6 w-6" />
        </button>
        <div className="text-center">
          <h1 className="text-xl font-semibold truncate max-w-[60vw]">{novel.title}</h1>
          <h2 className="text-sm text-[--text-color-secondary] truncate max-w-[60vw]">{chapterTitle}</h2>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={fetchAndTranslate} disabled={isLoading} className="p-2 rounded-full hover:bg-[--hover-bg] disabled:opacity-50">
            <RefreshIcon className={`h-6 w-6 ${isLoading ? 'animate-spin' : ''}`} />
          </button>
          <button onClick={() => onSettings(novel.id)} className="p-2 rounded-full hover:bg-[--hover-bg]">
            <SettingsIcon className="h-6 w-6" />
          </button>
        </div>
      </header>

      {/* Body */}
      <div 
        ref={readerBodyRef}
        className="flex-grow p-6 md:p-12 overflow-y-auto"
        onMouseUp={handleSelection}
        onTouchEnd={handleSelection}
      >
        <div className="max-w-3xl mx-auto relative">
          {error && <div className="text-red-500 bg-red-100 p-4 rounded-md">{error}</div>}
          
          {isLoading ? (
            <Loader />
          ) : (
            <div 
              className="text-lg leading-relaxed"
              style={{ whiteSpace: 'pre-line' }} // <-- THIS IS THE FIX
            >
              {translatedText}
            </div>
          )}

          {/* Glossary Tooltip */}
          {showGlossaryTooltip && (
            <div 
              className="absolute bg-[--modal-bg] border border-[--border-color] rounded-lg shadow-lg px-4 py-2 flex items-center gap-2"
              style={{ 
                top: `${tooltipPosition.top}px`, 
                left: `${tooltipPosition.left}px`,
                transform: 'translateX(-50%)',
              }}
            >
              <span className="text-sm max-w-[200px] truncate">{selectedText}</span>
              <button 
                onClick={handleSuggest} 
                disabled={isSuggesting}
                className="text-sm text-[--accent-color] hover:underline disabled:opacity-50"
              >
                {isSuggesting ? '...' : 'Suggest'}
              </button>
              <button onClick={() => setShowGlossaryTooltip(false)} className="ml-2">
                <XIcon className="h-4 w-4" />
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Footer / Navigation */}
      <footer className="flex-shrink-0 flex items-center justify-between p-4 border-t border-[--border-color]">
        <button 
          onClick={() => onNav(prevUrl)} 
          disabled={!prevUrl || isLoading} 
          className="flex items-center gap-2 p-2 rounded-md hover:bg-[--hover-bg] disabled:opacity-50"
        >
          <ArrowLeftIcon className="h-5 w-5" />
          Previous
        </button>
        <div className="flex items-center gap-4">
          <label className="flex items-center gap-2 cursor-pointer">
            <input 
              type="checkbox"
              checked={showOriginal}
              onChange={() => setShowOriginal(o => !o)}
              className="rounded"
            />
            Show Original
          </label>
        </div>
        <button 
          onClick={() => onNav(nextUrl)} 
          disabled={!nextUrl || isLoading} 
          className="flex items-center gap-2 p-2 rounded-md hover:bg-[--hover-bg] disabled:opacity-50"
        >
          Next
          <ArrowRightIcon className="h-5 w-5" />
        </button>
      </footer>

      {/* Original Text Panel */}
      {showOriginal && (
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[90vw] max-w-5xl h-[80vh] bg-[--modal-bg] border border-[--border-color] rounded-lg shadow-2xl z-30 flex flex-col">
          <header className="flex items-center justify-between p-4 border-b border-[--border-color]">
            <h3 className="text-lg font-semibold">Original Text</h3>
            <button onClick={() => setShowOriginal(false)} className="p-2 rounded-full hover:bg-[--hover-bg]">
              <XIcon className="h-6 w-6" />
            </button>
          </header>
          <div 
            className="flex-grow p-6 overflow-y-auto"
            style={{ whiteSpace: 'pre-line' }}
          >
            {originalText}
          </div>
        </div>
      )}
    </div>
  );
};

export default ReaderScreen;
