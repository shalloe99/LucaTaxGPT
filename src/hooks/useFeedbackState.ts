import { useState } from 'react';

interface FeedbackState {
  [messageId: string]: {
    feedback: 'like' | 'dislike' | null;
    showInput: boolean;
    input: string;
    submitting: boolean;
    editReady: boolean;
  };
}

export function useFeedbackState() {
  const [feedbackState, setFeedbackState] = useState<FeedbackState>({});

  const handleFeedback = async (messageId: string, type: 'like' | 'dislike', chatId?: string) => {
    setFeedbackState(prev => ({
      ...prev,
      [messageId]: {
        ...prev[messageId],
        feedback: type
      }
    }));

    try {
      await fetch('/api/chat/feedback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messageId,
          feedback: type,
          chatId
        })
      });
    } catch (error) {
      console.error('Error submitting feedback:', error);
    }
  };

  const openFeedbackInput = (messageId: string) => {
    setFeedbackState(prev => ({
      ...prev,
      [messageId]: {
        ...prev[messageId],
        showInput: true
      }
    }));
  };

  const handleFeedbackInput = (messageId: string, value: string) => {
    setFeedbackState(prev => ({
      ...prev,
      [messageId]: {
        ...prev[messageId],
        input: value
      }
    }));
  };

  const submitFeedbackComment = async (messageId: string, chatId?: string) => {
    const feedback = feedbackState[messageId];
    if (!feedback || !feedback.input.trim()) return;

    try {
      await fetch('/api/chat/feedback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messageId,
          feedback: feedback.feedback,
          comment: feedback.input,
          chatId
        })
      });

      closeFeedbackInput(messageId);
    } catch (error) {
      console.error('Error submitting feedback comment:', error);
    }
  };

  const closeFeedbackInput = (messageId: string) => {
    setFeedbackState(prev => ({
      ...prev,
      [messageId]: {
        ...prev[messageId],
        showInput: false,
        input: ''
      }
    }));
  };

  const handleEditClick = (messageId: string, content: string) => {
    setFeedbackState(prev => ({
      ...prev,
      [messageId]: {
        ...prev[messageId],
        editReady: true,
        input: content
      }
    }));
  };

  const handleEditInputChange = (messageId: string, value: string) => {
    setFeedbackState(prev => ({
      ...prev,
      [messageId]: {
        ...prev[messageId],
        input: value
      }
    }));
  };

  const clearEditState = (messageId: string) => {
    setFeedbackState(prev => ({
      ...prev,
      [messageId]: {
        ...prev[messageId],
        editReady: false,
        input: ''
      }
    }));
  };

  const handleUserMsgMouseEnter = (messageId: string) => {
    setFeedbackState(prev => ({
      ...prev,
      [messageId]: {
        ...prev[messageId],
        showInput: true
      }
    }));
  };

  const handleUserMsgMouseLeave = (messageId: string) => {
    setFeedbackState(prev => ({
      ...prev,
      [messageId]: {
        ...prev[messageId],
        showInput: false
      }
    }));
  };

  return {
    feedbackState,
    handleFeedback,
    openFeedbackInput,
    handleFeedbackInput,
    submitFeedbackComment,
    closeFeedbackInput,
    handleEditClick,
    handleEditInputChange,
    clearEditState,
    handleUserMsgMouseEnter,
    handleUserMsgMouseLeave
  };
}
