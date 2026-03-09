'use client';

import { X } from 'lucide-react';

interface RegenerateConfirmModalProps {
  isOpen: boolean;
  onClose: () => void;
  onUseExisting: () => void;
  onGenerateNew: () => void;
}

export default function RegenerateConfirmModal({
  isOpen,
  onClose,
  onUseExisting,
  onGenerateNew,
}: RegenerateConfirmModalProps) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full mx-4 overflow-hidden">
        {/* Header */}
        <div className="bg-gradient-to-r from-indigo-500 to-purple-600 p-6 relative">
          <button
            onClick={onClose}
            className="absolute top-4 right-4 text-white hover:bg-white/20 rounded-lg p-1 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
          <h2 className="text-2xl font-bold text-white text-right">
            ניתוח קיים נמצא
          </h2>
        </div>

        {/* Content */}
        <div className="p-6">
          <p className="text-gray-700 text-right mb-6 leading-relaxed">
            כבר יצרת ניתוח מסוג זה עבור הקובץ הזה. האם תרצה להשתמש בניתוח הקיים או ליצור ניתוח חדש?
          </p>

          <div className="space-y-3">
            {/* Use Existing Button */}
            <button
              onClick={onUseExisting}
              className="w-full bg-gradient-to-r from-green-500 to-emerald-600 hover:from-green-600 hover:to-emerald-700 text-white font-semibold py-3 px-6 rounded-xl transition-all duration-200 shadow-lg hover:shadow-xl transform hover:scale-[1.02]"
            >
              השתמש בניתוח הקיים
            </button>

            {/* Generate New Button */}
            <button
              onClick={onGenerateNew}
              className="w-full bg-gradient-to-r from-indigo-500 to-purple-600 hover:from-indigo-600 hover:to-purple-700 text-white font-semibold py-3 px-6 rounded-xl transition-all duration-200 shadow-lg hover:shadow-xl transform hover:scale-[1.02]"
            >
              צור ניתוח חדש
            </button>

            {/* Cancel Button */}
            <button
              onClick={onClose}
              className="w-full bg-gray-200 hover:bg-gray-300 text-gray-700 font-semibold py-3 px-6 rounded-xl transition-all duration-200"
            >
              ביטול
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
