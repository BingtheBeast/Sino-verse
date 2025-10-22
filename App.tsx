import React, { useState, useCallback } from 'react';
import HomeScreen from './hooks/components/HomeScreen';
import ReaderScreen from './hooks/components/ReaderScreen';
import NewNovelModal from './hooks/components/NewNovelModal';
import SettingsModal from './hooks/components/SettingsModal';
import useLocalStorage from './hooks/useLocalStorage';
import { useTheme } from './hooks/useTheme';
import { Novel, ScrapedChapter } from './types';
import { NOVELS_STORAGE_KEY } from './constants';
import { scrapeChapter } from './services/scraperService';
import { translateTextStream } from './services/aiService';
import Loader from './hooks/components/common/Loader';

type AppState = 'home' | 'reader' | 'loading' | 'error';

function App() {
  const [novels, setNovels] = useLocalStorage<Novel[]>(NOVELS_STORAGE_KEY, []);
  const [appState, setAppState] = useState<AppState>('home');
  const [currentNovel, setCurrentNovel] = useState<Novel | null>(null);
  const [currentChapter, setCurrentChapter] = useState<ScrapedChapter | null>(null);
  const [translatedText, setTranslatedText] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isNavigating, setIsNavigating] = useState(false);
  const [navigatingDirection, setNavigatingDirection] = useState<'next' | 'prev' | null>(null);

  const [isNewNovelModalOpen, setIsNewNovelModalOpen] = useState(false);
  const [isSettingsModalOpen, setIsSettingsModalOpen] = useState(false);
  const [novelForSettings, setNovelForSettings] = useState<Novel | null>(null);
  
  const [theme, toggleTheme] = useTheme();

  const handleError = useCallback((e: unknown, context: string) => {
    const message = e instanceof Error ? e.message : 'An unknown error occurred.';
    console.error(`${context}:`, e);
    setError(message);
    setAppState('error');
  }, []);

  const fetchAndTranslateChapter = useCallback(async (novel: Novel, url: string) => {
    setAppState('loading');
    setTranslatedText('');
    setCurrentChapter(null);
    setError(null);
    try {
      const chapterData = await scrapeChapter(url, novel.selector);
      setCurrentChapter(chapterData);
      setCurrentNovel(novel);
      
      setAppState('reader');

      const stream = translateTextStream(chapterData.content, novel);
      let isFirstChunk = true;
      for await (const chunk of stream) {
        if (isFirstChunk) {
          setTranslatedText(chunk.trimStart());
          isFirstChunk = false;
        } else {
          setTranslatedText(prev => prev + chunk);
        }
      }
    } catch (e) {
      handleError(e, `Failed to fetch or translate chapter from ${url}`);
    }
  }, [handleError]);

  const handleSelectNovel = (novel: Novel) => {
    fetchAndTranslateChapter(novel, novel.url);
  };

  const handleNavigate = async (url: string, direction: 'next' | 'prev') => {
    if (!currentNovel) return;
    setIsNavigating(true);
    setNavigatingDirection(direction);
    await fetchAndTranslateChapter(currentNovel, url);
    setIsNavigating(false);
    setNavigatingDirection(null);
  };

  const handleAddNovel = (newNovelData: Omit<Novel, 'id'>) => {
    const newNovel: Novel = { ...newNovelData, id: crypto.randomUUID() };
    setNovels(prev => [...prev, newNovel]);
    setIsNewNovelModalOpen(false);
  };

  const handleDeleteNovel = (novelId: string) => {
    setNovels(prev => prev.filter(n => n.id !== novelId));
  };
  
  const handleOpenSettings = (novel: Novel) => {
    setNovelForSettings(novel);
    setIsSettingsModalOpen(true);
  };

  const handleSaveSettings = (novelId: string, settings: { customGlossary: string; aiProvider: 'gemini' | 'groq' }) => {
    setNovels(prev => prev.map(n => n.id === novelId ? { ...n, ...settings } : n));
    setIsSettingsModalOpen(false);
  };

  const handleHome = () => {
    setAppState('home');
    setCurrentNovel(null);
    setCurrentChapter(null);
    setTranslatedText('');
    setError(null);
  };

  const renderContent = () => {
    switch (appState) {
      case 'loading':
        return (
          <div className="flex flex-col items-center justify-center h-full bg-[--app-bg]">
            <Loader />
            <p className="mt-4 text-[--status-text]">Loading Chapter...</p>
          </div>
        );
      case 'reader':
        if (currentChapter && currentNovel) {
          return (
            <ReaderScreen
              translatedText={translatedText}
              chapterTitle={currentChapter.title}
              chapterNumber={currentChapter.chapterNumber}
              onHome={handleHome}
              onNavigate={handleNavigate}
              nextUrl={currentChapter.nextUrl}
              prevUrl={currentChapter.prevUrl}
              isNavigating={isNavigating}
              navigatingDirection={navigatingDirection}
            />
          );
        }
        return null;
      case 'error':
        return (
          <div className="flex flex-col items-center justify-center h-full bg-[--app-bg] p-4 text-center">
            <h2 className="text-xl font-bold text-red-500 mb-4">An Error Occurred</h2>
            <p className="text-[--text-color] mb-4 max-w-md">{error}</p>
            <button
              onClick={handleHome}
              className="bg-indigo-600 text-white font-semibold py-2 px-4 rounded-md hover:bg-indigo-700"
            >
              Return Home
            </button>
          </div>
        );
      case 'home':
      default:
        return (
          <HomeScreen
            novels={novels}
            onSelectNovel={handleSelectNovel}
            onAddNewNovel={() => setIsNewNovelModalOpen(true)}
            onDeleteNovel={handleDeleteNovel}
            onOpenSettings={handleOpenSettings}
            theme={theme}
            toggleTheme={toggleTheme}
          />
        );
    }
  };

  return (
    <div className="h-screen w-screen font-sans">
      {renderContent()}
      <NewNovelModal
        isOpen={isNewNovelModalOpen}
        onClose={() (false)}
        onAddNovel={handleAddNovel}
      />
      <SettingsModal
        isOpen={isSettingsModalOpen}
        onClose={() (false)}
        novel={novelForSettings}
        onSave={handleSaveSettings}
      />
    </div>
  );
}

export default App;
