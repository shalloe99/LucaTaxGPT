'use client';

import React from 'react';
import { Expand } from 'lucide-react';

interface ChatWelcomeOverlayProps {
  inputMessage: string;
  isLoading: boolean;
  pendingNewChat: boolean;
  showWelcomeOverlay: boolean;
  onInputChange: (value: string) => void;
  onFirstMessage: () => void;
  onExpandText: () => void;
  onKeyPress: (e: React.KeyboardEvent) => void;
}

export default function ChatWelcomeOverlay({
  inputMessage,
  isLoading,
  pendingNewChat,
  showWelcomeOverlay,
  onInputChange,
  onFirstMessage,
  onExpandText,
  onKeyPress
}: ChatWelcomeOverlayProps) {
  if (!showWelcomeOverlay && !pendingNewChat) return null;

  return (
    <div
      className={`absolute inset-0 bg-white transition-all duration-150 ease-out ${
        pendingNewChat
          ? 'opacity-100 translate-y-0 pointer-events-auto'
          : 'opacity-0 -translate-y-2 pointer-events-none'
      }`}
    >
      <div className="flex items-center justify-center h-full p-6 pb-20">
        <div className="w-full max-w-2xl mx-auto animate-in slide-in-from-bottom-2 duration-150">
          <div className="text-center text-gray-700 mb-6">
            <div className="text-3xl font-bold mb-2">Welcome to LucaTaxGPT</div>
            <div className="text-sm text-gray-500">Ask anything about taxes. I'll cite and explain using official sources.</div>
          </div>
          {/* Match floating entry panel styling */}
          <div className="bg-white border border-gray-200 rounded-2xl shadow-sm p-4 sm:p-5 animate-in fade-in duration-150">
            <div className="relative flex items-start gap-3">
              <textarea
                value={inputMessage}
                onChange={(e) => onInputChange(e.target.value)}
                onKeyPress={onKeyPress}
                placeholder="Type your message to begin..."
                className="flex-1 w-full p-3 sm:p-3.5 border border-gray-200 bg-white rounded-xl resize-none focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent text-gray-900"
                rows={3}
              />
              <div className="flex items-center gap-2">
                <button
                  onClick={onExpandText}
                  disabled={isLoading}
                  className="h-10 sm:h-11 shrink-0 px-3 bg-gray-100 text-gray-600 rounded-xl hover:bg-gray-200 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  title="Expand text editor"
                >
                  <Expand className="w-4 h-4" />
                </button>
                <button
                  onClick={onFirstMessage}
                  disabled={!inputMessage.trim() || isLoading}
                  className="h-10 sm:h-11 shrink-0 px-4 sm:px-5 bg-black text-white rounded-xl hover:bg-gray-800 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  {isLoading ? 'Sending...' : 'Send'}
                </button>
              </div>
            </div>
            <div className="mt-3 text-xs text-gray-400 text-center">Press Enter to send • Shift+Enter for a new line</div>
          </div>
        </div>
      </div>
    </div>
  );
}
