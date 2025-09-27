import React from 'react';
import { AlertTriangleIcon, XIcon } from './Icons';

interface ConfirmationModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  children: React.ReactNode;
}

const ConfirmationModal: React.FC<ConfirmationModalProps> = ({ isOpen, onClose, onConfirm, title, children }) => {
  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-50 animate-fade-in"
      onClick={onClose}
      aria-modal="true"
      role="dialog"
    >
      <div
        className="bg-gray-800 rounded-xl border border-gray-700 shadow-2xl p-6 w-full max-w-md m-4 flex flex-col gap-4"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex justify-between items-center">
          <h2 className="text-xl font-bold text-white">{title}</h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-white transition-colors"
            aria-label="Close modal"
          >
            <XIcon className="w-6 h-6" />
          </button>
        </div>

        <div className="flex items-start gap-4 text-gray-300">
           <AlertTriangleIcon className="w-12 h-12 text-yellow-500 flex-shrink-0 mt-1" />
           <div>{children}</div>
        </div>

        <div className="flex justify-end items-center gap-3 pt-2">
          <button
            onClick={onClose}
            className="bg-gray-700 hover:bg-gray-600 text-white font-medium py-2 px-4 rounded-lg transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            className="bg-red-600 hover:bg-red-700 text-white font-bold py-2 px-4 rounded-lg transition-colors"
          >
            Confirm & Delete
          </button>
        </div>
      </div>
    </div>
  );
};

export default ConfirmationModal;
