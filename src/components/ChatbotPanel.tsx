'use client';

import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { ChatState, Message } from '../types/chat';
import ChatHeader from '@/components/chat/ChatHeader';
import ChatInput from '@/components/chat/ChatInput';
import ChatWelcomeOverlay from '@/components/chat/ChatWelcomeOverlay';
import ExpandedTextEditor from '@/components/chat/ExpandedTextEditor';
import ChatMessageList from '@/components/chat/ChatMessageList';
import ChatConnectionStatus from '@/components/chat/ChatConnectionStatus';
import { ChatSSEService } from '@/components/chat/ChatSSEService';
import { useChatTurns } from '@/hooks/useChatTurns';
import { useFeedbackState } from '@/hooks/useFeedbackState';

interface DomainKnowledge {
  stateTaxCodes: string[];
  filingEntity: string;
}

interface UserProfile {
  tags: string[];
  context: string;
}

interface ChatbotPanelProps {
  currentChat?: ChatState | null;
  userProfile?: UserProfile | null;
  updateChatTitle?: (chatId: string, newTitle: string) => void;
  onChatContextUpdate?: (updated: ChatState & { contextFilters?: any }) => void;
  pendingNewChat?: boolean;
  onCreateChatWithMessage?: (msg: string, modelType: 'chatgpt' | 'ollama', model: string) => Promise<void>;
  selectedModelType?: 'chatgpt' | 'ollama';
  selectedModel?: string;
  onGlobalModelChange?: (modelType: 'chatgpt' | 'ollama', model: string) => void;
  isHydrated?: boolean;
  isAsyncMode?: boolean;
  sidebarOpen?: boolean;
  // ChatInstance methods for proper state management
  onSendMessage?: (message: string, userProfile?: any) => Promise<boolean>;
  onCancelRequest?: () => Promise<void>;
  onReloadMessage?: (messageId: string, modelType: 'chatgpt' | 'ollama', model: string) => Promise<boolean>;
  onEditMessage?: (messageId: string, newContent: string, userProfile?: any) => Promise<boolean>;
  onTryAgain?: (assistantMessageId: string, userProfile?: any) => Promise<boolean>;
  onUpdateModelSettings?: (settings: any) => void;
  onUpdateContextFilters?: (filters: any) => void;
  updateStreamingMessage?: (messageId: string, content: string, status?: 'streaming' | 'complete' | 'cancelled' | 'error') => void;
}

interface ConnectionStatus {
  healthy: boolean;
  issues: string[];
  lastCheck: number;
}

function getInitialDomainKnowledge(currentChat?: ChatState | null): DomainKnowledge {
  return {
    stateTaxCodes: currentChat?.contextFilters?.stateTaxCodes || [],
    filingEntity: (currentChat?.contextFilters as any)?.filingEntity || 'individuals'
  };
}

