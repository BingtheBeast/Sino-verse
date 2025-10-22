import React, { useState, useEffect, useRef } from 'react';
import Modal from './common/Modal';
import { Novel } from '../../types';
import { XIcon } from './icons';
import Loader from './common/Loader';
import { generateGlossarySuggestions } from '../../services/aiService';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  novel: Novel | null;
  onSave: (novelId: string, settings: { customGlossary: string; aiProvider: 'gemini' | 'groq' }) => void;
}

const SettingsModal: React.FC<SettingsModalProps> = ({ isOpen, onClose, novel, onSave }) => {
  const [customGlossary, setCustomGlossary] = useState('');
  const [aiProvider, setAiProvider] = useState<'gemini' | 'groq'>('gemini');
  const [context, setContext] = useState('');
  const [suggestions, setSuggestions] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState('');
  const glossaryRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (novel) {
      setCustomGlossary(novel.customGlossary || '');
      setAiProvider(novel.aiProvider || 'gemini');
    }
    if (isOpen) {
        setTimeout(() => glossaryRef.current?.focus(), 100);
    }
  }, [novel, isOpen]);

  if (!novel) return null;

  const handleSave = () => {
    onSave(novel.id, { customGlossary, aiProvider });
    onClose();
  };
  
  const handleGenerate = async () => {
    setIsGenerating(true);
    setError('');
    setSuggestions('');
    try {
        const result = await generateGlossarySuggestions(context, novel.sourceLanguage, aiProvider);
        setSuggestions(result);
    } catch(e) {
        setError(e instanceof Error ? e.message : 'Failed to generate suggestions.');
    } finally {
        setIsGenerating(false);
    }
  };

  const handleAppend = () => {
      setCustomGlossary(prev => {
          const newContent = `${prev}\n\n# --- AI Suggestions ---\n${suggestions}`.trim();
          setSuggestions('');
          setContext('');
          setTimeout(() => {
              if (glossaryRef.current) {
                  glossaryRef.current.scrollTop = glossaryRef.current.scrollHeight;
              }
          }, 0);
          return newContent;
      });
  }

  return (
    <Modal isOpen={isOpen} onClose={onClose}>
        <div className="flex justify-between items-center mb-4">
            <h2 className="text-2xl font-bold text-[--text-color]">Settings for {novel.title}</h2>
            <button onClick={onClose} className="p-1 rounded-full hover:bg-[--hover-bg]" aria-label="Close modal">
                <XIcon className="w-6 h-6 text-[--status-text]"/>
            </button>
        </div>
        <div className="space-y-4 max-h-[70vh] overflow-y-auto pr-2">
            <div>
              <label htmlFor="aiProvider" className="block text-sm font-medium text-[--status-text]">AI Provider</label>
              <select
                id="aiProvider"
                value={aiProvider}
                onChange={(e) => setAiProvider(e.target.value as 'gemini' | 'groq')}
                className="mt-1 block w-full rounded-md border-[--border-color] bg-[--input-bg] text-[--text-color] shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm p-2"
              >
                <option value="gemini">Gemini (Higher Quality)</option>
                <option value="groq">Groq (Faster Speed)</option>
              </select>
            </div>
            <div>
                <label htmlFor="customGlossary" className="block text-sm font-medium text-[--status-text] mb-1">
                  Custom Glossary (Built-in glossary will override conflicting terms)
                </label>
                <textarea
                    id="customGlossary"
                    ref={glossaryRef}
                    rows={8}
                    value={customGlossary}
                    onChange={(e) => setCustomGlossary(e.target.value)}
                    className="w-full rounded-md border-[--border-color] bg-[--input-bg] text-[--text-color] shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm p-2"
                    placeholder={`'Original Term' = 'Translation'`}
                />
            </div>
            
            <div className="border-t border-[--border-color] pt-4">
                 <h3 className="text-lg font-semibold text-[--text-color] mb-2">AI Glossary Helper</h3>
                 <p className="text-sm text-[--status-text] mb-2">Paste a synopsis or context about the novel, and the AI will suggest glossary terms.</p>
                 <textarea
                    id="context"
                    rows={5}
                    value={context}
                    onChange={(e) => setContext(e.target.value)}
                    className="w-full rounded-md border-[--border-color] bg-[--input-bg] text-[--text-color] shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm p-2"
                    placeholder="e.g., Synopsis, character descriptions..."
                />
                <button
                    onClick={handleGenerate}
                    disabled={isGenerating || !context}
                    className="mt-2 px-4 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:opacity-50 h-10 w-48 flex items-center justify-center"
                >
                    {isGenerating ? <Loader isButtonLoader/> : 'Generate Suggestions'}
                </button>
            </div>

            {suggestions && (
                <div>
                    <label className="block text-sm font-medium text-[--status-text] mb-1">AI Suggestions</label>
                    <textarea id="suggestions" rows={5} readOnly value={suggestions} className="w-full rounded-md border-[--border-color] bg-[--input-bg] text-[--status-text] shadow-sm sm:text-sm p-2" />
                    <button onClick={handleAppend} className="mt-2 text-sm text-indigo-600 dark:text-indigo-400 hover:underline">Append to My Glossary</button>
                </div>
            )}
            
            {error && <p className="text-sm text-red-600 dark:text-red-400 mt-2">{error}</p>}
        </div>
        <div className="flex justify-end pt-4 mt-4 border-t border-[--border-color] space-x-2">
          <button
            type="button"
            onClick={onClose}
            className="bg-gray-200 text-gray-800 dark:bg-gray-700 dark:text-gray-200 font-semibold px-4 py-2 rounded-md hover:bg-gray-300 dark:hover:bg-gray-600"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSave}
            className="bg-indigo-600 text-white font-semibold px-4 py-2 rounded-md hover:bg-indigo-700"
          >
            Save Settings
          </button>
        </div>
    </Modal>
  );
};

export default SettingsModal;
