import { useState, useEffect, useRef, useCallback } from 'react';
import { ChatInstance, ChatState, Message } from '../lib/ChatInstance';

export interface UseChatInstanceOptions {
  onStateUpdate?: (updates: Partial<ChatState>) => void;
  onMessageAdded?: (message: Message) => void;
  onMessageUpdated?: (messageId: string, updates: Partial<Message>) => void;
  onLoadingStarted?: () => void;
  onLoadingStopped?: () => void;
  onStreamingUpdated?: (content: string) => void;
  onError?: (error: string) => void;
  onChatNotFound?: (chatId: string) => void;
}

export function useChatInstance(
  chatId?: string,
  options: UseChatInstanceOptions = {}
) {
  const [state, setState] = useState<ChatState | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  const chatInstanceRef = useRef<ChatInstance | null>(null);

  // Initialize chat instance when chatId changes
  useEffect(() => {
    if (!chatId) {
      setState(null);
      setIsLoading(false);
      setError(null);
      // Clean up existing instance
      if (chatInstanceRef.current) {
        chatInstanceRef.current.removeAllListeners();
        chatInstanceRef.current.destroy();
        chatInstanceRef.current = null;
      }
      return;
    }

    // Create new chat instance
    console.log(`🏗️ Creating ChatInstance with chatId: "${chatId}"`);
    const chatInstance = new ChatInstance({ id: chatId });
    chatInstanceRef.current = chatInstance;

    // Set up event listeners
    const handleStateUpdate = (updates: Partial<ChatState>) => {
      console.log(`📡 [useChatInstance] State update received for chat ${chatId}:`, Object.keys(updates));
      setState(prev => {
        if (!prev) return null;
        
        // Handle messages array updates specially to avoid mutation
        let newMessages = prev.messages;
        if (updates.messages) {
          newMessages = [...updates.messages];
          console.log(`📡 [useChatInstance] Messages updated: ${prev.messages.length} → ${newMessages.length}`);
        }
        
        // Create completely new state object to force re-render
        const newState = {
          ...prev,
          ...updates,
          messages: newMessages
        };
        
        return newState;
      });
      options.onStateUpdate?.(updates);
    };

    const handleMessageAdded = (message: Message) => {
      options.onMessageAdded?.(message);
    };

    const handleMessageUpdated = (messageId: string, updates: Partial<Message>) => {
      options.onMessageUpdated?.(messageId, updates);
    };

    const handleLoadingStarted = () => {
      setIsLoading(true);
      options.onLoadingStarted?.();
    };

    const handleLoadingStopped = () => {
      setIsLoading(false);
      options.onLoadingStopped?.();
    };

    const handleStreamingUpdated = (content: string) => {
      options.onStreamingUpdated?.(content);
    };

    const handleError = (errorMessage: string) => {
      setError(errorMessage);
      
      // Handle "Chat not found" errors more gracefully - don't treat as console errors
      if (errorMessage.includes('Chat not found')) {
        console.log(`📝 [useChatInstance] Chat ${chatId} not found - likely deleted`);
        options.onChatNotFound?.(chatId);
      } else {
        console.error('Chat instance error:', errorMessage);
      }
      
      options.onError?.(errorMessage);
    };

    // Add event listeners
    chatInstance.on('state:updated', handleStateUpdate);
    chatInstance.on('message:added', handleMessageAdded);
    chatInstance.on('message:updated', handleMessageUpdated);
    chatInstance.on('loading:started', handleLoadingStarted);
    chatInstance.on('loading:stopped', handleLoadingStopped);
    chatInstance.on('streaming:updated', handleStreamingUpdated);
    chatInstance.on('error', handleError);

    // Load initial state
    setState(chatInstance.getState());
    setIsLoading(chatInstance.getLoadingState().isLoading);

    // Load from backend
    chatInstance.loadFromBackend().then((success) => {
      if (!success) {
        // Chat not found or failed to load
        console.log(`📝 useChatInstance: Chat ${chatId} not found or failed to load`);
        handleError('Chat not found - it may have been deleted or never existed');
        options.onChatNotFound?.(chatId);
      }
    }).catch((error) => {
      console.error('Failed to load chat from backend:', error);
      handleError('Failed to load chat');
    });

    // Cleanup function
    return () => {
      chatInstance.off('state:updated', handleStateUpdate);
      chatInstance.off('message:added', handleMessageAdded);
      chatInstance.off('message:updated', handleMessageUpdated);
      chatInstance.off('loading:started', handleLoadingStarted);
      chatInstance.off('loading:stopped', handleLoadingStopped);
      chatInstance.off('streaming:updated', handleStreamingUpdated);
      chatInstance.off('error', handleError);
      chatInstance.destroy();
    };
  }, [chatId]); // Remove options from dependencies to prevent infinite loop

  // Action methods
  const sendMessage = useCallback(async (message: string, userProfile?: any): Promise<boolean> => {
    if (!chatInstanceRef.current) return false;
    return await chatInstanceRef.current.sendMessage(message, userProfile);
  }, []);

  const cancelRequest = useCallback(async (): Promise<void> => {
    if (!chatInstanceRef.current) return;
    await chatInstanceRef.current.cancelRequest();
  }, []);

  const reloadMessage = useCallback(async (
    messageId: string, 
    modelType: 'chatgpt' | 'ollama', 
    model: string
  ): Promise<boolean> => {
    if (!chatInstanceRef.current) return false;
    return await chatInstanceRef.current.reloadMessage(messageId, modelType, model);
  }, []);

  const editMessage = useCallback(async (
    messageId: string, 
    newContent: string, 
    userProfile?: any
  ): Promise<boolean> => {
    if (!chatInstanceRef.current) return false;
    return await chatInstanceRef.current.editMessage(messageId, newContent, userProfile);
  }, []);

  const tryAgain = useCallback(async (
    assistantMessageId: string,
    userProfile?: any
  ): Promise<boolean> => {
    if (!chatInstanceRef.current) return false;
    return await chatInstanceRef.current.tryAgain(assistantMessageId, userProfile);
  }, []);

  const setContextFilters = useCallback((filters: Partial<ChatState['contextFilters']>) => {
    if (!chatInstanceRef.current) return;
    chatInstanceRef.current.setContextFilters(filters);
  }, []);

  const setModelSettings = useCallback((settings: Partial<ChatState['modelSettings']>) => {
    if (!chatInstanceRef.current) return;
    chatInstanceRef.current.setModelSettings(settings);
  }, []);

  const setInputState = useCallback((inputState: Partial<ChatState['inputState']>) => {
    if (!chatInstanceRef.current) return;
    chatInstanceRef.current.setInputState(inputState);
  }, []);

  const setTitle = useCallback((title: string) => {
    if (!chatInstanceRef.current) return;
    chatInstanceRef.current.setTitle(title);
  }, []);

  const setId = useCallback((newId: string) => {
    if (!chatInstanceRef.current) return;
    chatInstanceRef.current.setId(newId);
  }, []);

  const saveToBackend = useCallback(async (): Promise<boolean> => {
    if (!chatInstanceRef.current) return false;
    return await chatInstanceRef.current.saveToBackend();
  }, []);

  const clearError = useCallback(() => {
    setError(null);
  }, []);

  const updateStreamingMessage = useCallback((
    messageId: string, 
    content: string, 
    status?: 'streaming' | 'complete' | 'cancelled' | 'error'
  ) => {
    if (!chatInstanceRef.current) return;
    chatInstanceRef.current.updateStreamingMessage(messageId, content, status);
  }, []);

  return {
    // State
    state,
    isLoading,
    error,
    
    // Actions
    sendMessage,
    cancelRequest,
    reloadMessage,
    editMessage,
    setContextFilters,
    setModelSettings,
    setInputState,
    setTitle,
    setId,
    saveToBackend,
    clearError,
    updateStreamingMessage,
    tryAgain,
    
    // Direct access to chat instance (for advanced use cases)
    chatInstance: chatInstanceRef.current,
  };
} 