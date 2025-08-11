'use client';

import React from 'react';
import { ThumbsUp, ThumbsDown, PencilLine, ChevronLeft, ChevronRight, RotateCcw, Copy } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

interface MessageBubbleProps {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
  status?: 'complete' | 'streaming' | 'cancelled' | 'error' | 'pending';
  liked?: boolean;
  disliked?: boolean;
  onCopy?: (content: string) => void;
  onLike?: (messageId: string) => void;
  onDislike?: (messageId: string) => void;
  onEditUser?: (messageId: string) => void;
  overrideContent?: string;
  // Assistant controls
  variantIndex?: number;
  variantTotal?: number;
  onVariantPrev?: (assistantMessageId: string) => void;
  onVariantNext?: (assistantMessageId: string) => void;
  onTryAgain?: (assistantMessageId: string, mode: 'default' | 'concise' | 'detailed') => void;
  isLatestVariantStreaming?: boolean;
}

export default function MessageBubble({
  id,
  role,
  content,
  timestamp,
  status,
  liked,
  disliked,
  onCopy,
  onLike,
  onDislike,
  onEditUser,
  overrideContent,
  variantIndex,
  variantTotal,
  onVariantPrev,
  onVariantNext,
  onTryAgain,
  isLatestVariantStreaming,
}: MessageBubbleProps) {
  const isUser = role === 'user';

  return (
    <div className={`group/turn-messages flex ${isUser ? 'justify-end' : 'justify-start'}`}>
      <div
        className={`relative rounded-2xl ${
          isUser
            ? 'bg-gray-800 text-white'
            : 'bg-white text-gray-900 border border-gray-200'
        } ${
          isUser
            ? 'max-w-[68%] md:max-w-[60%]'
            : 'max-w-[92%] md:max-w-[85%]'
        } p-3`}
      >
        <div className="prose prose-sm max-w-none leading-relaxed">
          {isUser ? (
            <div
              dangerouslySetInnerHTML={{
                __html: (overrideContent ?? content).replace(/\n/g, '<br>'),
              }}
            />
          ) : (
            <ReactMarkdown remarkPlugins={[remarkGfm]}>
              {overrideContent ?? content}
            </ReactMarkdown>
          )}
          {status === 'streaming' && (
            <span className="inline-flex items-center ml-1">
              <span className="animate-pulse text-blue-500">▊</span>
            </span>
          )}
        </div>

        {/* Compact Actions + Timestamp Row */}
        <div className="flex items-center justify-between mt-1">
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1 p-1">
            
            {/* Copy Button */}
            {onCopy && (
              <div className="relative group/button">
                <button
                  onClick={() => onCopy(content)}
                  className="text-token-text-secondary text-gray-500 hover:bg-token-bg-secondary hover:bg-gray-100 rounded-lg transition-colors duration-150 shadow-none hover:shadow-sm"
                  aria-label="Copy"
                  aria-pressed="false"
                  data-testid="copy-turn-action-button"
                  data-state="closed"
                >
                  <span className="flex h-8 w-8 items-center justify-center">
                    <Copy className="w-5 h-5" />
                  </span>
                </button>
                <span className="absolute left-1/2 -translate-x-1/2 top-full mt-1 px-2 py-0.5 text-[11px] rounded-md bg-gray-900 text-white shadow opacity-0 group-hover/button:opacity-100 transition-opacity pointer-events-none">Copy</span>
              </div>
            )}

            {/* Edit Button for User Messages */}
            {isUser && role === 'user' && typeof onEditUser === 'function' && (
              <div className="relative group/button">
                <button
                  onClick={() => onEditUser(id)}
                  className="rounded-lg transition-colors duration-150 shadow-none hover:shadow-sm text-token-text-secondary text-gray-500 hover:bg-token-bg-secondary hover:bg-gray-100"
                  aria-label="Edit"
                >
                  <span className="flex h-8 w-8 items-center justify-center">
                    <PencilLine className="w-5 h-5" />
                  </span>
                </button>
                <span className="absolute left-1/2 -translate-x-1/2 top-full mt-1 px-2 py-0.5 text-[11px] rounded-md bg-gray-900 text-white shadow opacity-0 group-hover/button:opacity-100 transition-opacity pointer-events-none">Edit</span>
              </div>
            )}

            {/* Like Button - Only for assistant messages */}
            {!isUser && onLike && (
                <div className="relative group/button">
                  <button
                    onClick={() => onLike(id)}
                    className={`rounded-lg transition-colors duration-150 shadow-none hover:shadow-sm ${
                      liked 
                        ? 'text-green-600 hover:bg-green-50' 
                        : 'text-token-text-secondary text-gray-500 hover:bg-token-bg-secondary hover:bg-gray-100 hover:text-green-600'
                    }`}
                    aria-label="Like"
                    aria-pressed={liked}
                  >
                    <span className="flex h-8 w-8 items-center justify-center">
                      <ThumbsUp className="w-5 h-5" />
                    </span>
                  </button>
                  <span className="absolute left-1/2 -translate-x-1/2 top-full mt-1 px-2 py-0.5 text-[11px] rounded-md bg-gray-900 text-white shadow opacity-0 group-hover/button:opacity-100 transition-opacity pointer-events-none">Like</span>
                </div>
            )}

            {/* Dislike Button - Only for assistant messages */}
            {!isUser && onDislike && (
                <div className="relative group/button">
                  <button
                    onClick={() => onDislike(id)}
                    className={`rounded-lg transition-colors duration-150 shadow-none hover:shadow-sm ${
                      disliked 
                        ? 'text-red-600 hover:bg-red-50' 
                        : 'text-token-text-secondary text-gray-500 hover:bg-token-bg-secondary hover:bg-gray-100 hover:text-red-600'
                    }`}
                    aria-label="Dislike"
                    aria-pressed={disliked}
                  >
                    <span className="flex h-8 w-8 items-center justify-center">
                      <ThumbsDown className="w-5 h-5" />
                    </span>
                  </button>
                  <span className="absolute left-1/2 -translate-x-1/2 top-full mt-1 px-2 py-0.5 text-[11px] rounded-md bg-gray-900 text-white shadow opacity-0 group-hover/button:opacity-100 transition-opacity pointer-events-none">Dislike</span>
                </div>
            )}

            {/* Assistant Variant Navigation and Try Again */}
            {!isUser && (
              <>
                {(variantTotal ?? 1) > 1 && (
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => onVariantPrev && onVariantPrev(id)}
                      className="rounded-lg transition-colors duration-150 text-token-text-secondary text-gray-500 hover:bg-token-bg-secondary hover:bg-gray-100"
                      aria-label="Previous variant"
                    >
                      <span className="flex h-8 w-8 items-center justify-center">
                        <ChevronLeft className="w-5 h-5" />
                      </span>
                    </button>
                    <span className="text-xs text-gray-500 min-w-[48px] text-center inline-flex items-center justify-center gap-1">
                      {isLatestVariantStreaming && (
                        <span title="Latest variant is generating" className="text-gray-400">&lt;&gt;</span>
                      )}
                      <span>
                        {Math.max(1, variantIndex ?? 1)}/{Math.max(1, variantTotal ?? 1)}
                      </span>
                    </span>
                    <button
                      onClick={() => onVariantNext && onVariantNext(id)}
                      className="rounded-lg transition-colors duration-150 text-token-text-secondary text-gray-500 hover:bg-token-bg-secondary hover:bg-gray-100"
                      aria-label="Next variant"
                    >
                      <span className="flex h-8 w-8 items-center justify-center">
                        <ChevronRight className="w-5 h-5" />
                      </span>
                    </button>
                  </div>
                )}

                <div className="relative group/button">
                  <button
                    onClick={() => onTryAgain && onTryAgain(id, 'default')}
                    className="rounded-lg transition-colors duration-150 text-token-text-secondary text-gray-500 hover:bg-token-bg-secondary hover:bg-gray-100"
                    aria-label="Try again"
                  >
                    <span className="flex h-8 w-8 items-center justify-center">
                      <RotateCcw className="w-5 h-5" />
                    </span>
                  </button>
                  <span className="absolute left-1/2 -translate-x-1/2 top-full mt-1 px-2 py-0.5 text-[11px] rounded-md bg-gray-900 text-white shadow opacity-0 group-hover/button:opacity-100 transition-opacity pointer-events-none">Try again</span>
                </div>
              </>
            )}
            </div>

            {/* Status Indicator (always visible if present) */}
            {status && status !== 'complete' && (
              <span
                className={`text-xs px-2.5 py-1 rounded-full font-medium ${
                  status === 'streaming'
                    ? 'bg-blue-100 text-blue-700 animate-pulse'
                    : status === 'pending'
                    ? 'bg-gray-100 text-gray-700 animate-pulse'
                    : status === 'cancelled'
                    ? 'bg-yellow-100 text-yellow-700'
                    : 'bg-red-100 text-red-700'
                }`}
              >
                {status === 'streaming'
                  ? 'Streaming...'
                  : status === 'pending'
                  ? 'Queued...'
                  : status === 'cancelled'
                  ? 'Cancelled'
                  : 'Error'}
              </span>
            )}
          </div>

          {/* Timestamp on the right */}
          <span className="text-xs text-gray-400 font-mono">
            {new Date(timestamp).toLocaleTimeString([], { 
              hour: '2-digit', 
              minute: '2-digit',
              hour12: false 
            })}
          </span>
        </div>
      </div>
    </div>
  );
}


