'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import type { ChatListItem } from '@/types/chat';
import { MoreVertical, ArrowLeft, PencilLine, Settings, Search } from 'lucide-react';
import ChatSettings, { ChatSettingsRef } from './ChatSettings';
import { checkBackendHealth } from '../lib/backendHealth';
import chatService from '@/lib/api/chatService';
import ChatSearchPopup from './chat/ChatSearchPopup';
import ChatList from './chat/ChatList';
import CollapsedSidebar from './chat/CollapsedSidebar';

interface ChatHistoryProps {
  chats: ChatListItem[];
  setChats: React.Dispatch<React.SetStateAction<ChatListItem[]>>;
  selectedChatId?: string | null;
  setSelectedChatId?: (id: string | null) => void;
  onChatSelect?: (chat: ChatListItem) => void;
  onNewChat?: (chat: ChatListItem) => void;
  onDeleteChat?: (chatId: string) => Promise<boolean>; // Add delete callback
  onWidthChange?: (width: number) => void;
  width?: number;
  sidebarOpen?: boolean;
  onSidebarToggle?: (open: boolean) => void;
  onModeSwitch?: () => void;
  reloadFlag?: number;
  // Add new props for settings
  selectedModelType?: 'chatgpt' | 'ollama';
  selectedModel?: string;
  isAsyncMode?: boolean;
  onModelChange?: (modelType: 'chatgpt' | 'ollama', model: string) => void;
  onModeChange?: (isAsync: boolean) => void;
  onAsyncModeChange?: (isAsync: boolean) => void;
  // Add lazy loading props
  loadAllChats?: () => Promise<void>;
  isLoading?: boolean;
  isInitialized?: boolean;
}

// Add a type for the backend response
interface BackendConversation {
  id: string;
  title: string;
  lastMessage?: string;
  timestamp?: string;
  updatedAt?: string;
  createdAt?: string;
  messageCount?: number;
  messages?: any[];
  contextFilters?: {
    stateTaxCodes?: string[];
    profileTags?: string[];
  };
}

