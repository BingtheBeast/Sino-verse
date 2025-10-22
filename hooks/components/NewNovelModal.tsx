import React, { useState, useEffect, useRef } from 'react';
import Modal from './common/Modal';
import { Novel } from '../../types';
import { getSelectorSuggestions } from '../../services/scraperService';
import Loader from './common/Loader';
import { XIcon } from './icons';

interface NewNovelModalProps {
  isOpen: boolean;
  onClose: () => void;
  onAddNovel: (novel: Omit<Novel, 'id'>) => void;
}

const NewNovelModal: React.FC<NewNovelModalProps> = ({ isOpen, onClose, onAddNovel }) => {
  const [title, setTitle] = useState('');
  const [url, setUrl] = useState('');
  const [selector, setSelector] = useState('');
  const [sourceLanguage, setSourceLanguage] = useState<'chinese' | 'korean'>('chinese');
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [isLoadingSuggestions, setIsLoadingSuggestions] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const titleInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isOpen) {
      // Focus the title input when the modal opens for better UX
      setTimeout(() => titleInputRef.current?.focus(), 100);
    }
  }, [isOpen]);

  const handleFetchSuggestions = async () => {
    if (!url) {
      setError('Please enter a URL first.');
      return;
    }
    try {
        new URL(url);
    } catch (_) {
        setError('Please enter a valid URL.');
        return;
    }
    setError(null);
    setIsLoadingSuggestions(true);
    setSuggestions([]);
    try {
      const fetchedSuggestions = await getSelectorSuggestions(url);
      setSuggestions(fetchedSuggestions);
      if (fetchedSuggestions.length > 0) {
        setSelector(fetchedSuggestions[0]);
      } else {
        setError('Could not automatically find any content selectors. Please enter one manually.');
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to fetch suggestions.');
    } finally {
      setIsLoadingSuggestions(false);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title || !url || !selector) {
        setError("All fields are required.");
        return;
    }
    onAddNovel({ title, url, selector, sourceLanguage, customGlossary: '', aiProvider: 'gemini' });
    handleClose();
  };
  
  const handleClose = () => {
    setTitle('');
    setUrl('');
    setSelector('');
    setSuggestions([]);
    setError(null);
    setIsLoadingSuggestions(false);
    onClose();
  };

  return (
    <Modal isOpen={isOpen} onClose={handleClose}>
        <div className="flex justify-between items-center mb-4">
            <h2 className="text-2xl font-bold text-[--text-color]">Add New Novel</h2>
            <button onClick={handleClose} className="p-1 rounded-full hover:bg-[--hover-bg]" aria-label="Close modal">
                <XIcon className="w-6 h-6 text-[--status-text]"/>
            </button>
        </div>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label htmlFor="title" className="block text-sm font-medium text-[--status-text]">Title</label>
          <input
            id="title"
            ref={titleInputRef}
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="mt-1 block w-full rounded-md border-[--border-color] bg-[--input-bg] text-[--text-color] shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm p-2"
            required
          />
        </div>
         <div>
          <label htmlFor="sourceLanguage" className="block text-sm font-medium text-[--status-text]">Source Language</label>
          <select
            id="sourceLanguage"
            value={sourceLanguage}
            onChange={(e) => setSourceLanguage(e.target.value as 'chinese' | 'korean')}
            className="mt-1 block w-full rounded-md border-[--border-color] bg-[--input-bg] text-[--text-color] shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm p-2"
          >
            <option value="chinese">Chinese</option>
            <option value="korean">Korean</option>
          </select>
        </div>
        <div>
          <label htmlFor="url" className="block text-sm font-medium text-[--status-text]">First Chapter URL</label>
          <input
            id="url"
            type="url"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            className="mt-1 block w-full rounded-md border-[--border-color] bg-[--input-bg] text-[--text-color] shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm p-2"
            placeholder="https://example.com/novel/chapter-1"
            required
          />
        </div>
        <div>
          <label htmlFor="selector" className="block text-sm font-medium text-[--status-text]">CSS Selector for Content</label>
          <div className="flex items-center space-x-2 mt-1">
            <input
              id="selector"
              type="text"
              value={selector}
              onChange={(e) => setSelector(e.target.value)}
              className="block w-full rounded-md border-[--border-color] bg-[--input-bg] text-[--text-color] shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm p-2"
              placeholder="#content, .chapter-text"
              required
            />
            <button
              type="button"
              onClick={handleFetchSuggestions}
              disabled={isLoadingSuggestions || !url}
              className="px-4 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:opacity-50 h-10 w-36 flex items-center justify-center shrink-0"
            >
              {isLoadingSuggestions ? <Loader isButtonLoader /> : 'Suggest'}
            </button>
          </div>
          {suggestions.length > 0 && (
            <div className="mt-2 space-x-2 flex flex-wrap gap-2">
                <span className="text-sm text-[--status-text] self-center">Suggestions:</span>
                {suggestions.map(s => (
                    <button type="button" key={s} onClick={() => setSelector(s)} className="text-sm bg-[--hover-bg] px-2 py-1 rounded-md text-indigo-600 dark:text-indigo-400 hover:bg-indigo-100 dark:hover:bg-gray-700">{s}</button>
                ))}
            </div>
          )}
        </div>

        {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}
        
        <div className="flex justify-end pt-4 space-x-2">
          <button
            type="button"
            onClick={handleClose}
            className="bg-gray-200 text-gray-800 dark:bg-gray-700 dark:text-gray-200 font-semibold px-4 py-2 rounded-md hover:bg-gray-300 dark:hover:bg-gray-600"
          >
            Cancel
          </button>
          <button
            type="submit"
            className="bg-indigo-600 text-white font-semibold px-4 py-2 rounded-md hover:bg-indigo-700 disabled:opacity-50"
            disabled={!title || !url || !selector}
          >
            Add Novel
          </button>
        </div>
      </form>
    </Modal>
  );
};

export default NewNovelModal;