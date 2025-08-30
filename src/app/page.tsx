'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import ChatbotPanel from '@/components/ChatbotPanel';
import ProfilePanel from '@/components/ProfilePanel';
import AdminPanel from '@/components/AdminPanel';
import ChatHistory from '@/components/ChatHistory';
import { useChatList } from '../hooks/useChatList';
import { useChatInstance } from '../hooks/useChatInstance';
import type { ChatListItem } from '../types/chat';
import { ChatState } from '../lib/ChatInstance';

export default function Home() {
  const [mode, setMode] = useState<'user' | 'admin'>('user');
  const [activeTab, setActiveTab] = useState<'chat' | 'profile' | 'admin'>('chat');
  const [showProfileDropdown, setShowProfileDropdown] = useState(false);
  const [sidebarWidth, setSidebarWidth] = useState(320);
  const [sidebarOpen, setSidebarOpen] = useState(true); // Track sidebar open/closed state
  const [userProfile, setUserProfile] = useState<any>(null);
  const [showStateDropdown, setShowStateDropdown] = useState(false);
  const stateDropdownRef = useRef<HTMLDivElement>(null);
  const [reloadFlag, setReloadFlag] = useState(0);
  const [pendingNewChat, setPendingNewChat] = useState(false);
  const [isHydrated, setIsHydrated] = useState(false);
  
  // Global model settings state with localStorage persistence
  const [globalModelSettings, setGlobalModelSettings] = useState<{
    modelType: 'chatgpt' | 'ollama';
    model: string;
    isAsync: boolean;
  }>({
    modelType: 'ollama',
    model: 'phi3:3.8b',
    isAsync: true
  });

  // Load settings from localStorage after hydration
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('lucatax-model-settings');
      if (saved) {
        try {
          const parsedSettings = JSON.parse(saved);
          setGlobalModelSettings(parsedSettings);
        } catch (e) {
          console.warn('Failed to parse saved model settings:', e);
        }
      }
      setIsHydrated(true);
    }
  }, []);

  // Save global model settings to localStorage whenever they change
  useEffect(() => {
    if (typeof window !== 'undefined' && isHydrated) {
      localStorage.setItem('lucatax-model-settings', JSON.stringify(globalModelSettings));
    }
  }, [globalModelSettings, isHydrated]);
  
  // Use the new chat hooks
  const {
    chats: chatList,
    selectedChatId,
    createChat,
    deleteChat,
    selectChat,
    updateChatTitle: updateChatTitleInList,
    loadAllChats,
    isLoading: isChatListLoading,
    isInitialized: isChatListInitialized
  } = useChatList({
    onChatAdded: (chat) => {
      selectChat(chat.id);
    },
    // When a chat is removed, selection will be advanced to the next chat by the hook/manager
    onChatRemoved: () => {},
    onError: (error) => {
      console.error('Chat list error:', error);
    }
  });

  // Use chat instance for the selected chat
  const {
    state: currentChatState,
    isLoading: isChatLoading,
    sendMessage,
    cancelRequest,
    reloadMessage,
    editMessage,
    tryAgain,
    setModelSettings,
    setContextFilters,
    setTitle,
    setId,
    updateStreamingMessage
  } = useChatInstance(selectedChatId || undefined, {
    onStateUpdate: (updates) => {
      // Update the chat list when chat state changes
      if (selectedChatId && updates.title) {
        updateChatTitleInList(selectedChatId, updates.title);
      }
    },
    onError: (error) => {
      // Only log non-"chat not found" errors as console errors
      if (!error.includes('Chat not found')) {
        console.error('Chat instance error:', error);
      }
    },
    onChatNotFound: (chatId) => {
      console.log(`📝 [Home] Chat ${chatId} not found, clearing selection`);
      // Clear selection when chat is not found (likely deleted)
      selectChat(null);
    }
  });

  // Handler for starting a new chat (show intro, don't create chat yet)
  const handleStartNewChat = () => {
    selectChat(null);
    setPendingNewChat(true);
  };

  // Handler for actually creating a chat when user sends first message
  const handleCreateChatWithMessage = async (message: string, modelType: 'chatgpt' | 'ollama', model: string) => {
    try {
      console.log('🚀 Creating new chat with first message...');
      
      // Create chat in backend first
      const newChat = await createChat('New Conversation');
      if (!newChat) {
        console.error('❌ Failed to create new chat');
        return;
      }
      
      console.log('✅ Created new chat with ID:', newChat.id);
      // Select the chat in the UI (keep welcome view until first send kicks off)
      selectChat(newChat.id);

      // Wait briefly for ChatInstance to initialize for the new chat, then send via hook
      const maxWaitMs = 1500;
      const start = Date.now();
      while (!(currentChatState && currentChatState.id === newChat.id) && Date.now() - start < maxWaitMs) {
        // eslint-disable-next-line no-await-in-loop
        await new Promise(r => setTimeout(r, 50));
      }

      // Send the first message through ChatInstance so it creates the pending assistant (thinking) item
      try {
        const ok = await sendMessage(message, userProfile);
        if (!ok) {
          console.warn('First message send returned false; user may resend manually');
        }
        // Now that sending has begun/finished, exit welcome view
        setPendingNewChat(false);
      } catch (sendErr) {
        console.error('❌ Error sending first message via ChatInstance:', sendErr);
        // Even if sending fails, exit welcome view to allow manual retry in regular layout
        setPendingNewChat(false);
      }
    } catch (error) {
      console.error('❌ Failed to create chat with message:', error);
    }
  };

  // Click outside handler for state dropdown
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (stateDropdownRef.current && !stateDropdownRef.current.contains(event.target as Node)) {
        setShowStateDropdown(false);
      }
    };

    if (showStateDropdown) {
      document.addEventListener('mousedown', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [showStateDropdown]);

  const handleStateToggle = (state: string) => {
    // This function is no longer needed as domainKnowledge is removed
    return 'N/A'; // Placeholder as domainKnowledge is removed
  };

  const formatSelectedStates = (states: string[]) => {
    // This function is no longer needed as domainKnowledge is removed
    return 'N/A'; // Placeholder as domainKnowledge is removed
  };

  const handleChatSelect = (chat: ChatListItem) => {
    // Allow switching to any chat, even if another is loading
    selectChat(chat.id);
    setPendingNewChat(false);
  };

  // Function to update a chat's title in the shared state
  const updateChatTitle = (chatId: string, newTitle: string) => {
    updateChatTitleInList(chatId, newTitle);
    // Also update the active chat instance state so header reflects immediately
    if (!selectedChatId || selectedChatId === chatId) {
      setTitle(newTitle);
    }
  };

  // Listen for title updates dispatched by other components (e.g., sidebar rename)
  useEffect(() => {
    const handleTitleUpdated = (e: any) => {
      const { id, title } = e.detail || {};
      if (!id || !title) return;
      // Update chat list and active chat instance
      updateChatTitleInList(id, title);
      if (selectedChatId === id) {
        setTitle(title);
      }
    };
    if (typeof window !== 'undefined') {
      window.addEventListener('conversation-title-updated', handleTitleUpdated);
    }
    return () => {
      if (typeof window !== 'undefined') {
        window.removeEventListener('conversation-title-updated', handleTitleUpdated);
      }
    };
  }, [selectedChatId, updateChatTitleInList, setTitle]);

  // Add handler to update chat context in state
  const handleChatContextUpdate = (updated: any) => {
    console.log('🔄 Parent: Chat context updated:', updated);
    // The chat state is managed by the useChatInstance hook
    // Only trigger reload when streaming is complete, not during streaming updates
    if (!updated?.loadingState?.isLoading) {
      setReloadFlag(f => f + 1);
    }
  };

  // This callback will be passed to ChatHistory and ChatbotPanel
  const handleChatContextUpdateReload = (updated?: any) => {
    if (updated) {
      handleChatContextUpdate(updated);
    } else {
      setReloadFlag(f => f + 1);
    }
  };

  // Settings handlers for global model settings
  const handleModelChange = (modelType: 'chatgpt' | 'ollama', model: string) => {
    // Update global settings
    setGlobalModelSettings(prev => ({ ...prev, modelType, model }));
    
    // Update current chat settings if a chat is selected
    if (selectedChatId) {
      setModelSettings({ modelType, model });
    }
  };

  const handleModeChange = (isAsync: boolean) => {
    // Update global settings
    setGlobalModelSettings(prev => ({ ...prev, isAsync }));
    
    // Update current chat settings if a chat is selected
    if (selectedChatId) {
      setModelSettings({ isAsync });
    }
  };

  const handleAsyncModeChange = (isAsync: boolean) => {
    // Update global settings
    setGlobalModelSettings(prev => ({ ...prev, isAsync }));
    
    // Update current chat settings if a chat is selected
    if (selectedChatId) {
      setModelSettings({ isAsync });
    }
  };

  // Get current chat settings (use current chat settings or global settings)
  const getCurrentChatSettings = () => {
    return currentChatState?.modelSettings || globalModelSettings;
  };

  if (mode === 'admin') {
    return (
      <div className="flex h-screen bg-gray-50">
        {/* Admin Mode */}
        <div className="flex-1 flex flex-col">
          {/* Top Navigation */}
          <div className="bg-white border-b border-gray-200 p-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-4">
                <h1 className="text-2xl font-bold text-gray-900">LucaTaxGPT Admin</h1>
                <button
                  onClick={() => setMode('user')}
                  className="px-3 py-1 text-sm bg-gray-100 text-gray-700 rounded hover:bg-gray-200"
                >
                  Switch to User Mode
                </button>
              </div>
            </div>
          </div>

          {/* Admin Content */}
          <div className="flex-1 overflow-hidden">
            <AdminPanel />
          </div>
        </div>
      </div>
    );
  }

  const currentSettings = getCurrentChatSettings();
  


  return (
    <div className="flex h-screen bg-gray-50">
      {/* User Mode */}
      
      {/* Left Sidebar - Conversation History */}
      <div className="relative">
        <ChatHistory 
          chats={chatList}
          setChats={() => {}} // No-op since state is managed by useChatList
          selectedChatId={selectedChatId}
          setSelectedChatId={() => {}} // No-op since state is managed by useChatList
          onChatSelect={handleChatSelect}
          onStartNewChat={handleStartNewChat}
          onDeleteChat={deleteChat} // Connect to main app's delete function
          onWidthChange={setSidebarWidth}
          width={sidebarWidth}
          sidebarOpen={sidebarOpen}
          onSidebarToggle={setSidebarOpen}
          onModeSwitch={() => setMode('admin')}
          reloadFlag={reloadFlag}
          pendingNewChat={pendingNewChat}
          selectedModelType={currentSettings.modelType}
          selectedModel={currentSettings.model}
          isAsyncMode={currentSettings.isAsync}
          onModelChange={handleModelChange}
          onModeChange={handleModeChange}
          onAsyncModeChange={handleAsyncModeChange}
          // Lazy loading props
          loadAllChats={loadAllChats}
          isLoading={isChatListLoading}
          isInitialized={isChatListInitialized}
        />
      </div>

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Chat Area */}
        <div className="flex-1 overflow-hidden">
          <ChatbotPanel 
            currentChat={currentChatState}
            userProfile={userProfile}
            updateChatTitle={updateChatTitle}
            onChatContextUpdate={handleChatContextUpdateReload}
            pendingNewChat={pendingNewChat}
            onCreateChatWithMessage={handleCreateChatWithMessage}
            selectedModelType={currentSettings.modelType}
            selectedModel={currentSettings.model}
            onGlobalModelChange={handleModelChange}
            isHydrated={isHydrated}
            isAsyncMode={currentSettings.isAsync}
            sidebarOpen={sidebarOpen}
            // Pass ChatInstance methods for proper state management
            onSendMessage={sendMessage}
            onCancelRequest={cancelRequest}
            onReloadMessage={reloadMessage}
            onEditMessage={editMessage}
            onTryAgain={tryAgain}
            onUpdateModelSettings={setModelSettings}
            onUpdateContextFilters={setContextFilters}
            updateStreamingMessage={updateStreamingMessage}
          />
        </div>
      </div>
    </div>
  );
} 