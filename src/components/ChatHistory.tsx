'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import ReactDOM from 'react-dom';
import { Chat } from '../types/Conversation';
import ChatHistoryModel from '../lib/ChatHistoryModel';
import { v4 as uuidv4 } from 'uuid';
import { MessageSquare, Plus, MoreVertical, ArrowLeft, LucideProps, PencilLine } from 'lucide-react';
import { format, isYesterday, isThisWeek, isToday, subDays, isAfter, parseISO } from 'date-fns';

interface ChatHistoryProps {
  chats: Chat[];
  setChats: React.Dispatch<React.SetStateAction<Chat[]>>;
  selectedChatId?: string | null;
  setSelectedChatId?: (id: string | null) => void;
  onChatSelect?: (chat: Chat) => void;
  onNewChat?: (chat: Chat) => void;
  onWidthChange?: (width: number) => void;
  width?: number;
  onModeSwitch?: () => void;
  reloadFlag?: number;
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
    federalTaxCode?: boolean;
    stateTaxCodes?: string[];
    profileTags?: string[];
  };
}

// Swirl SVG (OpenAI style, as a React component)
function SwirlIcon(props: LucideProps) {
  return (
    <svg viewBox="0 0 40 40" fill="none" {...props}>
      <g>
        <path fill="#10A37F" d="M20.5 3.5c-4.5 0-8.5 2.2-10.9 5.6l-5.7 9.8c-2.4 4.1-2.4 9.1 0 13.2l5.7 9.8c2.4 4.1 6.4 6.3 10.9 6.3s8.5-2.2 10.9-6.3l5.7-9.8c2.4-4.1 2.4-9.1 0-13.2l-5.7-9.8C29 5.7 25 3.5 20.5 3.5z"/>
        <path fill="#fff" d="M20.5 7.5c-3.7 0-7 1.8-8.9 4.7l-4.7 8.1c-1.9 3.3-1.9 7.3 0 10.6l4.7 8.1c1.9 3.3 5.2 5.1 8.9 5.1s7-1.8 8.9-5.1l4.7-8.1c1.9-3.3 1.9-7.3 0-10.6l-4.7-8.1C27.5 9.3 24.2 7.5 20.5 7.5z"/>
      </g>
    </svg>
  );
}

// Utility to group chats by date
function groupChatsByDate(chats: Chat[]) {
  const groups: { [key: string]: Chat[] } = { Today: [], Yesterday: [], 'Previous 7 Days': [], Older: [] };
  const now = new Date();
  chats.forEach(chat => {
    const date = chat.timestamp ? new Date(chat.timestamp) : new Date();
    if (isToday(date)) {
      groups['Today'].push(chat);
    } else if (isYesterday(date)) {
      groups['Yesterday'].push(chat);
    } else if (isAfter(date, subDays(now, 7))) {
      groups['Previous 7 Days'].push(chat);
    } else {
      groups['Older'].push(chat);
    }
  });
  return groups;
}

