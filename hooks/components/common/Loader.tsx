
import React from 'react';

interface LoaderProps {
  isButtonLoader?: boolean;
}

const Loader: React.FC<LoaderProps> = ({ isButtonLoader = false }) => {
  const baseClasses = 'animate-spin rounded-full border-4 border-solid';

  if (isButtonLoader) {
    return <div className={`${baseClasses} w-6 h-6 border-transparent border-t-current`} />
  }
  
  const themeClasses = 'border-gray-200 dark:border-gray-600 border-t-indigo-600 dark:border-t-indigo-400';
  const sizeClasses = 'w-8 h-8';

  return (
    <div className={`${baseClasses} ${themeClasses} ${sizeClasses}`} />
  );
};

export default Loader;
