import React from 'react';
import { Novel } from '../../types';
import { SunIcon, MoonIcon, SettingsIcon } from './icons';

interface HomeScreenProps {
  novels: Novel[];
  onSelectNovel: (novel: Novel) => void;
  onAddNewNovel: () => void;
  onDeleteNovel: (novelId: string) => void;
  onOpenSettings: (novel: Novel) => void;
  theme: string;
  toggleTheme: () => void;
}

const HomeScreen: React.FC<HomeScreenProps> = ({
  novels,
  onSelectNovel,
  onAddNewNovel,
  onDeleteNovel,
  onOpenSettings,
  theme,
  toggleTheme,
}) => {
  return (
    <div className="flex flex-col h-full bg-[--app-bg] text-[--text-color]">
      <header className="flex items-center justify-between p-4 border-b border-[--border-color] sticky top-0 bg-[--app-bg]/80 backdrop-blur-sm z-10">
        <h1 className="text-2xl font-bold">My Novels</h1>
        <div className="flex items-center space-x-2">
            <button 
                onClick={toggleTheme} 
                className="p-2 rounded-full hover:bg-[--hover-bg]"
                aria-label={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}
            >
                {theme === 'dark' ? <SunIcon className="w-6 h-6" /> : <MoonIcon className="w-6 h-6" />}
            </button>
        </div>
      </header>

      <main className="flex-1 overflow-y-auto p-4 md:p-6">
        {novels.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-center">
            <p className="text-lg text-[--status-text] mb-4">Your library is empty.</p>
            <button
              onClick={onAddNewNovel}
              className="bg-indigo-600 text-white font-bold py-3 px-6 rounded-lg text-lg hover:bg-indigo-700 transition-colors"
            >
              Add Your First Novel
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {novels.map((novel) => (
              <div key={novel.id} className="bg-[--card-bg] rounded-lg shadow-md p-4 flex flex-col justify-between border border-[--border-color]">
                <div>
                  <h2 className="text-lg font-bold mb-1 truncate">{novel.title}</h2>
                  <p className="text-sm text-[--status-text] capitalize">{novel.sourceLanguage}</p>
                </div>
                <div className="flex flex-col space-y-2 mt-4">
                  <button
                    onClick={() => onSelectNovel(novel)}
                    className="w-full bg-indigo-600 text-white font-semibold py-2 px-4 rounded-md hover:bg-indigo-700 transition-colors"
                  >
                    Continue Reading
                  </button>
                   <div className="flex items-center justify-between pt-2">
                     <button
                        onClick={() => onOpenSettings(novel)}
                        className="flex items-center text-sm text-[--status-text] hover:underline"
                    >
                        <SettingsIcon className="w-4 h-4 mr-1"/>
                        Settings
                    </button>
                    <button
                        onClick={(e) => {
                            e.stopPropagation(); // Prevent any parent handlers from interfering
                            onDeleteNovel(novel.id);
                        }}
                        className="text-sm text-red-600 dark:text-red-400 hover:underline"
                    >
                        Delete
                    </button>
                   </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </main>

      {novels.length > 0 && (
         <footer className="p-4 border-t border-[--border-color] flex justify-end">
            <button
                onClick={onAddNewNovel}
                className="bg-indigo-600 text-white font-bold py-2 px-4 rounded-lg hover:bg-indigo-700 transition-colors"
            >
                Add New Novel
            </button>
         </footer>
      )}
    </div>
  );
};

export default HomeScreen;