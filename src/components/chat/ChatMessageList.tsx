'use client';

import React from 'react';
import { Message } from '@/types/chat';
import MessageBubble from './MessageBubble';

interface DomainKnowledge {
  stateTaxCodes: string[];
  filingEntity: string;
}

interface FeedbackState {
  [messageId: string]: {
    feedback: 'like' | 'dislike' | null;
    showInput: boolean;
    input: string;
    submitting: boolean;
    editReady: boolean;
  };
}

interface ChatMessageListProps {
  turns: Array<{ user?: Message & { assistantVariants?: string[] }; assistants: Message[] }>;
  turnVariantIndex: Record<string, number>;
  feedbackState: FeedbackState;
  currentChat: any;
  onCopy: (content: string) => void;
  onLike: (id: string) => void;
  onDislike: (id: string) => void;
  onTryAgain: (assistantId: string) => void;
  onVariantPrev: (turnKey: string, total: number) => void;
  onVariantNext: (turnKey: string, total: number) => void;
  onEditUser: (messageId: string) => void;
  getTurnKey: (turn: any, idx: number) => string;
}

export default function ChatMessageList({
  turns,
  turnVariantIndex,
  feedbackState,
  currentChat,
  onCopy,
  onLike,
  onDislike,
  onTryAgain,
  onVariantPrev,
  onVariantNext,
  onEditUser,
  getTurnKey
}: ChatMessageListProps) {
  if (turns.length === 0) return null;

  return (
    <>
      {turns.map((turn, idx) => {
        const key = getTurnKey(turn, idx);
        const assistants = turn.assistants;
        const variantTotal = assistants.length || 0;
        const variantIndex = turnVariantIndex[key] ?? (variantTotal > 0 ? variantTotal - 1 : 0);
        const shownAssistant = variantTotal > 0 ? assistants[variantIndex] : undefined;
        const latestAssistant = variantTotal > 0 ? assistants[variantTotal - 1] : undefined;
        const isLatestVariantStreaming = latestAssistant?.status === 'streaming' || latestAssistant?.status === 'pending';

        return (
          <React.Fragment key={key}>
            {turn.user && (
              <MessageBubble
                key={`${turn.user.id}-${turn.user.status || 'complete'}`}
                id={turn.user.id}
                role={turn.user.role}
                content={turn.user.content}
                timestamp={turn.user.timestamp}
                status={turn.user.status}
                onCopy={onCopy}
                onLike={(id) => onLike(id)}
                onDislike={(id) => onDislike(id)}
                liked={feedbackState[turn.user.id]?.feedback === 'like'}
                disliked={feedbackState[turn.user.id]?.feedback === 'dislike'}
                onEditUser={onEditUser}
              />
            )}
            {shownAssistant && (
              <MessageBubble
                key={`${shownAssistant.id}-${shownAssistant.status || 'complete'}`}
                id={shownAssistant.id}
                role={shownAssistant.role}
                content={shownAssistant.content}
                timestamp={shownAssistant.timestamp}
                status={shownAssistant.status}
                onCopy={onCopy}
                onLike={(id) => onLike(id)}
                onDislike={(id) => onDislike(id)}
                liked={feedbackState[shownAssistant.id]?.feedback === 'like'}
                disliked={feedbackState[shownAssistant.id]?.feedback === 'dislike'}
                onTryAgain={(assistantId) => onTryAgain(assistantId)}
                variantIndex={variantTotal > 1 ? variantIndex + 1 : undefined}
                variantTotal={variantTotal > 1 ? variantTotal : undefined}
                onVariantPrev={variantTotal > 1 ? () => onVariantPrev(key, variantTotal) : undefined}
                onVariantNext={variantTotal > 1 ? () => onVariantNext(key, variantTotal) : undefined}
                isLatestVariantStreaming={variantTotal > 1 ? isLatestVariantStreaming : undefined}
              />
            )}
            {/* Optimistic assistant placeholder: show immediately when loading and no assistant yet for the last turn */}
            {!shownAssistant && idx === turns.length - 1 && currentChat?.loadingState?.isLoading && (
              <MessageBubble
                key={`assistant_placeholder_${turn.user?.id || idx}`}
                id={`assistant_placeholder_${turn.user?.id || idx}`}
                role="assistant"
                content={''}
                timestamp={new Date()}
                status={'streaming'}
                onCopy={onCopy}
              />
            )}
          </React.Fragment>
        );
      })}
    </>
  );
}
