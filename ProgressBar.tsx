import React from 'react';

interface ProgressBarProps {
  progress: number;
  className?: string;
}

const ProgressBar: React.FC<ProgressBarProps> = ({ progress, className = '' }) => {
  const clampedProgress = Math.min(100, Math.max(0, progress));

  if (progress === 0) {
    return null;
  }

  return (
    <div className={`w-full bg-gray-700 rounded-full h-2.5 transition-opacity duration-500 ${className} ${progress === 100 ? 'opacity-0' : 'opacity-100'}`}>
      <div
        className="bg-indigo-500 h-2.5 rounded-full transition-all duration-300 ease-out"
        style={{ width: `${clampedProgress}%` }}
        role="progressbar"
        aria-valuenow={clampedProgress}
        aria-valuemin={0}
        aria-valuemax={100}
      ></div>
    </div>
  );
};

export default ProgressBar;
