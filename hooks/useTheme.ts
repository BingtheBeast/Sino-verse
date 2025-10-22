
import { useEffect } from 'react';
import useLocalStorage from './useLocalStorage';

export const useTheme = (): [string, () => void] => {
  const [theme, setTheme] = useLocalStorage<string>('translatorTheme', 'light');

  useEffect(() => {
    const root = window.document.documentElement;
    root.classList.remove(theme === 'dark' ? 'light' : 'dark');
    root.classList.add(theme);
  }, [theme]);

  const toggleTheme = () => {
    setTheme(theme === 'dark' ? 'light' : 'dark');
  };

  return [theme, toggleTheme];
};