export default function ChatHistory({ 
  chats,
  setChats,
  selectedChatId,
  setSelectedChatId,
  onChatSelect, 
  onNewChat,
  onDeleteChat,
  onModeSwitch,
  reloadFlag,
  pendingNewChat = false,
  onStartNewChat,
  // Add new props with defaults
  selectedModelType = 'ollama',
  selectedModel = 'phi3:3.8b',
  isAsyncMode = true,
  onModelChange,
  onModeChange,
  onAsyncModeChange,
  // Lazy loading props
  loadAllChats,
  isLoading: externalIsLoading,
  isInitialized,
  sidebarOpen = true,
  onSidebarToggle
}: ChatHistoryProps & { 
  pendingNewChat?: boolean, 
  onStartNewChat?: () => void,
  selectedModelType?: 'chatgpt' | 'ollama',
  selectedModel?: string,
  isAsyncMode?: boolean,
  onModelChange?: (modelType: 'chatgpt' | 'ollama', model: string) => void,
  onModeChange?: (isAsync: boolean) => void,
  onAsyncModeChange?: (isAsync: boolean) => void
}) {
  const [isDragging, setIsDragging] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [showSearch, setShowSearch] = useState(false);
  const [filteredChats, setFilteredChats] = useState<ChatListItem[]>([]);
  const [isClient, setIsClient] = useState(false);
  const [isLoadingChats, setIsLoadingChats] = useState(false);
  const [hasLoadedChats, setHasLoadedChats] = useState(false);
  
  // Use external loading state if provided, otherwise use internal state
  const isLoading = externalIsLoading !== undefined ? externalIsLoading : isLoadingChats;
  const [storageWarning, setStorageWarning] = useState<string | null>(null);
  const dragStartX = useRef(0);
  const dragStartWidth = useRef(0);
  const [contextMenu, setContextMenu] = useState<{ show: boolean, x: number, y: number, chatId: string | null }>({ show: false, x: 0, y: 0, chatId: null });
  const [sidebarOpenState, setSidebarOpenState] = useState(false); // Start with false to prevent hydration mismatch
  const [hasHydrated, setHasHydrated] = useState(false);
  // Fully hide sidebar on very small screens
  const [hideCompletely, setHideCompletely] = useState(false);
  // Add state for renaming chat
  const [renamingChatId, setRenamingChatId] = useState<string | null>(null);
  const [renameInput, setRenameInput] = useState('');
  const [deletingChatId, setDeletingChatId] = useState<string | null>(null);
  const [showSettingsPopup, setShowSettingsPopup] = useState(false);
  const [availableModels, setAvailableModels] = useState<{
    chatgpt: Array<{ id: string; name: string; description: string }>;
    ollama: Array<{ id: string; name: string; description: string }>;
  }>({
    chatgpt: [],
    ollama: []
  });
  const chatSettingsRef = useRef<ChatSettingsRef>(null);
  const [backendOnline, setBackendOnline] = useState<boolean>(true); // Assume online initially

  const handleClearAll = () => {
    if (window.confirm('Are you sure you want to clear all conversations? This action cannot be undone.')) {
      setChats([]);
    }
  };

  // Ensure client-side rendering to prevent hydration mismatch
  useEffect(() => {
    setIsClient(true);
    setHasHydrated(true);
    // Set sidebar open after client-side hydration
    if (onSidebarToggle) {
      onSidebarToggle(true);
    }
  }, [onSidebarToggle]);

  // Handle ESC key to close settings modal
  useEffect(() => {
    const handleEscKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && showSettingsPopup) {
        handleCloseSettings();
      }
    };

    if (showSettingsPopup) {
      document.addEventListener('keydown', handleEscKey);
    }

    return () => {
      document.removeEventListener('keydown', handleEscKey);
    };
  }, [showSettingsPopup]);

  // Function to handle closing settings (cancel)
  const handleCloseSettings = () => {
    setShowSettingsPopup(false);
  };

  // Function to handle saving settings
  const handleSaveSettings = () => {
    // Call the save function on the ChatSettings component
    chatSettingsRef.current?.save();
    // Close the modal after saving
    setShowSettingsPopup(false);
  };

  // Function to open settings popup (closes search if open)
  const handleOpenSettings = () => {
    setShowSearch(false); // Close search popup if open
    setShowSettingsPopup(true);
  };

  // Function to open search popup (closes settings if open)
  const handleOpenSearch = () => {
    setShowSettingsPopup(false); // Close settings popup if open
    setShowSearch(true);
  };

  // Load chats when sidebar is first opened (if using lazy loading)
  useEffect(() => {
    if (loadAllChats && isInitialized && isClient) {
      loadAllChats();
    }
  }, [isInitialized, isClient]); // Remove loadAllChats from dependencies to prevent infinite loop

  useEffect(() => {
    function handleWarning(e: any) {
      setStorageWarning(e.detail || 'Not enough browser memory to save conversation history.');
    }
    function handleCleared() {
      setChats([]);
      setStorageWarning(null);
    }
    window.addEventListener('conversation-storage-warning', handleWarning);
    window.addEventListener('conversation-storage-cleared', handleCleared);
    return () => {
      window.removeEventListener('conversation-storage-warning', handleWarning);
      window.removeEventListener('conversation-storage-cleared', handleCleared);
    };
  }, []);

  useEffect(() => {
    function handleTitleUpdate(e: any) {
      const { id, title } = e.detail || {};
      if (!id || !title) return;
      setChats(prev => {
        const updated = prev.map(chat => chat.id === id ? { ...chat, title } : chat);
        return updated;
      });
    }
    window.addEventListener('conversation-title-updated', handleTitleUpdate);
    return () => window.removeEventListener('conversation-title-updated', handleTitleUpdate);
  }, []);

  // Use lazy loading if provided, otherwise fall back to direct API call
  const loadChats = useCallback(async () => {
    if (loadAllChats) {
      // Use the lazy loading hook
      await loadAllChats();
    } else {
      // Fallback to direct API call (legacy behavior)
      setIsLoadingChats(true);
      try {
        const data = await chatService.listChats();
        const mapped = data.map(chat => {
          const messages = chat.messages || [];
          const filters = chat.contextFilters || {};
          return {
            id: chat.id,
            title: chat.title,
            lastMessage: messages.length > 0 ? messages[messages.length - 1].content : '',
            timestamp: typeof (chat as any).timestamp === 'string' ? new Date((chat as any).timestamp) : new Date(chat.updatedAt || new Date().toISOString()),
            messageCount: messages.length,
            contextFilters: {
              stateTaxCodes: Array.isArray(filters.stateTaxCodes) ? filters.stateTaxCodes : [],
              profileTags: Array.isArray(filters.profileTags) ? filters.profileTags : [],
            },
          } as ChatListItem;
        });
        setChats(mapped);
      } catch (error) {
        console.error('Error loading conversations:', error);
        setChats([]);
      } finally {
        setIsLoadingChats(false);
      }
    }
  }, [loadAllChats]);

  // Helper to check if the last chat is empty (no user or bot messages)
  function isLastChatEmpty() {
    if (chats.length === 0) return false;
    const lastChat = chats[0]; // assuming newest chat is at the top
    return (lastChat.messageCount === 0);
  }

  // Replace createNewConversation with backend API call
  const createNewChat = async () => {
    // Prevent creating new chat if there are pending deletions
    if (deletingChatId) {
      console.log('Cannot create new chat while another chat is being deleted');
      return;
    }
    
    try {
      const newChat = await chatService.createChat({
        title: 'New Conversation',
        contextFilters: { stateTaxCodes: [], profileTags: [] },
        messages: [],
      });
      
      const chat: ChatListItem = {
        id: newChat.id,
        title: newChat.title,
        lastMessage: '',
        timestamp: new Date(newChat.updatedAt || newChat.createdAt || new Date().toISOString()),
        messageCount: 0,
        contextFilters: {
          stateTaxCodes: Array.isArray(newChat.contextFilters?.stateTaxCodes) ? newChat.contextFilters.stateTaxCodes : [],
          profileTags: Array.isArray(newChat.contextFilters?.profileTags) ? newChat.contextFilters.profileTags : [],
        },
      };
      setChats(prev => [chat, ...prev]);
      setSelectedChatId?.(chat.id);
      onChatSelect?.(chat);
      if (onNewChat) {
        // Always pass a fresh object
        onNewChat({ ...chat });
      }
    } catch (error) {
      console.error('Error creating conversation:', error);
    }
  };

  // When a chat is selected, fetch its details from backend
  const handleChatSelect = async (chat: ChatListItem) => {
    // Prevent selecting chats that are being deleted
    if (deletingChatId === chat.id) {
      console.log('Chat is being deleted, skipping selection');
      return;
    }
    
    setSelectedChatId?.(chat.id);
    try {
      const chatData = await chatService.getChat(chat.id);
        const messages = chatData.messages || [];
        // Map backend response to local ChatListItem type
        const typedChat: ChatListItem = {
          id: chatData.id,
          title: chatData.title,
          lastMessage: messages.length > 0 ? messages[messages.length - 1].content : '',
          timestamp: typeof (chatData as any).timestamp === 'string' ? new Date((chatData as any).timestamp) : new Date(chatData.updatedAt || new Date().toISOString()),
          messageCount: messages.length,
          contextFilters: {
            stateTaxCodes: Array.isArray(chatData.contextFilters?.stateTaxCodes) ? chatData.contextFilters.stateTaxCodes : [],
            profileTags: Array.isArray(chatData.contextFilters?.profileTags) ? chatData.contextFilters.profileTags : [],
          },
        };
        onChatSelect?.(typedChat);
    } catch (error) {
      console.error('Error loading conversation details:', error);
      // If the chat is not found, it might have been deleted
      // Remove it from the local state to keep things in sync
      if (error instanceof Error && error.message.includes('not found')) {
        setChats(prev => prev.filter(c => c.id !== chat.id));
        if (selectedChatId === chat.id) {
          setSelectedChatId?.(null);
        }
      }
    }
  };

  const handleMouseDown = (e: React.MouseEvent) => {
    setIsDragging(true);
    dragStartX.current = e.clientX;
    dragStartWidth.current = 320; // Fixed width
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
  };

  const handleMouseMove = useCallback((e: MouseEvent) => {
    if (!isDragging) return;
    
    const deltaX = e.clientX - dragStartX.current;
    const newWidth = Math.max(280, Math.min(600, dragStartWidth.current + deltaX)); // Increased minimum width
    // onWidthChange?.(newWidth); // Removed onWidthChange
  }, [isDragging]);

  const handleMouseUp = useCallback(() => {
    setIsDragging(false);
    document.body.style.cursor = '';
    document.body.style.userSelect = '';
  }, []);

  useEffect(() => {
    if (isDragging) {
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
      return () => {
        document.removeEventListener('mousemove', handleMouseMove);
        document.removeEventListener('mouseup', handleMouseUp);
      };
    }
  }, [isDragging, handleMouseMove, handleMouseUp]);

  const formatTimestamp = (timestamp: Date | string) => {
    const date = timestamp instanceof Date ? timestamp : new Date(timestamp);
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    const hours = Math.floor(diff / (1000 * 60 * 60));
    const days = Math.floor(hours / 24);

    if (days > 0) {
      return `${days}d ago`;
    } else if (hours > 0) {
      return `${hours}h ago`;
    } else {
      return 'Just now';
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'k' && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      handleOpenSearch();
    }
    if (e.key === 'Escape') {
      setShowSearch(false);
      setSearchQuery('');
    }
  };

  useEffect(() => {
    if (isClient) {
      document.addEventListener('keydown', handleKeyDown as any);
      return () => document.removeEventListener('keydown', handleKeyDown as any);
    }
  }, [isClient]);

  // Add useEffect to load conversations on mount (only if not using lazy loading)
  useEffect(() => {
    if (!loadAllChats) {
      loadChats();
    }
  }, [selectedChatId, reloadFlag, loadAllChats]);

  useEffect(() => {
    if (searchQuery.trim()) {
      setFilteredChats(
        chats.filter(chat =>
          chat.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
          (chat.lastMessage && chat.lastMessage.toLowerCase().includes(searchQuery.toLowerCase()))
        )
      );
    } else {
      setFilteredChats(chats);
    }
  }, [searchQuery, chats]);

  function handleContextMenu(e: React.MouseEvent, chatId: string) {
    // Prevent context menu if chat is being deleted
    if (deletingChatId === chatId) {
      e.preventDefault();
      return;
    }
    
    e.preventDefault();
    setContextMenu({ show: true, x: e.clientX, y: e.clientY, chatId });
  }

  // Rename function and button to 'Copy context to new chat'
  function handleCopyContextToNewChat() {
    if (isClient && contextMenu.chatId) {
      // Prevent copying context if chat is being deleted
      if (deletingChatId === contextMenu.chatId) {
        console.log('Chat is being deleted, cannot copy context');
        setContextMenu({ ...contextMenu, show: false });
        return;
      }
      
      const chat = chats.find(c => c.id === contextMenu.chatId);
      if (chat) {
        // Deep copy context filters (no shared references)
        const copiedContextFilters = JSON.parse(JSON.stringify({
          stateTaxCodes: Array.isArray(chat.contextFilters?.stateTaxCodes) ? chat.contextFilters.stateTaxCodes : [],
          profileTags: Array.isArray(chat.contextFilters?.profileTags) ? chat.contextFilters.profileTags : [],
        }));
        chatService
          .createChat({ title: 'New Conversation', contextFilters: copiedContextFilters, messages: [] })
          .then(newChat => {
            const chat: ChatListItem = {
              id: newChat.id,
              title: newChat.title,
              lastMessage: '',
              timestamp: new Date(newChat.updatedAt || newChat.createdAt || new Date().toISOString()),
              messageCount: 0,
              contextFilters: {
                stateTaxCodes: Array.isArray(newChat.contextFilters?.stateTaxCodes) ? newChat.contextFilters.stateTaxCodes : [],
                profileTags: Array.isArray(newChat.contextFilters?.profileTags) ? newChat.contextFilters.profileTags : [],
              },
            };
            setChats(prev => [chat, ...prev]);
            setSelectedChatId?.(chat.id);
            onChatSelect?.(chat);
            if (onNewChat) {
              onNewChat({ ...chat });
            }
          });
      }
    }
    setContextMenu({ ...contextMenu, show: false });
  }

  async function handleDeleteFromMenu() {
    if (contextMenu.chatId && onDeleteChat) {
      // Prevent deletion if chat is already being deleted
      if (deletingChatId === contextMenu.chatId) {
        console.log('Chat is already being deleted, skipping duplicate request');
        setContextMenu({ ...contextMenu, show: false });
        return;
      }
      
      setDeletingChatId(contextMenu.chatId);
      try {
        await onDeleteChat(contextMenu.chatId);
      } catch (error) {
        console.error('Error deleting chat:', error);
      } finally {
        setDeletingChatId(null);
      }
    }
    setContextMenu({ ...contextMenu, show: false });
  }

  // Function to handle rename save
  const handleRenameSave = async (chatId: string) => {
    // Prevent rename if chat is being deleted
    if (deletingChatId === chatId) {
      console.log('Chat is being deleted, cannot rename');
      return;
    }
    
    const newTitle = renameInput.trim();
    if (!newTitle) return;
    try {
      await chatService.updateChatTitle(chatId, newTitle);
        setChats(prev => prev.map(chat => chat.id === chatId ? { ...chat, title: newTitle } : chat));
        // Broadcast a global event so the parent and other listeners can update their state
        if (typeof window !== 'undefined') {
          window.dispatchEvent(new CustomEvent('conversation-title-updated', { detail: { id: chatId, title: newTitle } }));
        }
        setRenamingChatId(null);
        setRenameInput('');
    } catch (error) {
      console.error('Error renaming chat:', error);
    }
  };

  // Fix delete handler to always use correct chat id and show loading
  const handleDeleteChat = async (chatId: string) => {
    // Prevent deletion if chat is already being deleted
    if (deletingChatId === chatId) {
      console.log('Chat is already being deleted, skipping duplicate request');
      return;
    }
    
    if (onDeleteChat) {
      // Use the callback from main app
      setDeletingChatId(chatId);
      try {
        // Call the backend delete first
        const success = await onDeleteChat(chatId);
        if (success) {
          // Only remove from local state if backend deletion succeeds
          setChats(prev => prev.filter(chat => chat.id !== chatId));
          if (selectedChatId === chatId) {
            setSelectedChatId?.(null);
          }
        } else {
          // If deletion failed, don't remove from local state
          console.warn('Chat deletion was not successful, keeping in local state');
        }
      } catch (error) {
        console.error('Error deleting conversation:', error);
        // If backend delete fails, don't remove from local state
        // The chat will remain visible to the user
      } finally {
        setDeletingChatId(null);
      }
    } else {
      // Fallback to direct API call if no callback provided
      setDeletingChatId(chatId);
      try {
        // Call the backend delete first
        await chatService.deleteChat(chatId);
        // Only remove from local state if backend deletion succeeds
        setChats(prev => prev.filter(chat => chat.id !== chatId));
        if (selectedChatId === chatId) {
          setSelectedChatId?.(null);
        }
      } catch (error) {
        console.error('Error deleting conversation:', error);
        // If backend delete fails, don't remove from local state
        // The chat will remain visible to the user
      } finally {
        setDeletingChatId(null);
      }
    }
  };

  useEffect(() => {
    function handleClick() {
      if (contextMenu.show) setContextMenu({ ...contextMenu, show: false });
    }
    window.addEventListener('click', handleClick);
    return () => window.removeEventListener('click', handleClick);
  }, [contextMenu]);

  // Add a useEffect to collapse sidebar if window.innerWidth < 600
  useEffect(() => {
    if (!isClient) return; // Only run on client side
    
    function handleResize() {
      const width = window.innerWidth;
      if (width < 800 && onSidebarToggle) {
        onSidebarToggle(false);
      }
      // Hide completely when below Tailwind's sm breakpoint (~640px)
      setHideCompletely(width < 640);
    }
    window.addEventListener('resize', handleResize);
    // Collapse on mount if already too small
    if (window.innerWidth < 800 && onSidebarToggle) {
      onSidebarToggle(false);
    }
    setHideCompletely(window.innerWidth < 640);
    return () => window.removeEventListener('resize', handleResize);
  }, [isClient, onSidebarToggle]);

  // Add function to fetch available models
  const fetchAvailableModels = async () => {
    const maxRetries = 3;
    const retryDelay = 2000; // 2 seconds
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        const healthStatus = await checkBackendHealth();
        setBackendOnline(healthStatus.isOnline);
        if (healthStatus.isOnline) {
          const data = await chatService.listModels();
          const models = (data as any).models ? (data as any).models : (data as any);
          setAvailableModels(models);
          break;
        } else {
          console.warn('Backend is offline, using default models');
          setAvailableModels({ chatgpt: [], ollama: [] });
          break;
        }
      } catch (error) {
        console.warn(
          `Could not fetch models (attempt ${attempt}/${maxRetries}):`,
          error instanceof Error ? error.message : 'Unknown error'
        );
        if (attempt < maxRetries) {
          await new Promise(resolve => setTimeout(resolve, retryDelay));
        } else {
          setBackendOnline(false);
          setAvailableModels({ chatgpt: [], ollama: [] });
        }
      }
    }
  };

  useEffect(() => {
    fetchAvailableModels();
  }, []);

  // Collapsed sidebar rendering
  if (hideCompletely) {
    // On very small screens, hide the sidebar entirely and rely on top banner in the chat panel
    return null;
  }

  if (!sidebarOpen) {
    return (
      <CollapsedSidebar
        chats={chats}
        searchQuery={searchQuery}
        filteredChats={filteredChats}
        deletingChatId={deletingChatId}
        showSearch={showSearch}
        onSidebarToggle={onSidebarToggle || (() => {})}
        onOpenSearch={handleOpenSearch}
        onStartNewChat={onStartNewChat || createNewChat}
        onOpenSettings={handleOpenSettings}
        onSearchChange={setSearchQuery}
        onCloseSearch={() => setShowSearch(false)}
        onChatSelect={handleChatSelect}
      />
    );
  }

  // Expanded sidebar rendering
  return (
    <>
      <aside
        className={`relative z-[99999] flex flex-col h-full bg-white border-r border-gray-200 min-w-[245px] max-w-[245px] w-[245px]${!sidebarOpen ? ' hidden' : ''}`}
      >
        {/* Sidebar Header */}
        <div className="sticky top-0 z-20 bg-white border-b border-gray-200 flex items-center justify-between px-4 py-3">
          <span className="font-bold text-lg tracking-tight text-gray-900">LucaTaxGPT</span>
          <div className="flex items-center gap-2">
            <button
              className="px-2 py-1 text-xs bg-gray-100 text-gray-800 rounded hover:bg-gray-200 transition-colors"
              onClick={onModeSwitch}
            >
              Admin
            </button>
            <button
              className="rounded-full p-2 hover:bg-gray-200"
              onClick={() => onSidebarToggle?.(false)}
              aria-label="Collapse sidebar"
              title="Collapse sidebar"
            >
              <ArrowLeft className="w-5 h-5 text-gray-700" />
            </button>
          </div>
        </div>
        {/* Scrollable Content Area */}
        <div className="flex-1 flex flex-col overflow-y-auto overflow-x-hidden">
          {/* Vertical Menu: Search and New Chat */}
          <div className="flex flex-col gap-1 px-2 pt-3 pb-2 border-b border-gray-100 bg-white">
            {/* Search Chats */}
            <div
              tabIndex={0}
              role="button"
              className="group flex items-center justify-between gap-2 rounded-lg px-2 py-2 hover:bg-gray-100 focus:bg-gray-100 cursor-pointer __menu-item"
              onClick={handleOpenSearch}
              onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') handleOpenSearch(); }}
              aria-label="Search chats"
            >
              <div className="flex min-w-0 items-center gap-1.5">
                <div className="flex items-center justify-center icon">
                  <Search className="w-5 h-5 text-gray-700" />
                </div>
                <div className="flex min-w-0 grow items-center gap-2.5">
                  <span className="truncate text-sm text-gray-900">Search chats</span>
                </div>
              </div>
              <div className="trailing highlight text-xs text-gray-400 touch:hidden">
                ⌘ K
              </div>
            </div>
            {/* New Chat */}
            <a
              tabIndex={0}
              className="group flex items-center justify-between gap-2 rounded-lg px-2 py-2 hover:bg-gray-100 focus:bg-gray-100 cursor-pointer __menu-item"
              onClick={e => { e.preventDefault(); onStartNewChat?.(); }}
              href="#"
              aria-label="New chat"
              data-testid="create-new-chat-button"
            >
              <div className="flex min-w-0 items-center gap-1.5">
                <div className="flex items-center justify-center icon">
                  <PencilLine className="w-5 h-5 text-gray-700" />
                </div>
                <div className="flex min-w-0 grow items-center gap-2.5">
                  <span className="truncate text-sm text-gray-900">New chat</span>
                </div>
              </div>
              <div className="trailing highlight text-xs text-gray-400 touch:hidden">
                ⇧ ⌘ O
              </div>
            </a>
          </div>
          
          {/* Chat List */}
          <div className="flex flex-col px-2 py-2 bg-white">
            <div className="pt-2 pb-3">
              <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wider px-2">Chats</h2>
            </div>
            <nav className="flex-1">
              {isLoading ? (
                <div className="p-4 text-center text-gray-500">Loading chats...</div>
              ) : (
                <ChatList
                  chats={chats}
                  selectedChatId={selectedChatId}
                  deletingChatId={deletingChatId}
                  renamingChatId={renamingChatId}
                  renameInput={renameInput}
                  onChatSelect={handleChatSelect}
                  onRenameStart={(chatId, title) => {
                    setRenamingChatId(chatId);
                    setRenameInput(title);
                  }}
                  onRenameChange={setRenameInput}
                  onRenameSave={handleRenameSave}
                  onRenameCancel={() => {
                    setRenamingChatId(null);
                    setRenameInput('');
                  }}
                  onDeleteChat={handleDeleteChat}
                />
              )}
            </nav>
          </div>
        </div>

                {/* Footer with Settings */}
        <div className="border-t border-gray-200 bg-white">
          {/* Settings Button */}
          <div className="p-3">
            <button
              onClick={handleOpenSettings}
              className="flex items-center gap-2 w-full px-3 py-2 text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
            >
              <Settings className="w-4 h-4" />
              <span className="text-sm font-medium">Settings</span>
            </button>
          </div>
          
          {/* Version Footer */}
          <div className="px-4 py-2 text-xs text-gray-400 text-center border-t border-gray-100">
            LucaTaxGPT v1.0
          </div>
        </div>

        {/* Context Menu */}
        {contextMenu.show && (
          <div style={{ position: 'fixed', top: contextMenu.y, left: contextMenu.x, zIndex: 50 }} className="bg-white border rounded shadow-lg">
            <button onClick={handleCopyContextToNewChat} className={`block w-full px-4 py-2 text-left hover:bg-gray-100 ${
                deletingChatId === contextMenu.chatId ? 'text-gray-400 cursor-not-allowed' : ''
              }`} disabled={deletingChatId === contextMenu.chatId}>
              {deletingChatId === contextMenu.chatId ? 'Copying...' : 'Copy context to new chat'}
            </button>
            <button 
              onClick={handleDeleteFromMenu} 
              className={`block w-full px-4 py-2 text-left hover:bg-gray-100 ${
                deletingChatId === contextMenu.chatId ? 'text-gray-400 cursor-not-allowed' : 'text-red-600'
              }`}
              disabled={deletingChatId === contextMenu.chatId}
            >
              {deletingChatId === contextMenu.chatId ? 'Deleting...' : 'Delete'}
            </button>
          </div>
        )}
              </aside>

        {/* Overlay when sidebar is open on small screens */}
      {isClient && window.innerWidth < 800 && sidebarOpen && (
        <div
          className="fixed inset-0 bg-black bg-opacity-40 z-[99998] pointer-events-auto"
          onClick={() => onSidebarToggle?.(false)}
        />
      )}
      
      {/* Model Settings Popup (always render, even if sidebar is collapsed) */}
      {showSettingsPopup && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50" onClick={handleCloseSettings}>
          <div 
            className="flex flex-col max-h-[480px] min-h-[480px] w-[638px] bg-white rounded-xl shadow-xl" 
            style={sidebarOpen ? { marginLeft: 245 } : {}} // Offset if sidebar is open
            onClick={e => e.stopPropagation()}
          >
            {/* Content */}
            <div className="flex-1 p-6">
              <ChatSettings
                ref={chatSettingsRef}
                selectedModelType={selectedModelType}
                selectedModel={selectedModel}
                isAsyncMode={isAsyncMode}
                onModelChange={onModelChange || (() => {})}
                onModeChange={onModeChange || (() => {})}
                onClose={handleCloseSettings}
                onSave={handleSaveSettings}
                onCancel={handleCloseSettings}
                availableModels={availableModels}
              />
            </div>
          </div>
        </div>
      )}
      
      {/* Search Popup (always render, even if sidebar is expanded) */}
      <ChatSearchPopup
        isOpen={showSearch}
        searchQuery={searchQuery}
        filteredChats={filteredChats}
        deletingChatId={deletingChatId}
        onClose={() => setShowSearch(false)}
        onSearchChange={setSearchQuery}
        onStartNewChat={onStartNewChat || createNewChat}
        onChatSelect={handleChatSelect}
      />
    </>
  );
} 