export default function ChatbotPanel({ 
  currentChat, 
  userProfile: propUserProfile,
  updateChatTitle,
  onChatContextUpdate,
  pendingNewChat = false,
  onCreateChatWithMessage,
  selectedModelType = 'ollama',
  selectedModel = 'phi3:3.8b',
  onGlobalModelChange,
  isHydrated,
  isAsyncMode = true,
  sidebarOpen,
  // ChatInstance methods
  onSendMessage,
  onCancelRequest,
  onReloadMessage,
  onEditMessage,
  onTryAgain,
  onUpdateModelSettings,
  onUpdateContextFilters,
  updateStreamingMessage
}: ChatbotPanelProps & { pendingNewChat?: boolean, onCreateChatWithMessage?: (msg: string, modelType: 'chatgpt' | 'ollama', model: string) => void }) {
  const [inputMessage, setInputMessage] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isModelSwitching, setIsModelSwitching] = useState(false);
  const [justExitedWelcome, setJustExitedWelcome] = useState(false);
  const [showWelcomeOverlay, setShowWelcomeOverlay] = useState<boolean>(pendingNewChat);
  const [backendOnline, setBackendOnline] = useState(true);
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>({
    healthy: true,
    issues: [],
    lastCheck: Date.now()
  });
  const [domainKnowledge, setDomainKnowledge] = useState<DomainKnowledge>(getInitialDomainKnowledge(currentChat));
  const [userProfile, setUserProfile] = useState<UserProfile>(propUserProfile || { tags: [], context: '' });
  const [editingTitle, setEditingTitle] = useState('');
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [forceRender, setForceRender] = useState(0);
  const [isClient, setIsClient] = useState(false);
  const [abortController, setAbortController] = useState<AbortController | null>(null);
  const [editingMessageId, setEditingMessageId] = useState<string | null>(null);
  const [isExpandedTextOpen, setIsExpandedTextOpen] = useState(false);
  const [expandedText, setExpandedText] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const chatScrollRef = useRef<HTMLDivElement>(null);
  const [isUserNearBottom, setIsUserNearBottom] = useState(true);
  const isUserNearBottomRef = useRef(true);
  
  // Use custom hooks
  const { turns, turnVariantIndex, getTurnKey, handleVariantPrev, handleVariantNext } = useChatTurns(currentChat?.messages || []);
  const { 
    feedbackState, 
    handleFeedback, 
    handleEditClick, 
    clearEditState 
  } = useFeedbackState();
  
  // Initialize SSE service
  const sseService = useMemo(() => new ChatSSEService(), []);
  
  // Use messages directly from currentChat (single source of truth)
  const messages = currentChat?.messages || [];
  const displayMessages = messages;

  // Force re-render effect for streaming updates
  useEffect(() => {
    // This effect intentionally empty - just triggers re-render when forceRender changes
    // This ensures UI updates immediately during streaming instead of waiting for tab switches
  }, [forceRender]);

  // Set client-side rendering
  useEffect(() => {
    setIsClient(true);
  }, []);

  // Sync userProfile with prop
  useEffect(() => {
    if (propUserProfile) {
      setUserProfile(propUserProfile);
    }
  }, [propUserProfile]);

  // Sync domainKnowledge with currentChat contextFilters
  useEffect(() => {
    if (currentChat?.contextFilters) {
      setDomainKnowledge({
        stateTaxCodes: currentChat.contextFilters.stateTaxCodes || [],
        filingEntity: (currentChat.contextFilters as any)?.filingEntity || 'individuals'
      });
    }
  }, [currentChat?.contextFilters]);

  // Handle tab visibility changes to ensure streaming updates when tab becomes visible
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (!document.hidden && sseService.getStreamingMessageRef()) {
        // Only auto-scroll if user is near bottom
        if (isUserNearBottom) {
          messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
        }
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, [isUserNearBottom, sseService]);

  // Check backend health periodically
  useEffect(() => {
    const checkHealthAndFetchStatus = async () => {
      try {
        const response = await fetch('/api/health');
        const isHealthy = response.ok;
        setBackendOnline(isHealthy);
        setConnectionStatus({
          healthy: isHealthy,
          issues: isHealthy ? [] : ['Backend not responding'],
          lastCheck: Date.now()
        });
      } catch (error) {
        setBackendOnline(false);
        setConnectionStatus({
          healthy: false,
          issues: ['Network error'],
          lastCheck: Date.now()
        });
      }
    };

    checkHealthAndFetchStatus();
    const interval = setInterval(checkHealthAndFetchStatus, 30000); // Check every 30 seconds

    return () => clearInterval(interval);
  }, []);

  // Initialize models
  useEffect(() => {
    const initializeModels = async () => {
      const maxRetries = 5;
      const retryDelay = 3000; // 3 seconds
      
      for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
          console.log(`🔄 [ChatbotPanel] Initializing models (attempt ${attempt}/${maxRetries})`);
          
          const response = await fetch('/api/chat/models', {
            method: 'GET',
            headers: {
              'Content-Type': 'application/json',
            },
            signal: AbortSignal.timeout(5000), // 5 second timeout
          });
          
          if (response.ok) {
            const data = await response.json();
            console.log('✅ [ChatbotPanel] Available models loaded:', data);
            break; // Success, exit retry loop
          } else if (response.status === 503) {
            // Backend is starting up, retry after delay
            const retryAfter = response.headers.get('Retry-After');
            const delay = retryAfter ? parseInt(retryAfter) * 1000 : retryDelay;
            
            if (attempt < maxRetries) {
              console.log(`⏳ [ChatbotPanel] Backend starting up, retrying model fetch in ${delay}ms (attempt ${attempt}/${maxRetries})`);
              await new Promise(resolve => setTimeout(resolve, delay));
              continue;
            } else {
              console.warn('⚠️ [ChatbotPanel] Backend is starting up, model initialization will retry later');
            }
          } else {
            console.error(`❌ [ChatbotPanel] Failed to initialize models: ${response.status} ${response.statusText}`);
            break;
          }
        } catch (error) {
          console.error(`❌ [ChatbotPanel] Error initializing models (attempt ${attempt}/${maxRetries}):`, error);
          
          if (error instanceof Error) {
            if (error.name === 'AbortError') {
              console.log(`⏱️ [ChatbotPanel] Request timeout, retrying...`);
            } else if (error.message.includes('fetch failed') || error.message.includes('Failed to fetch')) {
              console.log(`🔌 [ChatbotPanel] Network error, backend may be starting up...`);
            }
          }
          
          if (attempt < maxRetries) {
            // Wait before retrying with exponential backoff
            const backoffDelay = retryDelay * Math.pow(1.5, attempt - 1);
            console.log(`⏳ [ChatbotPanel] Retrying in ${backoffDelay}ms...`);
            await new Promise(resolve => setTimeout(resolve, backoffDelay));
          } else {
            console.warn('⚠️ [ChatbotPanel] Failed to initialize models after all retries - using default models');
            // Don't break the app, just log the warning
          }
        }
      }
    };

    // Only initialize models if we're on the client side and hydrated
    if (typeof window !== 'undefined' && isHydrated) {
      initializeModels();
    }
  }, [isHydrated]);

  // Debug messages changes (only log when not streaming to avoid spam)
  useEffect(() => {
    if (!sseService.getStreamingMessageRef()) {
      console.log(`📋 [ChatbotPanel] Messages updated, count: ${messages.length}`);
    }
  }, [messages, sseService]);

  // Keep a ref in sync to avoid stale closure during streaming
  useEffect(() => {
    isUserNearBottomRef.current = isUserNearBottom;
  }, [isUserNearBottom]);

  // Auto-subscribe to SSE when a new pending message is added (async mode)
  useEffect(() => {
    if (!currentChat || !isAsyncMode) return;

    // Find any pending assistant messages that need SSE subscription
    const pendingMessage = messages.find(msg => 
      msg.role === 'assistant' && 
      msg.status === 'pending' && 
      msg.content === '' // New placeholder message
    );

    if (pendingMessage && !sseService.getStreamingMessageRef()) {
      console.log(`📡 [ChatbotPanel] Auto-starting SSE subscription for pending message ${pendingMessage.id}`);
      
      // Create abort controller for this SSE subscription
      const controller = new AbortController();
      setAbortController(controller);
      
      // Start SSE subscription
      sseService.subscribeToAsyncUpdates(
        currentChat.id, 
        pendingMessage.id, 
        controller,
        {
          updateStreamingMessage,
          onChatContextUpdate,
          scrollToBottom,
          setIsLoading,
          setAbortController,
          setForceRender
        },
        isUserNearBottom
      );
    }
  }, [messages, currentChat, isAsyncMode, sseService, updateStreamingMessage, onChatContextUpdate, isUserNearBottom]);
  
  // Debug streaming updates - now triggered by actual state changes
  useEffect(() => {
    const streamingMessage = messages.find(m => m.status === 'streaming');
    if (streamingMessage) {
      console.log(`🔄 [ChatbotPanel] Streaming message updated: ${streamingMessage.content.length} chars`);
      console.log(`🔄 [ChatbotPanel] Content preview: "${streamingMessage.content.slice(-50)}"`);
    }
  }, [messages]);
  
  // Force re-render trigger for debugging purposes
  useEffect(() => {
    console.log(`🎨 [ChatbotPanel] Component re-rendered with ${messages.length} messages`);
    const streamingCount = messages.filter(m => m.status === 'streaming').length;
    if (streamingCount > 0) {
      console.log(`🎨 [ChatbotPanel] ${streamingCount} streaming messages currently active`);
    }
  });

  // Update domain knowledge when currentChat changes
  useEffect(() => {
    setDomainKnowledge(getInitialDomainKnowledge(currentChat));
  }, [currentChat]);

  // Update editing title when currentChat changes
  useEffect(() => {
    setEditingTitle(currentChat?.title || '');
  }, [currentChat?.title]);

  // Auto-scroll to bottom when switching chats (without animation)
  useEffect(() => {
    if (currentChat && messages.length > 0) {
      // Use instant scroll when switching chats
      messagesEndRef.current?.scrollIntoView({ behavior: 'auto' });
    }
  }, [currentChat?.id, messages.length]);

  const handleCopy = (content: string) => {
    navigator.clipboard.writeText(content);
  };

  const handleModelChange = (modelType: 'chatgpt' | 'ollama', model: string) => {
    setIsModelSwitching(true);
    if (onGlobalModelChange) {
      onGlobalModelChange(modelType, model);
    }
    setTimeout(() => setIsModelSwitching(false), 1000);
  };

  const handleReloadMessage = async (messageId: string, modelType: 'chatgpt' | 'ollama', model: string) => {
    if (!currentChat || !onReloadMessage) return;

    try {
      await onReloadMessage(messageId, modelType, model);
    } catch (error) {
      console.error('Error reloading message:', error);
    }
  };

  const startEditingMessage = (messageId: string) => {
    if (!currentChat) return;
    const target = currentChat.messages.find((m) => m.id === messageId && m.role === 'user');
    if (!target) return;
    setEditingMessageId(messageId);
    setInputMessage(target.content);
  };

  const handleTryAgain = async (assistantMessageId: string, _mode?: 'default' | 'concise' | 'detailed') => {
    if (!currentChat || !onTryAgain) return;
    try {
      // Find the parent user message for this assistant response
      const assistantIndex = currentChat.messages.findIndex(m => m.id === assistantMessageId);
      let parentUserId: string | null = null;
      if (assistantIndex !== -1) {
        let idx = assistantIndex - 1;
        while (idx >= 0) {
          const msg = currentChat.messages[idx];
          if (msg.role === 'user') { 
            parentUserId = msg.id; 
            break; 
          }
          idx--;
        }
      }

      if (parentUserId) {
        // Set loading state immediately so UI shows the new response position
        setIsLoading(true);
        
        // Find the turn key for this user message to update variant index
        const turnKey = parentUserId;
        
        // Automatically navigate to the latest response in this turn
        // This ensures the UI shows "2/2" or "3/3" etc. immediately
        const currentTurn = turns.find(turn => turn.user?.id === parentUserId);
        if (currentTurn && currentTurn.assistants.length > 0) {
          const latestVariantIndex = currentTurn.assistants.length - 1;
          // Note: This would need to be handled by the useChatTurns hook
          // For now, we'll just proceed with the retry
        }
        
        // Handle AbortError gracefully - this is expected when retrying
        try {
          // Kick off retry - this will create a new assistant message via the backend
          await onTryAgain(assistantMessageId);
          
          console.log('✅ Try again initiated successfully');
          // The backend will handle creating the new assistant message
          // and the UI will update via the existing message update mechanisms
        } catch (retryError) {
          // Handle AbortError specifically - this is normal when retrying
          if (retryError instanceof Error && retryError.name === 'AbortError') {
            console.log('🔄 [Try Again] Previous request aborted (expected behavior)');
            // Continue waiting for the new response
          } else {
            console.error('❌ Unexpected error during try again:', retryError);
            setIsLoading(false);
          }
        }
      }
    } catch (error) {
      console.error('❌ Error in handleTryAgain:', error);
      setIsLoading(false);
    }
  };

  const handleEditSave = async (msg: Message) => {
    if (!currentChat || !onEditMessage) return;

    const feedback = feedbackState[msg.id];
    if (!feedback) return;

    try {
      const success = await onEditMessage(msg.id, feedback.input, userProfile);
      if (success) {
        // Clear edit state
        clearEditState(msg.id);
      } else {
        console.error('Failed to edit message through ChatInstance');
      }
    } catch (error) {
      console.error('Error editing message:', error);
    }
  };

  const persistContextFilters = async (filters: any) => {
    if (!currentChat) return;

    try {
      await fetch(`/api/chat/chats/${currentChat.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contextFilters: filters
        })
      });
    } catch (error) {
      console.error('Error persisting context filters:', error);
    }
  };

  const updateDomainKnowledge = (updater: any) => {
    const newDomainKnowledge = typeof updater === 'function' ? updater(domainKnowledge) : updater;
    setDomainKnowledge(newDomainKnowledge);
    
    // Persist to backend
    persistContextFilters({
      stateTaxCodes: newDomainKnowledge.stateTaxCodes,
      profileTags: userProfile?.tags || [],
      filingEntity: newDomainKnowledge.filingEntity || 'individuals'
    });
  };

  const handleTitleSave = async () => {
    if (!currentChat || !updateChatTitle) return;

    try {
      await updateChatTitle(currentChat.id, editingTitle);
      setIsEditingTitle(false);
    } catch (error) {
      console.error('Error updating title:', error);
    }
  };

  const scrollToBottom = useCallback(() => {
    const scroller = chatScrollRef.current;
    if (scroller) {
      scroller.scrollTop = scroller.scrollHeight;
    } else {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, []);

  // Optimized scroll effect - trigger when messages change (including content updates)
  useEffect(() => {
    if (isUserNearBottom) {
      scrollToBottom();
    }
  }, [messages, isUserNearBottom, scrollToBottom]);

  const handleScroll = useCallback(() => {
    const scroller = chatScrollRef.current;
    if (!scroller) return;
    const threshold = 120; // px from bottom to still auto-scroll (increased to account for input box)
    const nearBottom = scroller.scrollTop + scroller.clientHeight >= scroller.scrollHeight - threshold;
    setIsUserNearBottom(nearBottom);
  }, []);

  // Show floating input only when welcome overlay is fully gone and the chat has content
  const shouldShowFloatingInput = !pendingNewChat && !showWelcomeOverlay && (turns.length > 0);

  const sendMessage = async () => {
    if (!inputMessage.trim() || isLoading || isModelSwitching) return;

    // Check if backend is online
    if (!backendOnline) {
      // For backend offline, we still need to show an error message, but let's check if we have the method
      console.error('Backend is offline');
      return;
    }

    // If this is the first message and no chat exists, create one first
    if (!currentChat && onCreateChatWithMessage) {
      onCreateChatWithMessage(inputMessage, selectedModelType, selectedModel);
      setInputMessage('');
      return;
    }

    // If no current chat or no onSendMessage method, we can't proceed
    if (!currentChat || !onSendMessage) {
      console.error('No current chat available or no send message method');
      return;
    }

    // Clear input immediately for better UX
    const messageContent = inputMessage;
    setInputMessage('');
    setIsLoading(true);

    // Use ChatInstance methods for proper state management
    try {
      let success = false;
      if (editingMessageId && onEditMessage) {
        success = await onEditMessage(editingMessageId, messageContent);
      } else if (onSendMessage) {
        success = await onSendMessage(messageContent);
      }
      if (success === false) {
        console.error('Failed to send message');
      }
    } catch (error) {
      console.error('Error sending message:', error);
    } finally {
      setIsLoading(false);
      // Clear edit mode after attempt
      setEditingMessageId(null);
    }
  };

  const cancelRequest = async () => {
    console.log('🛑 Cancelling current request');
    
    // Use ChatInstance method for proper cancellation
    if (onCancelRequest) {
      try {
        await onCancelRequest();
      } catch (error) {
        console.error('Error cancelling request:', error);
      }
    }
    
    // Clean up local loading state
    setIsLoading(false);
    if (abortController) {
      abortController.abort();
      setAbortController(null);
    }
  };

  const handleFirstMessage = async () => {
    if (pendingNewChat && onCreateChatWithMessage) {
      // Start creating/sending; Chat page will flip pendingNewChat to false when send starts/finishes
      onCreateChatWithMessage(inputMessage, selectedModelType, selectedModel);
      setInputMessage('');
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      if (pendingNewChat) {
        handleFirstMessage();
      } else {
        sendMessage();
      }
    }
  };

  function handleCopySettings() {
    const settings = {
      modelType: selectedModelType,
      model: selectedModel,
      isAsync: currentChat?.modelSettings?.isAsync ?? true
    };
    navigator.clipboard.writeText(JSON.stringify(settings, null, 2));
  }

  function updateConversationFilters(updated: ChatState) {
    if (onChatContextUpdate) {
      onChatContextUpdate(updated);
    }
  }

  const getModelDisplayName = () => {
    switch (selectedModel) {
      case 'gpt-4o':
        return 'GPT-4o';
      case 'gpt-4o-mini':
        return 'GPT-4o Mini';
      case 'gpt-3.5-turbo':
        return 'GPT-3.5 Turbo';
      case 'phi3:3.8b':
        return 'Phi-3 3.8B';
      case 'mistral:7b':
        return 'Mistral 7B';
      default:
        return selectedModel;
    }
  };

  const getProviderName = () => {
    return selectedModelType === 'chatgpt' ? 'OpenAI' : 'Ollama';
  };

  // Handle expanded text editor
  const openExpandedText = () => {
    setExpandedText(inputMessage);
    setIsExpandedTextOpen(true);
  };

  // Sync expanded text with input message when popup opens
  useEffect(() => {
    if (isExpandedTextOpen) {
      setExpandedText(inputMessage);
    }
  }, [isExpandedTextOpen, inputMessage]);

  const closeExpandedText = () => {
    setIsExpandedTextOpen(false);
    setExpandedText('');
  };

  const applyExpandedText = () => {
    setInputMessage(expandedText);
    closeExpandedText();
  };

  // Detect transition from welcome view to regular chat to trigger quick input animation
  const prevPendingRef = useRef<boolean>(pendingNewChat);
  useEffect(() => {
    if (prevPendingRef.current && !pendingNewChat) {
      setJustExitedWelcome(true);
      const t = setTimeout(() => setJustExitedWelcome(false), 300);
      return () => clearTimeout(t);
    }
    prevPendingRef.current = pendingNewChat;
  }, [pendingNewChat]);

  // Control welcome overlay mount for smooth exit animation
  useEffect(() => {
    if (pendingNewChat) {
      setShowWelcomeOverlay(true);
    } else {
      const t = setTimeout(() => setShowWelcomeOverlay(false), 300);
      return () => clearTimeout(t);
    }
  }, [pendingNewChat]);

  return (
    <div className="flex flex-col h-full bg-white">
      {/* Header */}
      <ChatHeader
        title={pendingNewChat ? 'New Chat' : (currentChat?.title || 'Untitled Chat')}
        isEditingTitle={isEditingTitle}
        editingTitle={editingTitle}
        onTitleChange={setEditingTitle}
        onTitleEditStart={() => setIsEditingTitle(true)}
        onTitleSave={handleTitleSave}
        isHydrated={isHydrated}
        modelDisplayName={getModelDisplayName()}
        isAsyncMode={isAsyncMode}
      />

      {/* Main Content with overlay for welcome */}
      <div className="flex-1 overflow-hidden relative flex flex-col chat-main-content">
        {/* Chat Area (always mounted) */}
        <div className="flex-1 overflow-y-auto p-4 pb-20 chat-scroll-area" ref={chatScrollRef} onScroll={handleScroll}>
          <div className="max-w-4xl mx-auto space-y-6 relative">
            <ChatMessageList
              turns={turns}
              turnVariantIndex={turnVariantIndex}
              feedbackState={feedbackState}
              currentChat={currentChat}
                      onCopy={handleCopy}
              onLike={(id) => handleFeedback(id, 'like', currentChat?.id)}
              onDislike={(id) => handleFeedback(id, 'dislike', currentChat?.id)}
              onTryAgain={handleTryAgain}
              onVariantPrev={handleVariantPrev}
              onVariantNext={handleVariantNext}
                      onEditUser={startEditingMessage}
              getTurnKey={getTurnKey}
            />
            <div ref={messagesEndRef} />
          </div>
        </div>

        {/* Welcome Overlay */}
        <ChatWelcomeOverlay
          inputMessage={inputMessage}
          isLoading={isLoading}
          pendingNewChat={pendingNewChat}
          showWelcomeOverlay={showWelcomeOverlay}
          onInputChange={setInputMessage}
          onFirstMessage={handleFirstMessage}
          onExpandText={openExpandedText}
                      onKeyPress={handleKeyPress}
        />

        {/* Input Area with quick slide-in after welcome (anchored to chat panel) */}
        {shouldShowFloatingInput && (
          <div 
            className={`chat-input-container ${justExitedWelcome ? 'animate-in slide-in-from-bottom-2 duration-150' : ''}`}
            role="region"
            aria-label="Message input area"
          >
            <ChatInput
              value={inputMessage}
              isLoading={isLoading}
              onChange={setInputMessage}
              onSubmit={pendingNewChat ? handleFirstMessage : sendMessage}
              onCancel={cancelRequest}
              placeholder={editingMessageId ? 'Edit your message and press Enter to re-run' : 'Type your message here...'}
              domainKnowledge={domainKnowledge}
              profileTags={userProfile.tags}
              onDomainKnowledgeChange={updateDomainKnowledge}
              onProfileTagsChange={(tags) => {
                setUserProfile(prev => ({ ...prev, tags }));
              }}
              floatingWithinParent={true}
              sidebarOpen={sidebarOpen}
              onExpandText={openExpandedText}
            />
          </div>
        )}

        {/* Expanded Text Editor Overlay */}
        <ExpandedTextEditor
          isOpen={isExpandedTextOpen}
          expandedText={expandedText}
          isLoading={isLoading}
          domainKnowledge={domainKnowledge}
          profileTags={userProfile.tags}
          onTextChange={setExpandedText}
          onClose={closeExpandedText}
          onApply={applyExpandedText}
          onSend={async () => {
                      if (!expandedText.trim() || isLoading) return;
                      
                      const messageToSend = expandedText.trim();
                      
                      // Close the expanded editor immediately for instant feedback
                      closeExpandedText();
                      
                      // Send the message directly
                      if (pendingNewChat && onCreateChatWithMessage) {
                        // For new chats, use the create chat with message function
                        await onCreateChatWithMessage(messageToSend, selectedModelType, selectedModel);
                      } else {
                        // For existing chats, set input and send
                        setInputMessage(messageToSend);
                        // Small delay to ensure state updates, then send
                        setTimeout(async () => {
                          await sendMessage();
                        }, 50);
                      }
                    }}
                onDomainKnowledgeChange={updateDomainKnowledge}
                onProfileTagsChange={(tags) => {
                  setUserProfile(prev => ({ ...prev, tags }));
                }}
              />
      </div>

      {/* Connection Status */}
      <ChatConnectionStatus
        isClient={isClient}
        connectionStatus={connectionStatus}
      />
    </div>
  );
} 