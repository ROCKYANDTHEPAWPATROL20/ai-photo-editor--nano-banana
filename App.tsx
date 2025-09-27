import React, { useState, useRef, useCallback, useEffect } from 'react';
import { editImage, enhancePrompt, getImageSuggestions } from './services/geminiService';
import { fileToBase64, dataUrlToFile } from './utils/fileUtils';
import { UploadIcon, SparklesIcon, AlertTriangleIcon, DownloadIcon, XIcon, CompareIcon, ExpandIcon, TrashIcon, MagicWandIcon, LightbulbIcon } from './components/Icons';
import LoadingSpinner from './components/LoadingSpinner';
import ProgressBar from './components/ProgressBar';
import ConfirmationModal from './components/ConfirmationModal';

interface HistoryItem {
  id: string;
  image: string; // The result of the edit
  prompt: string; // The prompt used
  baseImage: string; // The image that was edited (original or previous edit)
}

const App: React.FC = () => {
  const [originalImageFile, setOriginalImageFile] = useState<File | null>(null);
  const [originalImageUrl, setOriginalImageUrl] = useState<string | null>(null);
  const [editedImageUrl, setEditedImageUrl] = useState<string | null>(null);
  const [prompt, setPrompt] = useState<string>('');
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [isEnhancingPrompt, setIsEnhancingPrompt] = useState<boolean>(false);
  const [isGeneratingSuggestions, setIsGeneratingSuggestions] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [modelResponseText, setModelResponseText] = useState<string | null>(null);
  const [isModalOpen, setIsModalOpen] = useState<boolean>(false);
  const [sliderPosition, setSliderPosition] = useState<number>(50);
  const [useEditedAsInput, setUseEditedAsInput] = useState<boolean>(false);
  const [progress, setProgress] = useState<number>(0);
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [isClearConfirmOpen, setIsClearConfirmOpen] = useState<boolean>(false);
  const [isDragging, setIsDragging] = useState<boolean>(false);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const progressIntervalRef = useRef<number | null>(null);
  const imageContainerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (isLoading) {
      setProgress(0);
      if (progressIntervalRef.current) clearInterval(progressIntervalRef.current);
      
      progressIntervalRef.current = window.setInterval(() => {
        setProgress((prev) => {
          if (prev >= 95) {
            if (progressIntervalRef.current) clearInterval(progressIntervalRef.current);
            return prev;
          }
          // Simulate slower progress towards the end
          if (prev > 80) return prev + 1;
          if (prev > 50) return prev + 3;
          return prev + 5;
        });
      }, 300);
    } else {
      if (progressIntervalRef.current) {
        clearInterval(progressIntervalRef.current);
        progressIntervalRef.current = null;
      }
      if (progress > 0 && progress < 100) {
        setProgress(100);
        setTimeout(() => setProgress(0), 1000);
      }
    }

    return () => {
      if (progressIntervalRef.current) {
        clearInterval(progressIntervalRef.current);
      }
    };
  }, [isLoading]);

  const generateSuggestions = useCallback(async (imageFile: File) => {
    setIsGeneratingSuggestions(true);
    setSuggestions([]);
    setError(null);
    try {
        const { base64Data, mimeType } = await fileToBase64(imageFile);
        const newSuggestions = await getImageSuggestions(base64Data, mimeType);
        setSuggestions(newSuggestions);
    } catch (err) {
        const message = err instanceof Error ? err.message : 'An unknown error occurred.';
        setError(`Failed to get suggestions: ${message}`);
    } finally {
        setIsGeneratingSuggestions(false);
    }
  }, []);

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      setIsModalOpen(false); // Gracefully close modal before resetting state
      setOriginalImageFile(file);
      setOriginalImageUrl(URL.createObjectURL(file));
      setEditedImageUrl(null);
      setModelResponseText(null);
      setError(null);
      setSliderPosition(50);
      setUseEditedAsInput(false);
      setHistory([]);
      setSuggestions([]); // Clear previous suggestions immediately
      generateSuggestions(file);
    }
  };

  const handleUploadClick = () => {
    fileInputRef.current?.click();
  };

  const handleDownload = useCallback(() => {
    if (!editedImageUrl) return;
    const link = document.createElement('a');
    link.href = editedImageUrl;
    const mimeType = editedImageUrl.split(';')[0].split(':')[1];
    const extension = mimeType.split('/')[1] || 'png';
    link.download = `edited-image-${Date.now()}.${extension}`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }, [editedImageUrl]);
  
  const handleEnhancePrompt = useCallback(async () => {
    if (!prompt.trim()) return;

    setIsEnhancingPrompt(true);
    setError(null);
    try {
        const enhanced = await enhancePrompt(prompt);
        setPrompt(enhanced);
    } catch (err) {
        const message = err instanceof Error ? err.message : 'An unknown error occurred.';
        setError(`Prompt enhancement failed: ${message}`);
    } finally {
        setIsEnhancingPrompt(false);
    }
  }, [prompt]);


  const handleSubmit = useCallback(async () => {
    const sourceFileExists = originalImageFile || (useEditedAsInput && editedImageUrl);
    if (!sourceFileExists || !prompt) {
      setError('Please upload an image and provide an editing prompt.');
      return;
    }

    setIsLoading(true);
    setError(null);
    setModelResponseText(null);

    try {
      let base64Data: string;
      let mimeType: string;

      if (useEditedAsInput && editedImageUrl) {
        const [header, data] = editedImageUrl.split(',');
        const mimeTypeMatch = header.match(/:(.*?);/);
        if (!data || !mimeTypeMatch || !mimeTypeMatch[1]) {
          throw new Error('Could not parse edited image data URL.');
        }
        base64Data = data;
        mimeType = mimeTypeMatch[1];
      } else if (originalImageFile) {
        const result = await fileToBase64(originalImageFile);
        base64Data = result.base64Data;
        mimeType = result.mimeType;
      } else {
        throw new Error('No image source available.');
      }

      const result = await editImage(base64Data, mimeType, prompt);

      if (result.newImage && result.mimeType) {
        const newEditedImageUrl = `data:${result.mimeType};base64,${result.newImage}`;

        const baseImageForHistory = (useEditedAsInput && editedImageUrl) ? editedImageUrl : originalImageUrl;
        if (baseImageForHistory) {
          const newHistoryItem: HistoryItem = {
            id: `${Date.now()}-${Math.random()}`,
            image: newEditedImageUrl,
            prompt,
            baseImage: baseImageForHistory,
          };
          setHistory(prev => [newHistoryItem, ...prev]);
        }

        if (useEditedAsInput && editedImageUrl) {
          const newOriginalFile = await dataUrlToFile(
            editedImageUrl,
            originalImageFile?.name || 'edited-image.png',
            { type: mimeType }
          );
          setOriginalImageFile(newOriginalFile);
          setOriginalImageUrl(editedImageUrl);
        }
        
        setEditedImageUrl(newEditedImageUrl);
        setUseEditedAsInput(true);
      } else {
        setError('The AI did not return an edited image. Please try a different prompt.');
      }
      
      if (result.text) {
        setModelResponseText(result.text);
      }

    } catch (err) {
      console.error(err);
      const message = err instanceof Error ? err.message : 'An unknown error occurred.';
      setError(message);
    } finally {
      setIsLoading(false);
      setSliderPosition(50);
    }
  }, [originalImageFile, prompt, useEditedAsInput, editedImageUrl, originalImageUrl]);

  const handleClearAll = useCallback(() => {
    setOriginalImageFile(null);
    setOriginalImageUrl(null);
    setEditedImageUrl(null);
    setPrompt('');
    setError(null);
    setModelResponseText(null);
    setSliderPosition(50);
    setIsModalOpen(false);
    setUseEditedAsInput(false);
    setSuggestions([]);
    setIsGeneratingSuggestions(false);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  }, []);

  const handleHistoryClick = useCallback(async (item: HistoryItem, index: number) => {
    // Truncate the history. The clicked item becomes the new "head".
    const newHistory = history.slice(index);
    setHistory(newHistory);

    // Set the UI state to reflect this historical point
    setOriginalImageUrl(item.baseImage);
    setEditedImageUrl(item.image);

    // Prepare for the next iterative edit from this point
    setPrompt('');
    setUseEditedAsInput(true);
    setError(null);
    setModelResponseText(null);
    setSliderPosition(50);
    
    // We also need to update the underlying file reference
    try {
        const newOriginalFile = await dataUrlToFile(
            item.baseImage, 
            'history-image.png'
        );
        setOriginalImageFile(newOriginalFile);
        setSuggestions([]); // Clear previous suggestions immediately
        generateSuggestions(newOriginalFile);
    } catch (err) {
        console.error("Failed to create file from history data URL", err);
        setError("Could not load the selected history state.");
    }
  }, [history, generateSuggestions]);

  const handleConfirmClearHistory = useCallback(() => {
    setHistory([]);
    setIsClearConfirmOpen(false);
  }, []);

  const handleSliderUpdate = useCallback((clientX: number) => {
    if (!imageContainerRef.current) return;
    const rect = imageContainerRef.current.getBoundingClientRect();
    const x = clientX - rect.left;
    let percentage = (x / rect.width) * 100;
    percentage = Math.max(0, Math.min(100, percentage));
    setSliderPosition(percentage);
  }, []);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
      e.preventDefault();
      setIsDragging(true);
      handleSliderUpdate(e.clientX);
  }, [handleSliderUpdate]);

  const handleTouchStart = useCallback((e: React.TouchEvent) => {
      setIsDragging(true);
      handleSliderUpdate(e.touches[0].clientX);
  }, [handleSliderUpdate]);

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => handleSliderUpdate(e.clientX);
    const handleTouchMove = (e: TouchEvent) => handleSliderUpdate(e.touches[0].clientX);

    const handleDragEnd = () => setIsDragging(false);

    if (isDragging) {
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('touchmove', handleTouchMove);
      document.addEventListener('mouseup', handleDragEnd);
      document.addEventListener('touchend', handleDragEnd);
    }

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('touchmove', handleTouchMove);
      document.removeEventListener('mouseup', handleDragEnd);
      document.removeEventListener('touchend', handleDragEnd);
    };
  }, [isDragging, handleSliderUpdate]);

  return (
    <div className="min-h-screen bg-gray-900 text-gray-100 flex flex-col">
      <header className="bg-gray-800/50 backdrop-blur-sm border-b border-gray-700 sticky top-0 z-10">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center space-x-3">
              <SparklesIcon className="w-8 h-8 text-indigo-400" />
              <h1 className="text-xl sm:text-2xl font-bold text-white">Nano Banana AI Editor</h1>
            </div>
          </div>
        </div>
      </header>

      <main className="flex-grow container mx-auto p-4 sm:p-6 lg:p-8">
        <div className="flex flex-col lg:flex-row gap-8">
          {/* Controls Column */}
          <div className="w-full lg:w-1/3 lg:max-w-md flex flex-col gap-6">
            <div className="bg-gray-800 rounded-xl p-6 border border-gray-700">
              <h2 className="text-lg font-semibold mb-4 text-white">1. Upload Image</h2>
              <input
                type="file"
                ref={fileInputRef}
                onChange={handleFileChange}
                accept="image/png, image/jpeg, image/webp"
                className="hidden"
              />
              <button
                onClick={handleUploadClick}
                className="w-full flex flex-col items-center justify-center border-2 border-dashed border-gray-600 hover:border-indigo-400 rounded-lg p-8 transition-colors duration-300 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 focus:ring-offset-gray-900"
              >
                <UploadIcon className="w-12 h-12 text-gray-400 mb-2" />
                <span className="text-gray-400 font-medium">Click to upload an image</span>
                <span className="text-xs text-gray-500 mt-1">PNG, JPG, WEBP</span>
              </button>
            </div>
            
            <div className="bg-gray-800 rounded-xl p-6 border border-gray-700">
               <div className="flex justify-between items-center mb-4">
                  <h2 className="text-lg font-semibold text-white">2. Describe Your Edit</h2>
                  <button
                      onClick={handleEnhancePrompt}
                      disabled={!prompt.trim() || isLoading || isEnhancingPrompt || isGeneratingSuggestions}
                      className="flex items-center text-sm text-indigo-400 hover:text-indigo-300 disabled:text-gray-500 disabled:cursor-not-allowed transition-colors font-medium"
                      title="Enhance prompt with AI"
                      aria-label="Enhance prompt with AI"
                  >
                      {isEnhancingPrompt ? (
                          <LoadingSpinner className="w-4 h-4 mr-2" />
                      ) : (
                          <MagicWandIcon className="w-5 h-5 mr-1" />
                      )}
                      <span>Enhance</span>
                  </button>
              </div>
              <div className="relative">
                <textarea
                  value={prompt}
                  onChange={(e) => setPrompt(e.target.value)}
                  placeholder="e.g., 'add a cute cat wearing sunglasses next to the person' or 'make the sky look like a vibrant sunset'"
                  className="w-full h-32 p-3 pr-10 bg-gray-900 border border-gray-600 rounded-md focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition-colors placeholder-gray-500 custom-resizable"
                  disabled={!originalImageFile || isEnhancingPrompt || isGeneratingSuggestions}
                />
                {prompt && (
                  <button
                    onClick={() => setPrompt('')}
                    className="absolute top-3 right-3 text-gray-500 hover:text-white transition-colors duration-200"
                    aria-label="Clear prompt"
                    title="Clear prompt"
                  >
                    <TrashIcon className="w-5 h-5" />
                  </button>
                )}
              </div>
            </div>

            <div className="bg-gray-800 rounded-xl p-6 border border-gray-700">
              <div className="flex items-center gap-2 mb-4">
                <LightbulbIcon className="w-6 h-6 text-yellow-400" />
                <h2 className="text-lg font-semibold text-white">Need inspiration?</h2>
              </div>
              {isGeneratingSuggestions && (
                <div className="flex items-center text-gray-400 text-sm">
                  <LoadingSpinner className="w-4 h-4 mr-2" />
                  <span>Analyzing image for ideas...</span>
                </div>
              )}
              {!isGeneratingSuggestions && suggestions.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {suggestions.map((suggestion, index) => (
                    <button
                      key={index}
                      onClick={() => setPrompt(suggestion)}
                      className="bg-gray-700 hover:bg-indigo-500/50 text-gray-300 hover:text-white text-sm font-medium py-1.5 px-3 rounded-full transition-colors duration-200"
                      title="Use this suggestion"
                    >
                      {suggestion}
                    </button>
                  ))}
                </div>
              )}
              {!isGeneratingSuggestions && suggestions.length === 0 && originalImageUrl && !error && (
                <p className="text-sm text-gray-500">Suggestions will appear here once the AI has analyzed the image.</p>
              )}
              {!originalImageUrl && (
                <p className="text-sm text-gray-500">Upload an image to get AI-powered editing suggestions.</p>
              )}
            </div>

            {history.length > 0 && (
              <div className="bg-gray-800 rounded-xl p-6 border border-gray-700">
                <div className="flex justify-between items-center mb-4">
                  <h2 className="text-lg font-semibold text-white">Edit History</h2>
                  <button
                    onClick={() => setIsClearConfirmOpen(true)}
                    className="text-gray-400 hover:text-red-400 transition-colors p-1 -mr-1"
                    title="Clear all history"
                    aria-label="Clear all edit history"
                  >
                    <TrashIcon className="w-5 h-5" />
                  </button>
                </div>
                <div className="grid grid-cols-3 sm:grid-cols-4 gap-3 max-h-48 overflow-y-auto pr-2">
                  {history.map((item, index) => (
                    <button
                      key={item.id}
                      onClick={() => handleHistoryClick(item, index)}
                      className="relative aspect-square rounded-md overflow-hidden group focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 focus:ring-offset-gray-800"
                      title={`Prompt: "${item.prompt}"`}
                    >
                      <img src={item.image} alt={`Edit with prompt: ${item.prompt}`} className="w-full h-full object-cover" />
                      <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center p-1">
                         {/* Using a div for better text control with line-clamp */}
                        <div className="text-white text-xs text-center leading-tight overflow-hidden" style={{display: '-webkit-box', WebkitBoxOrient: 'vertical', WebkitLineClamp: 3}}>
                          {item.prompt}
                        </div>
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            )}
            
            {editedImageUrl && !isLoading && (
              <div className="flex items-center -mt-2 mb-2 bg-gray-800 p-3 rounded-lg border border-gray-700">
                <input
                  id="use-edited-checkbox"
                  type="checkbox"
                  checked={useEditedAsInput}
                  onChange={(e) => setUseEditedAsInput(e.target.checked)}
                  className="w-4 h-4 text-indigo-600 bg-gray-700 border-gray-600 rounded focus:ring-indigo-500 focus:ring-offset-gray-800 focus:ring-2"
                />
                <label htmlFor="use-edited-checkbox" className="ml-3 text-sm font-medium text-gray-300 cursor-pointer">
                  Use edited image as new input
                </label>
              </div>
            )}
            
            <div className="space-y-3">
              <button
                onClick={handleSubmit}
                disabled={!originalImageFile || !prompt || isLoading || isEnhancingPrompt || isGeneratingSuggestions}
                className="w-full flex items-center justify-center bg-indigo-600 hover:bg-indigo-700 disabled:bg-gray-600 disabled:cursor-not-allowed text-white font-bold py-3 px-4 rounded-lg transition-all duration-300 transform hover:scale-105 disabled:scale-100"
              >
                {isLoading ? (
                  <>
                    <LoadingSpinner className="w-5 h-5 mr-3"/>
                    Generating...
                  </>
                ) : (
                  <>
                    <SparklesIcon className="w-5 h-5 mr-2" />
                    Generate Edit
                  </>
                )}
              </button>

              <button
                onClick={handleClearAll}
                disabled={!originalImageFile && !prompt && !editedImageUrl}
                className="w-full flex items-center justify-center bg-transparent border border-gray-600 hover:bg-gray-700/50 disabled:opacity-50 disabled:cursor-not-allowed text-gray-400 hover:text-white font-medium py-3 px-4 rounded-lg transition-colors duration-300"
              >
                <TrashIcon className="w-5 h-5 mr-2" />
                Clear All
              </button>
            </div>

            {error && (
              <div className="bg-red-900/50 border border-red-700 text-red-300 p-4 rounded-lg flex items-start space-x-3">
                <AlertTriangleIcon className="w-5 h-5 mt-0.5 flex-shrink-0"/>
                <span>{error}</span>
              </div>
            )}
          </div>

          {/* Image Comparison View */}
          <div className="w-full lg:w-2/3 flex flex-col gap-4 lg:resize custom-resizable lg:overflow-auto rounded-lg border border-gray-700 p-2 min-w-[300px] aspect-square sm:aspect-[4/3] lg:aspect-auto lg:min-h-[500px] lg:max-h-[calc(100vh-10rem)]">
            <div
              ref={imageContainerRef}
              onMouseDown={editedImageUrl && !isLoading ? handleMouseDown : undefined}
              onTouchStart={editedImageUrl && !isLoading ? handleTouchStart : undefined}
              className={`relative flex-grow bg-gray-800 border border-gray-700 rounded-xl flex items-center justify-center overflow-hidden group ${
                editedImageUrl && !isLoading ? 'cursor-ew-resize' : ''
              }`}
              style={{ touchAction: 'none' }}
            >
              {isLoading && (
                <div className="absolute inset-0 bg-gray-900/80 backdrop-blur-sm flex flex-col items-center justify-center z-30 p-8 text-center">
                  <LoadingSpinner className="w-12 h-12 text-indigo-400"/>
                  <p className="mt-4 text-lg font-medium text-gray-300">AI is working its magic...</p>
                  {progress > 0 && <ProgressBar progress={progress} className="mt-4 max-w-sm w-full" />}
                </div>
              )}

              {!originalImageUrl && !isLoading && (
                <div className="text-center text-gray-500 px-4">
                  <SparklesIcon className="w-16 h-16 mx-auto text-gray-600"/>
                  <p className="mt-2">Your edited image will appear here</p>
                </div>
              )}
              
              {originalImageUrl && (
                 <div className="absolute inset-0 flex items-center justify-center">
                    <img src={originalImageUrl} alt="Original" className="block max-w-full max-h-full object-contain pointer-events-none select-none" />
                </div>
              )}
              
              {originalImageUrl && editedImageUrl && !isLoading && (
                <>
                  <div
                    className="absolute top-2 left-2 bg-black/60 text-white text-xs font-semibold uppercase tracking-wider py-1 px-3 rounded-full backdrop-blur-sm z-20 pointer-events-none select-none transition-opacity duration-300"
                    style={{ opacity: sliderPosition > 50 ? 1 : 0 }}
                  >
                    After
                  </div>
                  
                  <div
                    className="absolute top-2 right-2 bg-black/60 text-white text-xs font-semibold uppercase tracking-wider py-1 px-3 rounded-full backdrop-blur-sm z-20 pointer-events-none select-none transition-opacity duration-300"
                    style={{ opacity: sliderPosition < 50 ? 1 : 0 }}
                  >
                    Before
                  </div>

                  <div 
                    className="absolute inset-0 flex items-center justify-center"
                    style={{ clipPath: `inset(0 ${100 - sliderPosition}% 0 0)` }}
                  >
                    <img src={editedImageUrl} alt="Edited" className="block max-w-full max-h-full object-contain pointer-events-none select-none" />
                  </div>
                  
                  <div 
                    className="absolute top-0 bottom-0 w-1 bg-white/50 z-20 pointer-events-none" 
                    style={{ left: `calc(${sliderPosition}% - 0.5px)`}}
                  >
                    <div className="absolute top-1/2 -translate-y-1/2 -left-3.5 bg-white shadow-lg rounded-full p-1">
                      <CompareIcon className="w-5 h-5 text-gray-800 rotate-90" />
                    </div>
                  </div>
                                    
                  <button 
                    onClick={() => setIsModalOpen(true)}
                    className="absolute bottom-4 right-4 bg-gray-900/50 hover:bg-gray-900 text-white rounded-full p-2 backdrop-blur-sm transition-all z-20 opacity-0 group-hover:opacity-100"
                    aria-label="Enlarge image"
                  >
                    <ExpandIcon className="h-5 w-5" />
                  </button>
                </>
              )}
            </div>

            <div className="flex items-center justify-between gap-4 mt-auto pt-2">
                <div className="flex items-center gap-4">
                  {editedImageUrl && <span className="text-sm text-gray-400">Original vs. Edited (Slide to compare)</span>}
                </div>
                {editedImageUrl && !isLoading && (
                    <button
                        onClick={handleDownload}
                        className="flex items-center justify-center bg-gray-700 hover:bg-gray-600 text-white font-bold py-2 px-4 rounded-lg transition-colors duration-300"
                    >
                        <DownloadIcon className="w-5 h-5 mr-2" />
                        Download
                    </button>
                )}
            </div>

             {modelResponseText && !isLoading && (
              <div className="text-sm text-gray-400 bg-gray-800 p-3 rounded-md border border-gray-700">
                <p className="font-semibold text-gray-300 mb-1">AI's Comment:</p>
                <p>{modelResponseText}</p>
              </div>
             )}
          </div>
        </div>
      </main>

      {isModalOpen && editedImageUrl && (
          <div 
              className="fixed inset-0 bg-black/90 backdrop-blur-lg flex items-center justify-center z-50 animate-fade-in"
              onClick={() => setIsModalOpen(false)}
              aria-modal="true"
              role="dialog"
          >
              <div 
                  className="relative max-w-5xl w-full max-h-[90vh] p-4"
                  onClick={(e) => e.stopPropagation()}
              >
                  <img src={editedImageUrl} alt="Edited preview" className="w-full h-full object-contain" />
              </div>
              <button
                  onClick={handleUploadClick}
                  className="absolute top-4 left-4 text-white/70 hover:text-white transition-colors"
                  aria-label="Upload new image"
              >
                  <UploadIcon className="w-10 h-10"/>
              </button>
              <button 
                  onClick={() => setIsModalOpen(false)}
                  className="absolute top-4 right-4 text-white/70 hover:text-white transition-colors"
                  aria-label="Close modal"
              >
                  <XIcon className="w-10 h-10"/>
              </button>
          </div>
      )}

      <ConfirmationModal
        isOpen={isClearConfirmOpen}
        onClose={() => setIsClearConfirmOpen(false)}
        onConfirm={handleConfirmClearHistory}
        title="Clear Edit History"
      >
        <p>Are you sure you want to permanently delete all edit history?</p>
        <p className="mt-2 text-sm text-gray-400">This action cannot be undone.</p>
      </ConfirmationModal>

    </div>
  );
};

export default App;