'use client';

import React, { useRef, useEffect } from 'react';
import { Expand } from 'lucide-react';
import ContextFilterMenu from './ContextFilterMenu';

interface DomainKnowledge {
  stateTaxCodes: string[];
  filingEntity: string;
}

interface UserProfile {
  tags: string[];
  context: string;
}

interface ExpandedTextEditorProps {
  isOpen: boolean;
  expandedText: string;
  isLoading: boolean;
  domainKnowledge: DomainKnowledge;
  profileTags: string[];
  onTextChange: (value: string) => void;
  onClose: () => void;
  onApply: () => void;
  onSend: () => void;
  onDomainKnowledgeChange: (updater: any) => void;
  onProfileTagsChange: (tags: string[]) => void;
}

export default function ExpandedTextEditor({
  isOpen,
  expandedText,
  isLoading,
  domainKnowledge,
  profileTags,
  onTextChange,
  onClose,
  onApply,
  onSend,
  onDomainKnowledgeChange,
  onProfileTagsChange
}: ExpandedTextEditorProps) {
  const expandTextareaRef = useRef<HTMLTextAreaElement>(null);
  const expandedContextMenuRef = useRef<HTMLButtonElement>(null);
  const [isExpandedContextMenuOpen, setIsExpandedContextMenuOpen] = React.useState(false);

  // Focus the textarea after a short delay to ensure it's rendered
  useEffect(() => {
    if (isOpen) {
      setTimeout(() => {
        expandTextareaRef.current?.focus();
      }, 100);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      onClose();
    } else if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      onApply();
    }
  };

  return (
    <div className="absolute inset-0 bg-white/80 backdrop-blur-md z-50 flex flex-col p-8">
      {/* Main content area with subtle border */}
      <div className="flex-1 flex flex-col bg-white/60 backdrop-blur-sm rounded-2xl border border-white/40 shadow-xl">
        {/* Large textarea - taking most space */}
        <div className="flex-1 p-8 min-h-0">
          <textarea
            ref={expandTextareaRef}
            value={expandedText}
            onChange={(e) => onTextChange(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Type your message..."
            className="w-full h-full p-6 bg-white/70 backdrop-blur-sm border border-gray-200/50 rounded-xl resize-none focus:outline-none focus:ring-1 focus:ring-blue-400/50 focus:border-blue-400/50 text-gray-900 text-lg leading-relaxed placeholder-gray-400"
            style={{ fontFamily: 'inherit' }}
          />
        </div>

        {/* Bottom area with controls and footnotes */}
        <div className="flex items-center justify-between px-8 pb-6">
          {/* Left side - unremarkable footnote style info */}
          <div className="flex items-center gap-6 text-xs text-gray-400 font-mono">
            <span>{expandedText.length} chars</span>
            <span>{expandedText.split('\n').length} lines</span>
            <span className="opacity-60">⌘↵ apply • esc cancel</span>
          </div>

          {/* Right side - action buttons using same icons as text entry */}
          <div className="flex items-center gap-3">
            {/* Context menu button - opens context filters */}
            <button
              ref={expandedContextMenuRef}
              onClick={() => setIsExpandedContextMenuOpen(!isExpandedContextMenuOpen)}
              className="p-2 rounded-lg text-gray-500 hover:text-gray-700 hover:bg-white/50 transition-all duration-200"
              title="Context filters"
            >
              <svg width="16" height="16" viewBox="0 0 20 20" fill="currentColor">
                <path d="M10 3a1.5 1.5 0 110 3 1.5 1.5 0 010-3zM10 8.5a1.5 1.5 0 110 3 1.5 1.5 0 010-3zM10 14a1.5 1.5 0 110 3 1.5 1.5 0 010-3z" />
              </svg>
            </button>
            
            {/* Expand button (collapse when in expanded mode) */}
            <button
              onClick={onClose}
              className="p-2 rounded-lg text-gray-500 hover:text-gray-700 hover:bg-white/50 transition-all duration-200"
              title="Collapse"
            >
              <Expand className="w-4 h-4 rotate-180" />
            </button>

            {/* Send button - sends message directly and shrinks */}
            <button
              onClick={onSend}
              disabled={!expandedText.trim() || isLoading}
              className={`p-2 rounded-lg transition-all duration-200 ${
                !expandedText.trim() || isLoading
                  ? 'text-gray-300 cursor-not-allowed'
                  : 'text-gray-600 hover:text-gray-800 hover:bg-white/70'
              }`}
              title="Send message"
            >
              <svg width="16" height="16" viewBox="0 0 20 20" fill="currentColor">
                <path d="M8.99992 16V6.41407L5.70696 9.70704C5.31643 10.0976 4.68342 10.0976 4.29289 9.70704C3.90237 9.31652 3.90237 8.6835 4.29289 8.29298L9.29289 3.29298L9.36907 3.22462C9.76184 2.90427 10.3408 2.92686 10.707 3.29298L15.707 8.29298L15.7753 8.36915C16.0957 8.76192 16.0731 9.34092 15.707 9.70704C15.3408 10.0732 14.7618 10.0958 14.3691 9.7754L14.2929 9.70704L10.9999 6.41407V16C10.9999 16.5523 10.5522 17 9.99992 17C9.44764 17 8.99992 16.5523 8.99992 16Z" />
              </svg>
            </button>
          </div>
        </div>

        {/* Context Filter Menu for Expanded Editor */}
        <ContextFilterMenu
          isOpen={isExpandedContextMenuOpen}
          onClose={() => setIsExpandedContextMenuOpen(false)}
          domainKnowledge={domainKnowledge}
          profileTags={profileTags}
          onDomainKnowledgeChange={onDomainKnowledgeChange}
          onProfileTagsChange={onProfileTagsChange}
          triggerRef={expandedContextMenuRef}
        />
      </div>
    </div>
  );
}
