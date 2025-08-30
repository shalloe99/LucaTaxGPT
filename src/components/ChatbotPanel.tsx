'use client';

import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { flushSync } from 'react-dom';
import { Expand, Upload, X } from 'lucide-react';
import { ChatState, Message } from '../types/chat';
import MessageBubble from '@/components/chat/MessageBubble';
import ChatInput from '@/components/chat/ChatInput';
import ChatHeader from '@/components/chat/ChatHeader';
import ContextFilterMenu from '@/components/chat/ContextFilterMenu';

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

interface FeedbackState {
  [messageId: string]: {
    feedback: 'like' | 'dislike' | null;
    showInput: boolean;
    input: string;
    submitting: boolean;
    editReady: boolean;
  };
}

interface ConnectionStatus {
  healthy: boolean;
  issues: string[];
  lastCheck: number;
}

//

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
  const [feedbackState, setFeedbackState] = useState<FeedbackState>({});
  const [forceRender, setForceRender] = useState(0);
  const [isClient, setIsClient] = useState(false);
  const [abortController, setAbortController] = useState<AbortController | null>(null);
  const [editingMessageId, setEditingMessageId] = useState<string | null>(null);
  const [isExpandedTextOpen, setIsExpandedTextOpen] = useState(false);
  const [expandedText, setExpandedText] = useState('');
  const [isExpandedContextMenuOpen, setIsExpandedContextMenuOpen] = useState(false);
  const expandedContextMenuRef = useRef<HTMLButtonElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const chatScrollRef = useRef<HTMLDivElement>(null);
  const expandTextareaRef = useRef<HTMLTextAreaElement>(null);
  const streamingMessageRef = useRef<{ id: string; content: string } | null>(null);
  const updateTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const [isUserNearBottom, setIsUserNearBottom] = useState(true);
  const isUserNearBottomRef = useRef(true);
  
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
      if (!document.hidden && streamingMessageRef.current) {
        // Only auto-scroll if user is near bottom
        if (isUserNearBottom) {
          messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
        }
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, [isUserNearBottom]);

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
  }, []);

  // Debug messages changes (only log when not streaming to avoid spam)
  useEffect(() => {
    if (!streamingMessageRef.current) {
      console.log(`📋 [ChatbotPanel] Messages updated, count: ${messages.length}`);
    }
  }, [messages]);

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

    if (pendingMessage && !streamingMessageRef.current) {
      console.log(`📡 [ChatbotPanel] Auto-starting SSE subscription for pending message ${pendingMessage.id}`);
      
      // Create abort controller for this SSE subscription
      const controller = new AbortController();
      setAbortController(controller);
      
      // Start SSE subscription
      subscribeToAsyncUpdates(currentChat.id, pendingMessage.id, controller);
    }
  }, [messages, currentChat, isAsyncMode]);
  
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
          setTurnVariantIndex(prev => ({
            ...prev,
            [turnKey]: latestVariantIndex
          }));
          console.log(`🔄 [Try Again] Auto-navigated to latest variant: ${latestVariantIndex + 1}/${currentTurn.assistants.length}`);
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

  const handleEditClick = (msg: Message) => {
    setFeedbackState(prev => ({
      ...prev,
      [msg.id]: {
        ...prev[msg.id],
        editReady: true,
        input: msg.content
      }
    }));
  };

  const handleEditInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const messageId = e.target.dataset.messageId;
    if (messageId) {
      setFeedbackState(prev => ({
        ...prev,
        [messageId]: {
          ...prev[messageId],
          input: e.target.value
        }
      }));
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
        setFeedbackState(prev => ({
          ...prev,
          [msg.id]: {
            ...prev[msg.id],
            editReady: false,
            input: ''
          }
        }));
      } else {
        console.error('Failed to edit message through ChatInstance');
      }
    } catch (error) {
      console.error('Error editing message:', error);
    }
  };

  const handleUserMsgMouseEnter = (msgId: string) => {
    setFeedbackState(prev => ({
      ...prev,
      [msgId]: {
        ...prev[msgId],
        showInput: true
      }
    }));
  };

  const handleUserMsgMouseLeave = (msgId: string) => {
    setFeedbackState(prev => ({
      ...prev,
      [msgId]: {
        ...prev[msgId],
        showInput: false
      }
    }));
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
  }, [messages, isUserNearBottom]);

  const handleScroll = useCallback(() => {
    const scroller = chatScrollRef.current;
    if (!scroller) return;
    const threshold = 120; // px from bottom to still auto-scroll (increased to account for input box)
    const nearBottom = scroller.scrollTop + scroller.clientHeight >= scroller.scrollHeight - threshold;
    setIsUserNearBottom(nearBottom);
  }, []);

  // Group messages into conversation turns (user + assistant variants)
  type Turn = { user?: Message & { assistantVariants?: string[] }; assistants: Message[] };
  const turns: Turn[] = useMemo(() => {
    // Group assistant messages by their parent user via parentUserId when available.
    const result: Turn[] = [];
    const userIdToTurnIndex = new Map<string, number>();
    let lastUserTurnIndex: number | null = null;

    displayMessages.forEach((msg) => {
      if (msg.role === 'user') {
        // Start a new turn for this user
        result.push({ user: msg as Turn['user'], assistants: [] });
        const idx = result.length - 1;
        userIdToTurnIndex.set(msg.id, idx);
        lastUserTurnIndex = idx;
      } else {
        // Assistant: try to find its user via parentUserId; fallback to last user turn
        let targetIdx: number | null = null;
        if ((msg as any).parentUserId && userIdToTurnIndex.has((msg as any).parentUserId)) {
          targetIdx = userIdToTurnIndex.get((msg as any).parentUserId)!;
        } else {
          targetIdx = lastUserTurnIndex;
        }
        if (targetIdx === null) {
          // No user yet; start a turn without user
          result.push({ assistants: [msg] });
        } else {
          result[targetIdx].assistants.push(msg);
        }
      }
    });

    return result;
  }, [displayMessages]);

  // Track selected assistant variant per turn
  const [turnVariantIndex, setTurnVariantIndex] = useState<Record<string, number>>({});
  const getTurnKey = (turn: Turn, idx: number) => turn.user?.id || `turn_${idx}`;

  // Build a lightweight signature so we only react to meaningful changes
  const turnsSignature = useMemo(
    () =>
      turns
        .map((t, idx) => `${t.user?.id || `u${idx}`}:${t.assistants.map(a => a.id).join(',')}`)
        .join('|'),
    [turns]
  );

  // Ensure a default selection for any turn lacking one, and prune removed turns
  useEffect(() => {
    setTurnVariantIndex(prev => {
      let changed = false;
      const next = { ...prev } as Record<string, number>;

      // Add defaults / fix out-of-range selections
      turns.forEach((turn, idx) => {
        const key = getTurnKey(turn, idx);
        const total = turn.assistants.length;
        if (total > 0) {
          const current = next[key];
          const desired = current === undefined || current >= total ? total - 1 : current;
          if (current !== desired) {
            next[key] = desired;
            changed = true;
          }
        }
      });

      // Prune selections for removed turns
      Object.keys(next).forEach(k => {
        const exists = turns.some((turn, idx) => getTurnKey(turn, idx) === k);
        if (!exists) {
          delete next[k];
          changed = true;
        }
      });

      return changed ? next : prev;
    });
  }, [turnsSignature]);

  // Show floating input only when welcome overlay is fully gone and the chat has content
  const shouldShowFloatingInput = !pendingNewChat && !showWelcomeOverlay && (turns.length > 0);

  const handleVariantPrev = (turnKey: string, total: number) => {
    setTurnVariantIndex(prev => {
      const current = prev[turnKey] ?? 0;
      const next = (current - 1 + total) % total;
      return { ...prev, [turnKey]: next };
    });
  };

  const handleVariantNext = (turnKey: string, total: number) => {
    setTurnVariantIndex(prev => {
      const current = prev[turnKey] ?? 0;
      const next = (current + 1) % total;
      return { ...prev, [turnKey]: next };
    });
  };

  // SSE subscription for async mode real-time updates
  const subscribeToAsyncUpdates = async (chatId: string, messageId: string, abortController: AbortController) => {
    try {
      console.log(`📡 [${chatId}] Starting SSE subscription for message ${messageId}`);
      
      // Create a timeout signal separate from the abort controller for SSE connection
      const sseTimeoutMs = 300000; // 5 minute timeout for SSE connection (same as backend timeout)
      const timeoutSignal = AbortSignal.timeout(sseTimeoutMs);
      const combinedSignal = AbortSignal.any([abortController.signal, timeoutSignal]);
      
      const response = await fetch(`/api/chat/user/messaging/${chatId}/subscribe`, {
        signal: combinedSignal,
        headers: {
          'Accept': 'text/event-stream',
          'Cache-Control': 'no-cache, no-transform',
          'Connection': 'keep-alive',
          'X-Requested-With': 'XMLHttpRequest'
        }
      });
      
      if (!response.ok) {
        throw new Error(`SSE subscription failed: ${response.status} ${response.statusText}`);
      }
      
      const reader = response.body?.getReader();
      if (!reader) {
        throw new Error('No response body for SSE');
      }
      
      const decoder = new TextDecoder();
      let accumulatedContent = '';
      
      console.log(`📡 [${chatId}] SSE connection established, waiting for events...`);
      
      let lastEventTime = Date.now();
      let hasReceivedEvents = false;
      
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) {
            console.log(`📡 [${chatId}] SSE stream ended`);
            break;
          }
          
          const chunk = decoder.decode(value, { stream: true });
          console.log(`📡 [${chatId}] SSE chunk received:`, chunk);
          const lines = chunk.split('\n');
          
          let currentEvent = '';
          
          for (const line of lines) {
            if (line.startsWith('event: ')) {
              currentEvent = line.slice(7).trim();
              continue;
            }
            
            if (line.startsWith('data: ')) {
              const data = line.slice(6).trim();
              if (!data) continue;
              
              // Skip ping events
              if (currentEvent === 'ping') {
                continue;
              }
              
              try {
                const eventData = JSON.parse(data);
                
                // Only log non-token events for clean console
                const isTokenEvent = (currentEvent === 'token' || eventData.type === 'token');
                if (!isTokenEvent) {
                  console.log(`📡 [${chatId}] SSE event received:`, { currentEvent, eventData, targetMessageId: messageId });
                }
                
                if (isTokenEvent && eventData.messageId === messageId) {
                  // Update message status to streaming and append content
                  hasReceivedEvents = true;
                  lastEventTime = Date.now();
                  accumulatedContent += eventData.content;
                  
                  // Update streaming message ref for immediate access
                  streamingMessageRef.current = { id: messageId, content: accumulatedContent };
                  
                  // Update ChatInstance state for proper React re-renders with immediate flush
                  if (updateStreamingMessage) {
                    console.log(`🔄 [ChatbotPanel] Calling updateStreamingMessage for ${messageId}: ${accumulatedContent.length} chars`);
                    flushSync(() => {
                      updateStreamingMessage(messageId, accumulatedContent, 'streaming');
                      // Force immediate re-render to prevent tab-switch dependency
                      setForceRender(prev => prev + 1);
                    });
                  } else {
                    console.warn(`⚠️ [ChatbotPanel] updateStreamingMessage not available for ${messageId}`);
                  }
                  
                  // Only auto-scroll if the user is near bottom (use ref to avoid stale closure)
                  if (isUserNearBottomRef.current) {
                    scrollToBottom();
                  }
                  
                } else if ((currentEvent === 'message_complete' || eventData.type === 'message_complete') && eventData.messageId === messageId) {
                  // Clear any pending debounced updates
                  if (updateTimeoutRef.current) {
                    clearTimeout(updateTimeoutRef.current);
                    updateTimeoutRef.current = null;
                  }
                  
                  // Clear streaming ref
                  streamingMessageRef.current = null;
                  
                  // Mark message as complete
                  console.log(`✅ [${chatId}] Message ${messageId} completed via SSE`);
                  
                  // Update ChatInstance state for message completion with immediate flush
                  if (updateStreamingMessage) {
                    flushSync(() => {
                      updateStreamingMessage(messageId, eventData.finalContent || accumulatedContent, 'complete');
                      // Force final re-render for completion
                      setForceRender(prev => prev + 1);
                    });
                  }
                  
                  // Notify parent to refresh context without duplicating messages
                  if (onChatContextUpdate && currentChat) {
                    onChatContextUpdate(currentChat);
                  }
                  
                  // Reset loading state and abort controller to change button back to "Send"
                  setIsLoading(false);
                  setAbortController(null);
                  break;
                  
                } else if ((currentEvent === 'message_cancelled' || eventData.type === 'message_cancelled') && eventData.messageId === messageId) {
                  // Clear any pending debounced updates
                  if (updateTimeoutRef.current) {
                    clearTimeout(updateTimeoutRef.current);
                    updateTimeoutRef.current = null;
                  }
                  
                  // Clear streaming ref
                  streamingMessageRef.current = null;
                  
                  // Mark message as cancelled
                  console.log(`🛑 [${chatId}] Message ${messageId} cancelled via SSE`);
                  
                  // Update ChatInstance state for message cancellation
                  if (updateStreamingMessage) {
                    updateStreamingMessage(messageId, eventData.partialContent || accumulatedContent, 'cancelled');
                  }
                  
                  // Reset loading state and abort controller to change button back to "Send"
                  setIsLoading(false);
                  setAbortController(null);
                  break;
                }
                
              } catch (parseError) {
                console.warn('Failed to parse SSE event data:', parseError);
              }
            }
          }
        }
      } finally {
        reader.releaseLock();
        
        // Clean up any pending debounced updates
        if (updateTimeoutRef.current) {
          clearTimeout(updateTimeoutRef.current);
          updateTimeoutRef.current = null;
        }
        
        // Clear streaming ref
        streamingMessageRef.current = null;
        
        // If SSE stream ended but we didn't receive any events, check backend for final result
        if (!hasReceivedEvents) {
          console.log(`📡 [${chatId}] SSE ended without receiving events, checking backend for result...`);
          
          // Fallback: poll backend for the final message content
          setTimeout(async () => {
            try {
              const response = await fetch(`/api/chat/chats/${chatId}`);
              if (response.ok) {
                const chatData = await response.json();
                const assistantMessage = chatData.messages.find((m: any) => m.id === messageId);
                
                if (assistantMessage && assistantMessage.status === 'complete' && assistantMessage.content) {
                  console.log(`📡 [${chatId}] Found completed message in backend, updating UI`);
                  // Update ChatInstance state for fallback completion
                  if (updateStreamingMessage) {
                    updateStreamingMessage(messageId, assistantMessage.content, 'complete');
                  }
                  setIsLoading(false);
                  setAbortController(null);
                }
              }
            } catch (error) {
              console.error(`❌ [${chatId}] Failed to check backend for final result:`, error);
            }
          }, 1000); // Check after 1 second
        }
      }
      
    } catch (error) {
      // Clean up any pending updates and streaming ref
      if (updateTimeoutRef.current) {
        clearTimeout(updateTimeoutRef.current);
        updateTimeoutRef.current = null;
      }
      streamingMessageRef.current = null;
      
      if (abortController.signal.aborted) {
        console.log(`📡 [${chatId}] SSE subscription cancelled`);
      } else {
        console.error(`❌ [${chatId}] SSE subscription error:`, error);
        
        // Update ChatInstance state for SSE error
        if (updateStreamingMessage) {
          updateStreamingMessage(messageId, 'Failed to connect for real-time updates. Please try again.', 'error');
        }
      }
      
      // Always reset loading state and abort controller to ensure button returns to "Send"
      setIsLoading(false);
      setAbortController(null);
    }
  };

  // Note: Message cancellation now handled by ChatInstance

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

  const MarkdownCode = ({inline, className, children, ...props}: {inline?: boolean, className?: string, children?: React.ReactNode}) => {
    const match = /language-(\w+)/.exec(className || '');
    return !inline && match ? (
      <pre className="bg-gray-900 text-white rounded p-2 overflow-x-auto max-w-full my-2">
        <code className={className} {...props}>
          {children}
        </code>
      </pre>
    ) : (
      <code className="bg-gray-100 text-pink-700 rounded px-1 py-0.5 text-xs break-words" {...props}>
        {children}
      </code>
    );
  };

  function MarkdownParagraph(props: React.PropsWithChildren<React.HTMLAttributes<HTMLParagraphElement>>) {
    return <p className="mb-4 last:mb-0" {...props} />;
  }

  const handleFeedback = async (messageId: string, type: 'like' | 'dislike') => {
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
          chatId: currentChat?.id
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

  const submitFeedbackComment = async (messageId: string) => {
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
          chatId: currentChat?.id
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
    // Focus the textarea after a short delay to ensure it's rendered
    setTimeout(() => {
      expandTextareaRef.current?.focus();
    }, 100);
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

  const handleExpandedTextKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      closeExpandedText();
    } else if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      applyExpandedText();
    }
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
            {turns.length > 0 && (
              turns.map((turn, idx) => {
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
                      onCopy={handleCopy}
                      onLike={(id) => handleFeedback(id, 'like')}
                      onDislike={(id) => handleFeedback(id, 'dislike')}
                      liked={feedbackState[turn.user.id]?.feedback === 'like'}
                      disliked={feedbackState[turn.user.id]?.feedback === 'dislike'}
                      onEditUser={startEditingMessage}
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
                      onCopy={handleCopy}
                      onLike={(id) => handleFeedback(id, 'like')}
                      onDislike={(id) => handleFeedback(id, 'dislike')}
                      liked={feedbackState[shownAssistant.id]?.feedback === 'like'}
                      disliked={feedbackState[shownAssistant.id]?.feedback === 'dislike'}
                      onTryAgain={(assistantId) => handleTryAgain(assistantId)}
                      variantIndex={variantTotal > 1 ? variantIndex + 1 : undefined}
                      variantTotal={variantTotal > 1 ? variantTotal : undefined}
                      onVariantPrev={variantTotal > 1 ? () => handleVariantPrev(key, variantTotal) : undefined}
                      onVariantNext={variantTotal > 1 ? () => handleVariantNext(key, variantTotal) : undefined}
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
                      onCopy={handleCopy}
                    />
                  )}
                </React.Fragment>
              );
              })
            )}
            <div ref={messagesEndRef} />
          </div>
        </div>

        {/* Welcome Overlay (kept mounted for seamless transition) */}
        {(showWelcomeOverlay || pendingNewChat) && (
          <div
            className={`absolute inset-0 bg-white transition-all duration-150 ease-out ${
              pendingNewChat
                ? 'opacity-100 translate-y-0 pointer-events-auto'
                : 'opacity-0 -translate-y-2 pointer-events-none'
            }`}
          >
            <div className="flex items-center justify-center h-full p-6 pb-20">
              <div className="w-full max-w-2xl mx-auto animate-in slide-in-from-bottom-2 duration-150">
                <div className="text-center text-gray-700 mb-6">
                  <div className="text-3xl font-bold mb-2">Welcome to LucaTaxGPT</div>
                  <div className="text-sm text-gray-500">Ask anything about taxes. I'll cite and explain using official sources.</div>
                </div>
                {/* Match floating entry panel styling */}
                <div className="bg-white border border-gray-200 rounded-2xl shadow-sm p-4 sm:p-5 animate-in fade-in duration-150">
                  <div className="relative flex items-start gap-3">
                    <textarea
                      value={inputMessage}
                      onChange={(e) => setInputMessage(e.target.value)}
                      onKeyPress={handleKeyPress}
                      placeholder="Type your message to begin..."
                      className="flex-1 w-full p-3 sm:p-3.5 border border-gray-200 bg-white rounded-xl resize-none focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent text-gray-900"
                      rows={3}
                    />
                    <div className="flex items-center gap-2">
                      <button
                        onClick={openExpandedText}
                        disabled={isLoading}
                        className="h-10 sm:h-11 shrink-0 px-3 bg-gray-100 text-gray-600 rounded-xl hover:bg-gray-200 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                        title="Expand text editor"
                      >
                        <Expand className="w-4 h-4" />
                      </button>
                      <button
                        onClick={handleFirstMessage}
                        disabled={!inputMessage.trim() || isLoading}
                        className="h-10 sm:h-11 shrink-0 px-4 sm:px-5 bg-black text-white rounded-xl hover:bg-gray-800 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                      >
                        {isLoading ? 'Sending...' : 'Send'}
                      </button>
                    </div>
                  </div>
                  <div className="mt-3 text-xs text-gray-400 text-center">Press Enter to send • Shift+Enter for a new line</div>
                </div>
              </div>
            </div>
          </div>
        )}
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

        {/* Expanded Text Editor Overlay - Modern translucent design */}
        {isExpandedTextOpen && (
          <div className="absolute inset-0 bg-white/80 backdrop-blur-md z-50 flex flex-col p-8">
            {/* Main content area with subtle border */}
            <div className="flex-1 flex flex-col bg-white/60 backdrop-blur-sm rounded-2xl border border-white/40 shadow-xl">
              {/* Large textarea - taking most space */}
              <div className="flex-1 p-8 min-h-0">
                <textarea
                  ref={expandTextareaRef}
                  value={expandedText}
                  onChange={(e) => setExpandedText(e.target.value)}
                  onKeyDown={handleExpandedTextKeyDown}
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
                    onClick={closeExpandedText}
                    className="p-2 rounded-lg text-gray-500 hover:text-gray-700 hover:bg-white/50 transition-all duration-200"
                    title="Collapse"
                  >
                    <Expand className="w-4 h-4 rotate-180" />
                  </button>

                  {/* Send button - sends message directly and shrinks */}
                  <button
                    onClick={async () => {
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
                profileTags={userProfile.tags}
                onDomainKnowledgeChange={updateDomainKnowledge}
                onProfileTagsChange={(tags) => {
                  setUserProfile(prev => ({ ...prev, tags }));
                }}
                triggerRef={expandedContextMenuRef}
              />
            </div>
          </div>
        )}
      </div>

      {/* Connection Status */}
      <div className="mt-2 text-xs text-gray-500">
        {isClient && (
          <>
            Last connection check: {new Date(connectionStatus.lastCheck).toLocaleTimeString()}
            {connectionStatus.healthy && (
              <span className="ml-2 text-green-600">✓ Connected</span>
            )}
            {!connectionStatus.healthy && (
              <span className="ml-2 text-red-600">✗ Connection Issues</span>
            )}
          </>
        )}
      </div>
    </div>
  );
} 