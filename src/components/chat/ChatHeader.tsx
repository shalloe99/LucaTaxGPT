'use client';

import React from 'react';

interface ChatHeaderProps {
  title: string;
  isEditingTitle: boolean;
  editingTitle: string;
  onTitleChange: (value: string) => void;
  onTitleEditStart: () => void;
  onTitleSave: () => void;
  isHydrated?: boolean;
  modelDisplayName?: string;
  isAsyncMode?: boolean;
}

export default function ChatHeader({
  title,
  isEditingTitle,
  editingTitle,
  onTitleChange,
  onTitleEditStart,
  onTitleSave,
  isHydrated,
  modelDisplayName,
  isAsyncMode,
}: ChatHeaderProps) {
  return (
    <div className="flex items-center justify-between p-4 border-b border-gray-200">
      <div className="flex items-center space-x-3">
        {isEditingTitle ? (
          <div className="flex items-center space-x-2">
            <input
              type="text"
              value={editingTitle}
              onChange={(e) => onTitleChange(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && onTitleSave()}
              onBlur={onTitleSave}
              className="text-lg font-semibold text-gray-900 bg-transparent border-b border-gray-300 focus:outline-none focus:border-blue-500"
              autoFocus
            />
          </div>
        ) : (
          <div className="flex items-center space-x-2">
            <h1
              className="text-lg font-semibold text-gray-900 cursor-pointer hover:text-blue-600"
              onClick={onTitleEditStart}
            >
              {title || 'Untitled Chat'}
            </h1>
            <button
              onClick={onTitleEditStart}
              className="p-1 text-gray-400 hover:text-gray-600 transition-colors"
              aria-label="Edit title"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
              </svg>
            </button>
          </div>
        )}
        {isHydrated && (
          <div className="flex items-center space-x-2">
            {modelDisplayName && (
              <span className="px-2 py-1 text-xs font-medium bg-blue-100 text-blue-800 rounded-full">
                {modelDisplayName}
              </span>
            )}
            {typeof isAsyncMode === 'boolean' && (
              <span
                className={`px-2 py-1 text-xs font-medium rounded-full ${
                  isAsyncMode ? 'bg-green-100 text-green-800' : 'bg-orange-100 text-orange-800'
                }`}
              >
                {isAsyncMode ? 'ASYNC' : 'SYNC'}
              </span>
            )}
          </div>
        )}
      </div>
      <div className="flex items-center space-x-2">
        {/* Copy settings button removed */}
      </div>
    </div>
  );
}


