'use client';

import React, { useRef, useEffect, useState } from 'react';
import { Expand } from 'lucide-react';
import ContextFilterMenu from './ContextFilterMenu';

interface ChatInputProps {
  value: string;
  isLoading: boolean;
  onChange: (value: string) => void;
  onSubmit: () => void;
  onCancel?: () => void;
  placeholder?: string;
  // Context filter props
  domainKnowledge?: {
    stateTaxCodes: string[];
    filingEntity: string;
  };
  profileTags?: string[];
  onDomainKnowledgeChange?: (updater: any) => void;
  onProfileTagsChange?: (tags: string[]) => void;
  // If true, render floating container relative to parent chat panel instead of viewport
  floatingWithinParent?: boolean;
  // Sidebar state for positioning adjustments
  sidebarOpen?: boolean;
  // Callback for expand text functionality
  onExpandText?: () => void;
}

export default function ChatInput({
  value,
  isLoading,
  onChange,
  onSubmit,
  onCancel,
  placeholder = 'Ask anything',
  domainKnowledge,
  profileTags = [],
  onDomainKnowledgeChange,
  onProfileTagsChange,
  floatingWithinParent = false,
  sidebarOpen = true,
  onExpandText,
}: ChatInputProps) {
  const contentEditableRef = useRef<HTMLDivElement>(null);
  const menuButtonRef = useRef<HTMLButtonElement>(null);
  const [isContextMenuOpen, setIsContextMenuOpen] = useState(false);

  // Sync contentEditable content with value prop
  useEffect(() => {
    if (contentEditableRef.current && contentEditableRef.current.textContent !== value) {
      contentEditableRef.current.textContent = value;
    }
  }, [value]);



  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      if (!isLoading && value.trim()) onSubmit();
    }
  };

  const handleInput = (e: React.FormEvent<HTMLDivElement>) => {
    const content = (e.currentTarget.textContent || '').toString();
    onChange(content);
  };

  // Check if we should show placeholder
  const shouldShowPlaceholder = !value || value.trim() === '';

  // Toggle context menu
  const toggleContextMenu = () => {
    setIsContextMenuOpen(!isContextMenuOpen);
  };

  // Close context menu
  const closeContextMenu = () => {
    setIsContextMenuOpen(false);
  };

  // Handle expand text button click
  const handleExpandClick = () => {
    if (onExpandText) {
      onExpandText();
    }
    // Close context menu when expanding
    setIsContextMenuOpen(false);
  };

  const containerClass = floatingWithinParent
    ? 'w-full pointer-events-auto'
    : 'fixed bottom-0 left-0 right-0 z-50 p-4 pointer-events-none';

  return (
    <div className={containerClass}>
      {!floatingWithinParent && (
        <>
          {/* Gradient overlay for smooth transition */}
          <div className="absolute inset-0 bg-gradient-to-t from-white via-white/80 to-transparent pointer-events-none" />
        </>
      )}
      <div className={`${floatingWithinParent ? 'w-full' : 'max-w-4xl mx-auto'} pointer-events-auto relative z-10`}>
        <div className="relative flex w-full flex-auto flex-col">
          <div className="relative mx-2 sm:mx-3 flex min-h-14 flex-auto items-start">
            <div
              className="prosemirror-parent text-gray-900 max-h-52 flex-1 overflow-auto rounded-xl focus-within:ring-2 focus-within:ring-blue-200/50 vertical-scroll-fade-mask relative bg-white border border-gray-200 shadow-sm"
              style={{ scrollbarWidth: 'thin' }}
            >
              <textarea
                className="sr-only"
                name="prompt-textarea"
                placeholder={placeholder}
                style={{ display: 'none' }}
                value={value}
                readOnly
                aria-hidden="true"
              />
              <div
                ref={contentEditableRef}
                contentEditable={!isLoading}
                translate="no"
                className="ProseMirror p-3 pr-32 min-h-14 max-h-52 overflow-auto focus:outline-none resize-none text-gray-900"
                id="prompt-textarea"
                data-virtualkeyboard="true"
                suppressContentEditableWarning={true}
                onInput={handleInput}
                onKeyDown={handleKeyDown}
                style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word', minHeight: '3.5rem' }}
                data-placeholder={shouldShowPlaceholder ? placeholder : undefined}
              />
              
              {/* Context Filter Menu Button */}
              <button
                ref={menuButtonRef}
                onClick={toggleContextMenu}
                disabled={isLoading}
                className="absolute right-24 bottom-3 h-8 w-8 rounded-lg transition-all duration-200 flex items-center justify-center bg-gray-100 hover:bg-gray-200 text-gray-600 disabled:opacity-50 disabled:cursor-not-allowed"
                aria-label="Open context filters"
                aria-haspopup="menu"
                aria-expanded={isContextMenuOpen}
                aria-controls="context-filter-menu"
                id="context-filter-trigger"
                title="Context Filters"
              >
                <svg width="16" height="16" viewBox="0 0 20 20" fill="currentColor">
                  <path d="M10 3a1.5 1.5 0 110 3 1.5 1.5 0 010-3zM10 8.5a1.5 1.5 0 110 3 1.5 1.5 0 010-3zM10 14a1.5 1.5 0 110 3 1.5 1.5 0 010-3z" />
                </svg>
              </button>

              {/* Expand Text Button */}
              <button
                onClick={handleExpandClick}
                disabled={isLoading}
                className="absolute right-12 bottom-3 h-8 w-8 rounded-lg transition-all duration-200 flex items-center justify-center bg-gray-100 hover:bg-gray-200 text-gray-600 disabled:opacity-50 disabled:cursor-not-allowed"
                aria-label="Expand text editor"
                title="Expand text editor"
              >
                <Expand className="w-4 h-4" />
              </button>

              {/* Send Button */}
              <button
                onClick={isLoading ? onCancel : onSubmit}
                disabled={!isLoading && !value.trim()}
                className={`absolute right-3 bottom-3 h-8 w-8 rounded-lg transition-all duration-200 flex items-center justify-center ${
                  isLoading
                    ? 'bg-red-600 hover:bg-red-700 text-white'
                    : !value.trim()
                    ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
                    : 'bg-black hover:bg-gray-800 text-white cursor-pointer'
                }`}
                aria-label={isLoading ? 'Cancel request' : 'Send message'}
                data-testid="send-button"
              >
                {isLoading ? (
                  <svg width="16" height="16" viewBox="0 0 20 20" fill="currentColor" className="icon">
                    <path d="M10 18a8 8 0 100-16 8 8 0 000 16zM8 7a1 1 0 012 0v6a1 1 0 11-2 0V7zM12 7a1 1 0 112 0v6a1 1 0 11-2 0V7z" />
                  </svg>
                ) : (
                  <svg width="16" height="16" viewBox="0 0 20 20" fill="currentColor" className="icon">
                    <path d="M8.99992 16V6.41407L5.70696 9.70704C5.31643 10.0976 4.68342 10.0976 4.29289 9.70704C3.90237 9.31652 3.90237 8.6835 4.29289 8.29298L9.29289 3.29298L9.36907 3.22462C9.76184 2.90427 10.3408 2.92686 10.707 3.29298L15.707 8.29298L15.7753 8.36915C16.0957 8.76192 16.0731 9.34092 15.707 9.70704C15.3408 10.0732 14.7618 10.0958 14.3691 9.7754L14.2929 9.70704L10.9999 6.41407V16C10.9999 16.5523 10.5522 17 9.99992 17C9.44764 17 8.99992 16.5523 8.99992 16Z" />
                  </svg>
                )}
              </button>

              {/* Context Filter Menu */}
              {domainKnowledge && onDomainKnowledgeChange && onProfileTagsChange && (
                <ContextFilterMenu
                  isOpen={isContextMenuOpen}
                  onClose={closeContextMenu}
                  domainKnowledge={domainKnowledge}
                  profileTags={profileTags}
                  onDomainKnowledgeChange={onDomainKnowledgeChange}
                  onProfileTagsChange={onProfileTagsChange}
                  triggerRef={menuButtonRef}
                />
              )}
            </div>
          </div>
        </div>
      </div>


    </div>
  );
}