export default function ChatHistory({ 
  chats,
  setChats,
  selectedChatId,
  setSelectedChatId,
  onChatSelect, 
  onNewChat,
  onModeSwitch,
  reloadFlag,
  pendingNewChat = false,
  onStartNewChat
}: ChatHistoryProps & { pendingNewChat?: boolean, onStartNewChat?: () => void }) {
  const [isDragging, setIsDragging] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [showSearch, setShowSearch] = useState(false);
  const [filteredChats, setFilteredChats] = useState<Chat[]>([]);
  const [isClient, setIsClient] = useState(false);
  const [isLoadingChats, setIsLoadingChats] = useState(false);
  const [hasLoadedChats, setHasLoadedChats] = useState(false);
  const [storageWarning, setStorageWarning] = useState<string | null>(null);
  const dragStartX = useRef(0);
  const dragStartWidth = useRef(0);
  const [contextMenu, setContextMenu] = useState<{ show: boolean, x: number, y: number, chatId: string | null }>({ show: false, x: 0, y: 0, chatId: null });
  const [dropdownMenu, setDropdownMenu] = useState<{ show: boolean, chatId: string | null, anchor: { top: number, left: number } }>({ show: false, chatId: null, anchor: { top: 0, left: 0 } });
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  // Add state for renaming chat
  const [renamingChatId, setRenamingChatId] = useState<string | null>(null);
  const [renameInput, setRenameInput] = useState('');
  const [deletingChatId, setDeletingChatId] = useState<string | null>(null);

  // Safe localStorage utility functions
  // const safeSetItem = (key: string, value: any) => {
  //   try {
  //     localStorage.setItem(key, JSON.stringify(value));
  //   } catch (error) {
  //     console.error(`Error storing data for key ${key}:`, error);
  //   }
  // };

  // const safeGetItem = (key: string) => {
  //   try {
  //     const item = localStorage.getItem(key);
  //     return item ? JSON.parse(item) : null;
  //   } catch (error) {
  //     console.error(`Error retrieving data for key ${key}:`, error);
  //     localStorage.removeItem(key);
  //     return null;
  //   }
  // };

  const handleClearAll = () => {
    ChatHistoryModel.clearAll();
  };

  // Ensure client-side rendering to prevent hydration mismatch
  useEffect(() => {
    setIsClient(true);
  }, []);

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
        ChatHistoryModel.saveAll(updated);
        return updated;
      });
    }
    window.addEventListener('conversation-title-updated', handleTitleUpdate);
    return () => window.removeEventListener('conversation-title-updated', handleTitleUpdate);
  }, []);

  // Remove all localStorage and demo/mock data usage
  // Replace loadConversations with backend API call
  const loadChats = useCallback(async () => {
    setIsLoadingChats(true);
    try {
      const response = await fetch('http://localhost:5300/api/chat/chats');
      if (response.ok) {
        const data: BackendConversation[] = await response.json();
        // Map backend data to Conversation type
        const mapped = data.map(chat => {
          const messages = chat.messages || [];
          const filters = chat.contextFilters || {};
          return {
            id: chat.id,
            title: chat.title,
            lastMessage: messages.length > 0 ? messages[messages.length - 1].content : '',
            timestamp: typeof chat.timestamp === 'string' ? chat.timestamp : (chat.updatedAt || new Date().toISOString()),
            messageCount: messages.length,
            messages,
            contextFilters: {
              federalTaxCode: typeof filters.federalTaxCode === 'boolean' ? filters.federalTaxCode : true,
              stateTaxCodes: Array.isArray(filters.stateTaxCodes) ? filters.stateTaxCodes : [],
              profileTags: Array.isArray(filters.profileTags) ? filters.profileTags : [],
            },
            createdAt: chat.createdAt || new Date().toISOString(),
            updatedAt: chat.updatedAt || new Date().toISOString(),
          };
        });
        setChats(mapped);
      }
    } catch (error) {
      console.error('Error loading conversations:', error);
      setChats([]);
    } finally {
      setIsLoadingChats(false);
    }
  }, []);

  // Helper to check if the last chat is empty (no user or bot messages)
  function isLastChatEmpty() {
    if (chats.length === 0) return false;
    const lastChat = chats[0]; // assuming newest chat is at the top
    return (!lastChat.messages || lastChat.messages.length === 0);
  }

  // Replace createNewConversation with backend API call
  const createNewChat = async () => {
    // Prevent creating a new chat if the last chat is empty
    if (isLastChatEmpty()) {
      // Optionally, select the last empty chat
      setSelectedChatId?.(chats[0].id);
      onChatSelect?.(chats[0]);
      return;
    }
    try {
      const response = await fetch('http://localhost:5300/api/chat/chats', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: 'New Conversation',
          contextFilters: {
            federalTaxCode: true,
            stateTaxCodes: [],
            profileTags: [],
          },
          messages: [],
        }),
      });
      if (response.ok) {
        const newChat = await response.json();
        const chat = {
          id: newChat.id,
          title: newChat.title,
          lastMessage: '',
          timestamp: newChat.updatedAt || newChat.createdAt || new Date().toISOString(),
          messageCount: 0,
          messages: [],
          contextFilters: {
            federalTaxCode: typeof newChat.contextFilters?.federalTaxCode === 'boolean' ? newChat.contextFilters.federalTaxCode : true,
            stateTaxCodes: Array.isArray(newChat.contextFilters?.stateTaxCodes) ? newChat.contextFilters.stateTaxCodes : [],
            profileTags: Array.isArray(newChat.contextFilters?.profileTags) ? newChat.contextFilters.profileTags : [],
          },
          createdAt: newChat.createdAt || new Date().toISOString(),
          updatedAt: newChat.updatedAt || new Date().toISOString(),
        };
        setChats(prev => [chat, ...prev]);
        setSelectedChatId?.(chat.id);
        onChatSelect?.(chat);
        if (onNewChat) {
          // Always pass a fresh object
          onNewChat({ ...chat });
        }
      }
    } catch (error) {
      console.error('Error creating conversation:', error);
    }
  };

  // Replace deleteConversation with backend API call
  const deleteChat = async (chatId: string) => {
    try {
      const response = await fetch(`http://localhost:5300/api/chat/chats/${chatId}`, {
        method: 'DELETE',
      });
      if (response.ok) {
        setChats(prev => prev.filter(chat => chat.id !== chatId));
        if (selectedChatId === chatId) {
          setSelectedChatId?.(null);
        }
      }
    } catch (error) {
      console.error('Error deleting conversation:', error);
    }
  };

  // When a chat is selected, fetch its details from backend
  const handleChatSelect = async (chat: Chat) => {
    setSelectedChatId?.(chat.id);
    try {
      const response = await fetch(`http://localhost:5300/api/chat/chats/${chat.id}`);
      if (response.ok) {
        let chat: BackendConversation = await response.json();
        const messages = chat.messages || [];
        // Map backend response to local Conversation type
        const typedChat: Chat = {
          id: chat.id,
          title: chat.title,
          lastMessage: messages.length > 0 ? messages[messages.length - 1].content : '',
          timestamp: typeof chat.timestamp === 'string' ? chat.timestamp : (chat.updatedAt || new Date().toISOString()),
          messageCount: messages.length,
          messages,
          contextFilters: {
            federalTaxCode: typeof chat.contextFilters?.federalTaxCode === 'boolean' ? chat.contextFilters.federalTaxCode : true,
            stateTaxCodes: Array.isArray(chat.contextFilters?.stateTaxCodes) ? chat.contextFilters.stateTaxCodes : [],
            profileTags: Array.isArray(chat.contextFilters?.profileTags) ? chat.contextFilters.profileTags : [],
          },
          createdAt: chat.createdAt || new Date().toISOString(),
          updatedAt: chat.updatedAt || new Date().toISOString(),
        };
        onChatSelect?.(typedChat);
      }
    } catch (error) {
      console.error('Error loading conversation details:', error);
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
      setShowSearch(true);
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

  // Add useEffect to load conversations on mount
  useEffect(() => {
    loadChats();
  }, [selectedChatId, reloadFlag]);

  useEffect(() => {
    if (searchQuery.trim()) {
      setFilteredChats(
        chats.filter(chat =>
          chat.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
          chat.lastMessage.toLowerCase().includes(searchQuery.toLowerCase())
        )
      );
    } else {
      setFilteredChats(chats);
    }
  }, [searchQuery, chats]);

  function handleContextMenu(e: React.MouseEvent, chatId: string) {
    e.preventDefault();
    setContextMenu({ show: true, x: e.clientX, y: e.clientY, chatId });
  }

  // Rename function and button to 'Copy context to new chat'
  function handleCopyContextToNewChat() {
    if (typeof window !== 'undefined' && contextMenu.chatId) {
      const chat = chats.find(c => c.id === contextMenu.chatId);
      if (chat) {
        // Deep copy context filters (no shared references)
        const copiedContextFilters = JSON.parse(JSON.stringify({
          federalTaxCode: typeof chat.contextFilters?.federalTaxCode === 'boolean' ? chat.contextFilters.federalTaxCode : true,
          stateTaxCodes: Array.isArray(chat.contextFilters?.stateTaxCodes) ? chat.contextFilters.stateTaxCodes : [],
          profileTags: Array.isArray(chat.contextFilters?.profileTags) ? chat.contextFilters.profileTags : [],
        }));
        fetch('http://localhost:5300/api/chat/chats', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            title: 'New Conversation',
            contextFilters: copiedContextFilters,
            messages: [],
          }),
        })
          .then(res => res.json())
          .then(newChat => {
            const chat = {
              id: newChat.id,
              title: newChat.title,
              lastMessage: '',
              timestamp: newChat.updatedAt || newChat.createdAt || new Date().toISOString(),
              messageCount: 0,
              messages: [],
              contextFilters: {
                federalTaxCode: typeof newChat.contextFilters?.federalTaxCode === 'boolean' ? newChat.contextFilters.federalTaxCode : true,
                stateTaxCodes: Array.isArray(newChat.contextFilters?.stateTaxCodes) ? newChat.contextFilters.stateTaxCodes : [],
                profileTags: Array.isArray(newChat.contextFilters?.profileTags) ? newChat.contextFilters.profileTags : [],
              },
              createdAt: newChat.createdAt || new Date().toISOString(),
              updatedAt: newChat.updatedAt || new Date().toISOString(),
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

  function handleDeleteFromMenu() {
    if (contextMenu.chatId) {
      deleteChat(contextMenu.chatId);
    }
    setContextMenu({ ...contextMenu, show: false });
  }

  // Function to handle rename save
  const handleRenameSave = async (chatId: string) => {
    const newTitle = renameInput.trim();
    if (!newTitle) return;
    try {
      const response = await fetch(`http://localhost:5300/api/chat/chats/${chatId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: newTitle }),
      });
      if (response.ok) {
        setChats(prev => prev.map(chat => chat.id === chatId ? { ...chat, title: newTitle } : chat));
        setRenamingChatId(null);
        setRenameInput('');
      }
    } catch (error) {
      console.error('Error renaming chat:', error);
    }
  };

  // Fix delete handler to always use correct chat id and show loading
  const handleDeleteChat = async (chatId: string) => {
    setDeletingChatId(chatId);
    try {
      const response = await fetch(`http://localhost:5300/api/chat/chats/${chatId}`, {
        method: 'DELETE',
      });
      if (response.ok) {
        setChats(prev => prev.filter(chat => chat.id !== chatId));
        if (selectedChatId === chatId) {
          setSelectedChatId?.(null);
        }
      }
    } catch (error) {
      console.error('Error deleting conversation:', error);
    } finally {
      setDeletingChatId(null);
    }
  };

  useEffect(() => {
    function handleClick() {
      if (dropdownMenu.show) setDropdownMenu({ show: false, chatId: null, anchor: { top: 0, left: 0 } });
      if (contextMenu.show) setContextMenu({ ...contextMenu, show: false });
    }
    window.addEventListener('click', handleClick);
    return () => window.removeEventListener('click', handleClick);
  }, [dropdownMenu, contextMenu]);

  // Add a useEffect to collapse sidebar if window.innerWidth < 600
  useEffect(() => {
    function handleResize() {
      if (typeof window !== 'undefined' && window.innerWidth < 800) {
        setSidebarOpen(false);
      }
    }
    window.addEventListener('resize', handleResize);
    // Collapse on mount if already too small
    if (typeof window !== 'undefined' && window.innerWidth < 800) {
      setSidebarOpen(false);
    }
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Collapsed sidebar rendering
  if (!sidebarOpen) {
    return (
      <div className="flex h-full">
        <div className="flex flex-col items-center bg-white border-r border-gray-200 w-14 min-w-[56px] max-w-[56px] z-[99999]">
          <button
            className="mt-4 mb-2 p-2 rounded hover:bg-gray-100"
            onClick={() => setSidebarOpen(true)}
            aria-label="Expand sidebar"
            title="Expand sidebar"
          >
            <ArrowLeft className="w-5 h-5" style={{ transform: 'rotate(180deg)' }} />
          </button>
          <button
            className="my-2 p-2 rounded hover:bg-gray-100"
            onClick={() => setShowSearch(true)}
            aria-label="Search chats"
            title="Search chats"
          >
            <MessageSquare className="w-5 h-5 text-gray-500" />
          </button>
          <button
            className="my-2 p-2 rounded hover:bg-gray-100"
            onClick={e => { e.preventDefault(); onStartNewChat?.(); }}
            aria-label="New chat"
            title="New chat"
          >
            <PencilLine className="w-5 h-5 text-gray-500" />
          </button>
        </div>
        <div className="flex-1 h-full relative">{/* Chat panel will be here, not overlapped */}</div>
        {/* Search Popup (always render, even if sidebar is collapsed) */}
        {showSearch && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50" onClick={() => setShowSearch(false)}>
            <div className="flex flex-col max-h-[480px] min-h-[480px] w-[638px] bg-white rounded-xl shadow-xl" onClick={e => e.stopPropagation()}>
              {/* Input row */}
              <div className="ms-6 me-4 flex max-h-[64px] min-h-[64px] items-center justify-between">
                <input
                  className="placeholder:text-gray-400 w-full border-none bg-transparent focus:border-transparent focus:ring-0 focus:outline-none text-base text-black"
                  placeholder="Search chats..."
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  autoFocus
                />
                <button
                  className="hover:bg-gray-200 focus-visible:ring-2 focus-visible:ring-gray-300 flex items-center justify-center rounded-full bg-transparent p-1 ms-4"
                  aria-label="Close"
                  onClick={() => setShowSearch(false)}
                >
                  <svg width="20" height="20" viewBox="0 0 20 20" fill="currentColor" className="text-gray-500 hover:text-black">
                    <path d="M14.2548 4.75488C14.5282 4.48152 14.9717 4.48152 15.2451 4.75488C15.5184 5.02825 15.5184 5.47175 15.2451 5.74512L10.9902 10L15.2451 14.2549L15.3349 14.3652C15.514 14.6369 15.4841 15.006 15.2451 15.2451C15.006 15.4842 14.6368 15.5141 14.3652 15.335L14.2548 15.2451L9.99995 10.9902L5.74506 15.2451C5.4717 15.5185 5.0282 15.5185 4.75483 15.2451C4.48146 14.9718 4.48146 14.5282 4.75483 14.2549L9.00971 10L4.75483 5.74512L4.66499 5.63477C4.48589 5.3631 4.51575 4.99396 4.75483 4.75488C4.99391 4.51581 5.36305 4.48594 5.63471 4.66504L5.74506 4.75488L9.99995 9.00977L14.2548 4.75488Z"></path>
                  </svg>
                </button>
              </div>
              <hr className="border-gray-300" />
              {/* Chat results */}
              <div className="my-2 grow overflow-y-auto">
                <ol className="mx-2">
                  {/* Add new chat as first item */}
                  <li>
                    <div
                      className="cursor-pointer group relative flex items-center rounded-xl px-4 py-3 hover:bg-gray-100 focus:bg-gray-100"
                      tabIndex={0}
                      onClick={() => { onStartNewChat?.(); setShowSearch(false); }}
                      onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { onStartNewChat?.(); setShowSearch(false); } }}
                    >
                      <PencilLine className="w-5 h-5 text-gray-500" />
                      <div className="relative grow overflow-hidden whitespace-nowrap ps-2">
                        <div className="text-sm font-medium text-black">New chat</div>
                      </div>
                    </div>
                  </li>
                  {/* Grouped chat results */}
                  {(() => {
                    const groups = groupChatsByDate(filteredChats);
                    const order = ['Today', 'Yesterday', 'Previous 7 Days', 'Older'];
                    return order.flatMap(group => (
                      groups[group].length > 0 ? [
                        <li key={group + '-header'}>
                          <div className="group text-gray-400 relative my-2 px-4 pt-2 text-xs leading-4">{group}</div>
                        </li>,
                        ...groups[group].map(chat => (
                          <li key={chat.id}>
                            <div
                              className="cursor-pointer group relative flex items-center rounded-xl px-4 py-3 hover:bg-gray-100 focus:bg-gray-100"
                              tabIndex={0}
                              onClick={() => { handleChatSelect(chat); setShowSearch(false); setSearchQuery(''); }}
                              onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { handleChatSelect(chat); setShowSearch(false); setSearchQuery(''); } }}
                            >
                              <MessageSquare className="w-5 h-5 text-gray-700" />
                              <div className="relative grow overflow-hidden whitespace-nowrap ps-2">
                                <div className="text-sm truncate">{chat.title}</div>
                                {chat.lastMessage && (
                                  <div className="text-xs text-gray-500 truncate">{chat.lastMessage}</div>
                                )}
                              </div>
                            </div>
                          </li>
                        ))
                      ] : []
                    ));
                  })()}
                  {filteredChats.length === 0 && (
                    <li><div className="p-4 text-center text-gray-400 text-sm">No chats found</div></li>
                  )}
                </ol>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  // Expanded sidebar rendering
  return (
    <>
      <aside
        className={`relative z-[99999] flex flex-col h-full bg-white border-r border-gray-200 min-w-[245px] max-w-[245px] w-[245px]${sidebarCollapsed ? ' hidden' : ''}`}
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
              onClick={() => setSidebarOpen(false)}
              aria-label="Collapse sidebar"
              title="Collapse sidebar"
            >
              <ArrowLeft className="w-5 h-5 text-gray-700" />
            </button>
          </div>
        </div>
        {/* Vertical Menu: Search and New Chat */}
        <div className="flex flex-col gap-1 px-2 pt-3 pb-2 border-b border-gray-100 bg-white">
          {/* Search Chats */}
          <div
            tabIndex={0}
            role="button"
            className="group flex items-center justify-between gap-2 rounded-lg px-2 py-2 hover:bg-gray-100 focus:bg-gray-100 cursor-pointer __menu-item"
            onClick={() => setShowSearch(true)}
            onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') setShowSearch(true); }}
            aria-label="Search chats"
          >
            <div className="flex min-w-0 items-center gap-1.5">
              <div className="flex items-center justify-center icon">
                <MessageSquare className="w-5 h-5 text-gray-700" />
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
        <div className="flex-1 flex flex-col overflow-y-auto overflow-x-hidden px-2 py-2 bg-white">
          <div className="sticky top-0 z-10 bg-white pt-2 pb-3">
            <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wider px-2">Chats</h2>
          </div>
          <nav className="flex-1">
            {isLoadingChats ? (
              <div className="p-4 text-center text-gray-500">Loading chats...</div>
            ) : chats.length === 0 ? (
              <div className="p-4 text-center text-gray-400 text-sm">No chats found</div>
            ) : (
              <ul className="space-y-1">
                {chats.map((chat) => (
                  <li
                    key={chat.id}
                    className={`group flex items-center gap-2 px-2 py-2 rounded-lg cursor-pointer transition-colors ${selectedChatId === chat.id ? 'bg-gray-200 border-l-4 border-gray-700' : 'hover:bg-gray-100'}`}
                    onClick={() => handleChatSelect(chat)}
                    onContextMenu={(e) => handleContextMenu(e, chat.id)}
                  >
                    <MessageSquare className="w-5 h-5 text-gray-700 shrink-0" />
                    <div className="flex-1 min-w-0">
                      {/* Inline rename input or title */}
                      {renamingChatId === chat.id ? (
                        <input
                          className="truncate font-normal text-xs text-gray-900 bg-gray-50 border border-gray-300 rounded px-2 py-1 w-full focus:outline-none focus:ring-2 focus:ring-gray-300"
                          value={renameInput}
                          autoFocus
                          onChange={e => setRenameInput(e.target.value)}
                          onBlur={() => handleRenameSave(chat.id)}
                          onKeyDown={e => {
                            if (e.key === 'Enter') handleRenameSave(chat.id);
                            if (e.key === 'Escape') { setRenamingChatId(null); setRenameInput(''); }
                          }}
                          maxLength={60}
                        />
                      ) : (
                        <div className="truncate font-normal text-xs text-gray-900">{chat.title}</div>
                      )}
                      {chat.lastMessage && (
                        <div className="truncate text-xs text-gray-500">{chat.lastMessage}</div>
                      )}
                    </div>
                    <div className="relative">
                      <button
                        className="p-1 rounded-full hover:bg-gray-200 transition-opacity"
                        ref={el => {
                          if (el && dropdownMenu.show && dropdownMenu.chatId === chat.id) {
                            const rect = el.getBoundingClientRect();
                            if (dropdownMenu.anchor.top !== rect.bottom || dropdownMenu.anchor.left !== rect.right) {
                              setDropdownMenu(dm => ({ ...dm, anchor: { top: rect.bottom, left: rect.right } }));
                            }
                          }
                        }}
                        onClick={e => {
                          e.stopPropagation();
                          const rect = (e.target as HTMLElement).getBoundingClientRect();
                          setDropdownMenu({ show: true, chatId: chat.id, anchor: { top: rect.bottom, left: rect.right } });
                          setContextMenu({ show: false, x: 0, y: 0, chatId: null }); // Hide global context menu
                        }}
                        title="Chat options"
                      >
                        <MoreVertical className="w-4 h-4 text-gray-400" />
                      </button>
                      {/* Dropdown menu for chat options */}
                      {dropdownMenu.show && dropdownMenu.chatId === chat.id && typeof window !== 'undefined' && ReactDOM.createPortal(
                        <div
                          className="fixed z-[200000] bg-white rounded shadow-lg w-32 py-1 flex flex-col justify-center items-center"
                          style={{ top: dropdownMenu.anchor.top, left: dropdownMenu.anchor.left, minWidth: '7.5rem', boxShadow: '0 4px 16px 0 rgba(0,0,0,0.10)' }}
                        >
                          <button
                            onClick={() => {
                              setRenamingChatId(chat.id);
                              setRenameInput(chat.title);
                              setDropdownMenu({ show: false, chatId: null, anchor: { top: 0, left: 0 } });
                            }}
                            className="block w-11/12 mx-auto mb-1 px-2 py-1 text-center text-[13px] font-medium text-gray-800 hover:bg-gray-100 focus:bg-gray-100 transition rounded"
                            style={{ minHeight: '32px' }}
                          >
                            Rename
                          </button>
                          <button
                            onClick={() => { handleDeleteChat(chat.id); setDropdownMenu({ show: false, chatId: null, anchor: { top: 0, left: 0 } }); }}
                            className="block w-11/12 mx-auto px-2 py-1 text-center text-[13px] font-medium text-red-600 hover:bg-gray-100 focus:bg-gray-100 transition rounded disabled:opacity-60"
                            style={{ minHeight: '32px' }}
                            disabled={deletingChatId === chat.id}
                          >
                            {deletingChatId === chat.id ? 'Deleting...' : 'Delete'}
                          </button>
                        </div>,
                        window.document.body
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </nav>
        </div>

        {/* Footer */}
        <div className="border-t border-gray-200 px-4 py-3 text-xs text-gray-400 text-center bg-white">
          LucaTaxGPT v1.0
        </div>

        {/* Context Menu */}
        {contextMenu.show && (
          <div style={{ position: 'fixed', top: contextMenu.y, left: contextMenu.x, zIndex: 50 }} className="bg-white border rounded shadow-lg">
            <button onClick={handleCopyContextToNewChat} className="block w-full px-4 py-2 text-left hover:bg-gray-100">Copy context to new chat</button>
            <button onClick={handleDeleteFromMenu} className="block w-full px-4 py-2 text-left hover:bg-gray-100 text-red-600">Delete</button>
          </div>
        )}
      </aside>
      {/* Overlay when sidebar is open on small screens */}
      {typeof window !== 'undefined' && window.innerWidth < 800 && sidebarOpen && (
        <div
          className="fixed inset-0 bg-black bg-opacity-40 z-[99998] pointer-events-auto"
          onClick={() => setSidebarOpen(false)}
        />
      )}
      {/* Search Popup (always render, even if sidebar is expanded) */}
      {showSearch && (
        <div
          className={`fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center`}
          onClick={() => setShowSearch(false)}
        >
          <div
            className={`flex flex-col max-h-[480px] min-h-[480px] w-[638px] bg-white rounded-xl shadow-xl`}
            style={sidebarOpen && !sidebarCollapsed ? { marginLeft: 245 } : {}} // Offset if sidebar is open
            onClick={e => e.stopPropagation()}
          >
            {/* Input row */}
            <div className="ms-6 me-4 flex max-h-[64px] min-h-[64px] items-center justify-between">
              <input
                className="placeholder:text-gray-400 w-full border-none bg-transparent focus:border-transparent focus:ring-0 focus:outline-none text-base text-black"
                placeholder="Search chats..."
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                autoFocus
              />
              <button
                className="hover:bg-gray-200 focus-visible:ring-2 focus-visible:ring-gray-300 flex items-center justify-center rounded-full bg-transparent p-1 ms-4"
                aria-label="Close"
                onClick={() => setShowSearch(false)}
              >
                <svg width="20" height="20" viewBox="0 0 20 20" fill="currentColor" className="text-gray-500 hover:text-black">
                  <path d="M14.2548 4.75488C14.5282 4.48152 14.9717 4.48152 15.2451 4.75488C15.5184 5.02825 15.5184 5.47175 15.2451 5.74512L10.9902 10L15.2451 14.2549L15.3349 14.3652C15.514 14.6369 15.4841 15.006 15.2451 15.2451C15.006 15.4842 14.6368 15.5141 14.3652 15.335L14.2548 15.2451L9.99995 10.9902L5.74506 15.2451C5.4717 15.5185 5.0282 15.5185 4.75483 15.2451C4.48146 14.9718 4.48146 14.5282 4.75483 14.2549L9.00971 10L4.75483 5.74512L4.66499 5.63477C4.48589 5.3631 4.51575 4.99396 4.75483 4.75488C4.99391 4.51581 5.36305 4.48594 5.63471 4.66504L5.74506 4.75488L9.99995 9.00977L14.2548 4.75488Z"></path>
                </svg>
              </button>
            </div>
            <hr className="border-gray-300" />
            {/* Chat results */}
            <div className="my-2 grow overflow-y-auto">
              <ol className="mx-2">
                {/* Add new chat as first item */}
                <li>
                  <div
                    className="cursor-pointer group relative flex items-center rounded-xl px-4 py-3 hover:bg-gray-100 focus:bg-gray-100"
                    tabIndex={0}
                    onClick={() => { createNewChat(); setShowSearch(false); }}
                    onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { createNewChat(); setShowSearch(false); } }}
                  >
                    <PencilLine className="w-5 h-5 text-gray-500" />
                    <div className="relative grow overflow-hidden whitespace-nowrap ps-2">
                      <div className="text-sm font-medium text-black">New chat</div>
                    </div>
                  </div>
                </li>
                {/* Grouped chat results */}
                {(() => {
                  const groups = groupChatsByDate(filteredChats);
                  const order = ['Today', 'Yesterday', 'Previous 7 Days', 'Older'];
                  return order.flatMap(group => (
                    groups[group].length > 0 ? [
                      <li key={group + '-header'}>
                        <div className="group text-gray-400 relative my-2 px-4 pt-2 text-xs leading-4">{group}</div>
                      </li>,
                      ...groups[group].map(chat => (
                        <li key={chat.id}>
                          <div
                            className="cursor-pointer group relative flex items-center rounded-xl px-4 py-3 hover:bg-gray-100 focus:bg-gray-100"
                            tabIndex={0}
                            onClick={() => { onStartNewChat?.(); setShowSearch(false); }}
                            onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { onStartNewChat?.(); setShowSearch(false); } }}
                          >
                            <MessageSquare className="w-5 h-5 text-gray-700" />
                            <div className="relative grow overflow-hidden whitespace-nowrap ps-2">
                              <div className="text-sm truncate text-black">{chat.title}</div>
                              {chat.lastMessage && (
                                <div className="text-xs text-gray-500 truncate">{chat.lastMessage}</div>
                              )}
                            </div>
                          </div>
                        </li>
                      ))
                    ] : []
                  ));
                })()}
                {filteredChats.length === 0 && (
                  <li><div className="p-4 text-center text-gray-400 text-sm">No chats found</div></li>
                )}
              </ol>
            </div>
          </div>
        </div>
      )}
    </>
  );
} 