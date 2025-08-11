import { useState, useEffect, useRef, useCallback } from 'react';
import { ChatListManager } from '../lib/ChatListManager';
import type { ChatListItem } from '@/types/chat';

export interface UseChatListOptions {
  onChatAdded?: (chat: ChatListItem) => void;
  onChatUpdated?: (chatId: string, updates: Partial<ChatListItem>) => void;
  onChatRemoved?: (chatId: string) => void;
  onChatSelected?: (chatId: string) => void;
  onError?: (error: string) => void;
}

export function useChatList(options: UseChatListOptions = {}) {
  const [chats, setChats] = useState<ChatListItem[]>([]);
  const [selectedChatId, setSelectedChatId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isInitialized, setIsInitialized] = useState(false);
  
  const chatListManagerRef = useRef<ChatListManager | null>(null);

  // Initialize ChatListManager
  useEffect(() => {
    const chatListManager = new ChatListManager();
    chatListManagerRef.current = chatListManager;
    
    // Set up event listeners
    const handleChatAdded = (chat: ChatListItem) => {
      setChats(prev => [chat, ...prev.filter(c => c.id !== chat.id)]);
      options.onChatAdded?.(chat);
    };

    const handleChatUpdated = (chatId: string, updates: Partial<ChatListItem>) => {
      setChats(prev => prev.map(chat => 
        chat.id === chatId ? { ...chat, ...updates } : chat
      ));
      options.onChatUpdated?.(chatId, updates);
    };

    const handleChatRemoved = (chatId: string) => {
      setChats(prev => {
        const updated = prev.filter(chat => chat.id !== chatId);
        // If the removed chat was selected, move selection to the next most recent chat
        if (selectedChatId === chatId) {
          const nextId = updated.length > 0 ? updated[0].id : null;
          setSelectedChatId(nextId);
          if (nextId) {
            options.onChatSelected?.(nextId);
          }
        }
        return updated;
      });
      options.onChatRemoved?.(chatId);
    };

    const handleChatSelected = (chatId: string | null) => {
      setSelectedChatId(chatId);
      if (chatId) {
        options.onChatSelected?.(chatId);
      }
    };

    const handleError = (errorMessage: string) => {
      setError(errorMessage);
      options.onError?.(errorMessage);
    };

    // Add event listeners
    chatListManager.on('chat:added', handleChatAdded);
    chatListManager.on('chat:updated', handleChatUpdated);
    chatListManager.on('chat:removed', handleChatRemoved);
    chatListManager.on('chat:selected', handleChatSelected);
    chatListManager.on('error', handleError);

    // Mark as initialized but don't auto-load chats
    setIsInitialized(true);

    // Cleanup function
    return () => {
      chatListManager.off('chat:added', handleChatAdded);
      chatListManager.off('chat:updated', handleChatUpdated);
      chatListManager.off('chat:removed', handleChatRemoved);
      chatListManager.off('chat:selected', handleChatSelected);
      chatListManager.off('error', handleError);
      chatListManager.destroy();
    };
  }, []); // Remove options from dependency array to prevent re-initialization

  // Load all chats (lazy loading)
  const loadAllChats = useCallback(async (forceRefresh: boolean = false) => {
    if (!chatListManagerRef.current) {
      console.log('⏸️ useChatList: ChatListManager not initialized');
      return;
    }
    
    // Check if we're already loading
    if (isLoading) {
      console.log('⏸️ useChatList: Already loading chats');
      return;
    }
    
    // Check if we have cached data and don't need to force refresh
    if (!forceRefresh && chatListManagerRef.current.isCacheValid()) {
      console.log('📋 useChatList: Using cached chat data');
      const allChats = chatListManagerRef.current.getAllChats();
      setChats(allChats);
      return;
    }
    
    setIsLoading(true);
    setError(null);
    
    try {
      console.log('📡 useChatList: Loading chats from backend...');
      await chatListManagerRef.current.loadAllChats(forceRefresh);
      const allChats = chatListManagerRef.current.getAllChats();
      setChats(allChats);
    } catch (err) {
      console.error('❌ useChatList: Error loading chats:', err);
      const errorMessage = err instanceof Error ? err.message : 'Failed to load chats';
      setError(errorMessage);
      options.onError?.(errorMessage);
    } finally {
      setIsLoading(false);
    }
  }, [isLoading, options]);

  // Create new chat
  const createChat = useCallback(async (title: string = 'New Conversation'): Promise<ChatListItem | null> => {
    if (!chatListManagerRef.current) return null;
    
    try {
      const newChat = await chatListManagerRef.current.createChat(title);
      if (newChat) {
        setChats(chatListManagerRef.current.getAllChats());
        setSelectedChatId(newChat.id);
      }
      return newChat;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to create chat';
      setError(errorMessage);
      options.onError?.(errorMessage);
      return null;
    }
  }, []);

  // Create chat with initial message
  const createChatWithMessage = useCallback(async (
    message: string,
    modelType: 'chatgpt' | 'ollama',
    model: string
  ): Promise<ChatListItem | null> => {
    if (!chatListManagerRef.current) return null;
    
    try {
      const newChat = await chatListManagerRef.current.createChatWithMessage(message, modelType, model);
      if (newChat) {
        setChats(chatListManagerRef.current.getAllChats());
        setSelectedChatId(newChat.id);
      }
      return newChat;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to create chat';
      setError(errorMessage);
      options.onError?.(errorMessage);
      return null;
    }
  }, []);

  // Delete chat
  const deleteChat = useCallback(async (chatId: string): Promise<boolean> => {
    if (!chatListManagerRef.current) return false;
    
    try {
      const success = await chatListManagerRef.current.deleteChat(chatId);
      if (success) {
        setChats(chatListManagerRef.current.getAllChats());
      }
      return success;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to delete chat';
      setError(errorMessage);
      options.onError?.(errorMessage);
      return false;
    }
  }, []);

  // Select chat
  const selectChat = useCallback((chatId: string | null) => {
    if (!chatListManagerRef.current) return;
    chatListManagerRef.current.selectChat(chatId);
  }, []);

  // Update chat title
  const updateChatTitle = useCallback(async (chatId: string, newTitle: string): Promise<boolean> => {
    if (!chatListManagerRef.current) return false;
    
    try {
      const success = await chatListManagerRef.current.updateChatTitle(chatId, newTitle);
      if (success) {
        setChats(chatListManagerRef.current.getAllChats());
      }
      return success;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to update chat title';
      setError(errorMessage);
      options.onError?.(errorMessage);
      return false;
    }
  }, []);

  // Update chat from ChatInstance
  const updateFromChatInstance = useCallback((chatInstance: any) => {
    if (!chatListManagerRef.current) return;
    chatListManagerRef.current.updateFromChatInstance(chatInstance);
    setChats(chatListManagerRef.current.getAllChats());
  }, []);

  // Remove non-existent chat
  const removeNonExistentChat = useCallback(async (chatId: string): Promise<boolean> => {
    if (!chatListManagerRef.current) return false;
    
    try {
      const removed = await chatListManagerRef.current.removeNonExistentChat(chatId);
      if (removed) {
        setChats(chatListManagerRef.current.getAllChats());
      }
      return removed;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to remove chat';
      setError(errorMessage);
      options.onError?.(errorMessage);
      return false;
    }
  }, [options]);

  // Refresh chats (force reload from backend)
  const refreshChats = useCallback(async () => {
    console.log('🔄 useChatList: Force refreshing chats...');
    await loadAllChats(true);
  }, [loadAllChats]);

  // Check if chats are loaded
  const isChatsLoaded = useCallback(() => {
    return chatListManagerRef.current?.isChatsLoaded() || false;
  }, []);

  // Check if cache is valid
  const isCacheValid = useCallback(() => {
    return chatListManagerRef.current?.isCacheValid() || false;
  }, []);

  // Invalidate cache
  const invalidateCache = useCallback(() => {
    chatListManagerRef.current?.invalidateCache();
  }, []);

  // Clear error
  const clearError = useCallback(() => {
    setError(null);
  }, []);

  return {
    // State
    chats,
    selectedChatId,
    isLoading,
    error,
    isInitialized,
    
    // Actions
    loadAllChats,
    createChat,
    createChatWithMessage,
    deleteChat,
    selectChat,
    updateChatTitle,
    updateFromChatInstance,
    removeNonExistentChat,
    refreshChats,
    clearError,
    
    // Cache management
    isChatsLoaded,
    isCacheValid,
    invalidateCache,
    
    // Direct access to chat list manager (for advanced use cases)
    chatListManager: chatListManagerRef.current,
  };
} 