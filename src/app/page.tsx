'use client';

import React, { useState, useEffect, useRef } from 'react';
import ChatbotPanel from '@/components/ChatbotPanel';
import ProfilePanel from '@/components/ProfilePanel';
import AdminPanel from '@/components/AdminPanel';
import ChatHistory from '@/components/ChatHistory';
import { Chat } from '../types/Conversation';

export default function Home() {
  const [mode, setMode] = useState<'user' | 'admin'>('user');
  const [activeTab, setActiveTab] = useState<'chat' | 'profile' | 'admin'>('chat');
  const [showProfileDropdown, setShowProfileDropdown] = useState(false);
  const [sidebarWidth, setSidebarWidth] = useState(320);
  const [chats, setChats] = useState<Chat[]>([]);
  const [currentChat, setCurrentChat] = useState<Chat | null>(null);
  const [selectedChatId, setSelectedChatId] = useState<string | null>(null);
  const [userProfile, setUserProfile] = useState<any>(null);
  const [showStateDropdown, setShowStateDropdown] = useState(false);
  const stateDropdownRef = useRef<HTMLDivElement>(null);
  const [reloadFlag, setReloadFlag] = useState(0);
  const [pendingNewChat, setPendingNewChat] = useState(false);

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

  const US_STATES = [
    'Alabama', 'Alaska', 'Arizona', 'Arkansas', 'California', 'Colorado', 'Connecticut',
    'Delaware', 'Florida', 'Georgia', 'Hawaii', 'Idaho', 'Illinois', 'Indiana', 'Iowa',
    'Kansas', 'Kentucky', 'Louisiana', 'Maine', 'Maryland', 'Massachusetts', 'Michigan',
    'Minnesota', 'Mississippi', 'Missouri', 'Montana', 'Nebraska', 'Nevada', 'New Hampshire',
    'New Jersey', 'New Mexico', 'New York', 'North Carolina', 'North Dakota', 'Ohio',
    'Oklahoma', 'Oregon', 'Pennsylvania', 'Rhode Island', 'South Carolina', 'South Dakota',
    'Tennessee', 'Texas', 'Utah', 'Vermont', 'Virginia', 'Washington', 'West Virginia',
    'Wisconsin', 'Wyoming'
  ];

  // State abbreviation mapping
  const STATE_ABBREVIATIONS: { [key: string]: string } = {
    'Alabama': 'AL', 'Alaska': 'AK', 'Arizona': 'AZ', 'Arkansas': 'AR', 'California': 'CA',
    'Colorado': 'CO', 'Connecticut': 'CT', 'Delaware': 'DE', 'Florida': 'FL', 'Georgia': 'GA',
    'Hawaii': 'HI', 'Idaho': 'ID', 'Illinois': 'IL', 'Indiana': 'IN', 'Iowa': 'IA',
    'Kansas': 'KS', 'Kentucky': 'KY', 'Louisiana': 'LA', 'Maine': 'ME', 'Maryland': 'MD',
    'Massachusetts': 'MA', 'Michigan': 'MI', 'Minnesota': 'MN', 'Mississippi': 'MS',
    'Missouri': 'MO', 'Montana': 'MT', 'Nebraska': 'NE', 'Nevada': 'NV', 'New Hampshire': 'NH',
    'New Jersey': 'NJ', 'New Mexico': 'NM', 'New York': 'NY', 'North Carolina': 'NC',
    'North Dakota': 'ND', 'Ohio': 'OH', 'Oklahoma': 'OK', 'Oregon': 'OR', 'Pennsylvania': 'PA',
    'Rhode Island': 'RI', 'South Carolina': 'SC', 'South Dakota': 'SD', 'Tennessee': 'TN',
    'Texas': 'TX', 'Utah': 'UT', 'Vermont': 'VT', 'Virginia': 'VA', 'Washington': 'WA',
    'West Virginia': 'WV', 'Wisconsin': 'WI', 'Wyoming': 'WY'
  };

  useEffect(() => {
    // Load user profile from localStorage
    // const cachedProfile = safeGetItem('userProfile');
    // if (cachedProfile && typeof cachedProfile === 'object') {
    //   setUserProfile(cachedProfile);
    // }
  }, []);

  // On initial load, show intro if no chats
  useEffect(() => {
    if (chats.length === 0 && !pendingNewChat) {
      setCurrentChat(null);
      setSelectedChatId(null);
      setPendingNewChat(true);
    }
  }, [chats]);

  // Remove auto-selecting latest chat
  // useEffect(() => {
  //   if (chats.length > 0 && !currentChat) {
  //     const latest = chats.reduce((a, b) => (new Date(a.updatedAt || a.createdAt) > new Date(b.updatedAt || b.createdAt) ? a : b));
  //     setCurrentChat(latest);
  //     setSelectedChatId(latest.id);
  //   }
  // }, [chats, currentChat]);

  // Handler for starting a new chat (show intro, don't create chat yet)
  const handleStartNewChat = () => {
    setCurrentChat(null);
    setSelectedChatId(null);
    setPendingNewChat(true);
  };

  // Handler for actually creating a chat when user sends first message
  const handleCreateChatWithMessage = async (message: string) => {
    // Create chat in backend with first user message
    const response = await fetch('http://localhost:5300/api/chat/chats', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title: 'New Conversation',
        contextFilters: { federalTaxCode: true, stateTaxCodes: [], profileTags: [] },
        messages: [{
          id: Date.now().toString(),
          role: 'user',
          content: message,
          timestamp: new Date().toISOString(),
        }],
      }),
    });
    if (response.ok) {
      const newChat = await response.json();
      const userMsg = {
        id: Date.now().toString(),
        role: 'user',
        content: message,
        timestamp: new Date().toISOString(),
      };
      // Immediately send the message to get a bot response
      const botResponse = await fetch(`/api/chat/user/messaging/${newChat.id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: message,
          context: '',
          domainKnowledge: { federalTaxCode: true, stateTaxCodes: [], profileTags: [] },
        }),
      });
      let botMsg = null;
      if (botResponse.ok) {
        const data = await botResponse.json();
        botMsg = {
          id: (Date.now() + 1).toString(),
          role: 'assistant',
          content: data.response,
          timestamp: new Date().toISOString(),
          relevantDocs: data.relevantDocs,
        };
        // Update chat in backend with bot message
        await fetch(`/api/chat/chats/${newChat.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ messages: [userMsg, botMsg] }),
        });
      }
      const chat = {
        id: newChat.id,
        title: newChat.title,
        lastMessage: botMsg ? botMsg.content : message,
        timestamp: newChat.updatedAt || newChat.createdAt || new Date().toISOString(),
        messageCount: botMsg ? 2 : 1,
        messages: botMsg ? [userMsg, botMsg] : [userMsg],
        contextFilters: {
          federalTaxCode: typeof newChat.contextFilters?.federalTaxCode === 'boolean' ? newChat.contextFilters.federalTaxCode : true,
          stateTaxCodes: Array.isArray(newChat.contextFilters?.stateTaxCodes) ? newChat.contextFilters.stateTaxCodes : [],
          profileTags: Array.isArray(newChat.contextFilters?.profileTags) ? newChat.contextFilters.profileTags : [],
        },
        createdAt: newChat.createdAt || new Date().toISOString(),
        updatedAt: newChat.updatedAt || new Date().toISOString(),
      };
      setChats(prev => [chat, ...prev]);
      setCurrentChat(chat);
      setSelectedChatId(chat.id);
      setPendingNewChat(false);
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
    // setDomainKnowledge(prev => ({
    //   ...prev,
    //   stateTaxCodes: prev.stateTaxCodes.includes(state)
    //     ? prev.stateTaxCodes.filter(s => s !== state)
    //     : [...prev.stateTaxCodes, state]
    // }));
  };

  const formatSelectedStates = (states: string[]) => {
    // This function is no longer needed as domainKnowledge is removed
    // if (states.length === 0) return 'None selected';
    // if (states.length === 1) return STATE_ABBREVIATIONS[states[0]] || states[0];
    // if (states.length === 2) return states.map(s => STATE_ABBREVIATIONS[s] || s).join(', ');
    // if (states.length === 3) return states.map(s => STATE_ABBREVIATIONS[s] || s).join(', ');
    // return `${states.slice(0, 3).map(s => STATE_ABBREVIATIONS[s] || s).join(', ')}...`;
    return 'N/A'; // Placeholder as domainKnowledge is removed
  };

  const handleChatSelect = (chat: Chat) => {
    setCurrentChat(chat);
    setSelectedChatId(chat.id);
  };

  // Function to update a chat's title in the shared state
  const updateChatTitle = (chatId: string, newTitle: string) => {
    setChats(prev => prev.map(conv => conv.id === chatId ? { ...conv, title: newTitle } : conv));
    if (currentChat && currentChat.id === chatId) {
      setCurrentChat({ ...currentChat, title: newTitle });
    }
  };

  // Add handler to update chat context in state
  const handleChatContextUpdate = (updated: Chat & { contextFilters?: any }) => {
    setChats(prev => prev.map(conv => conv.id === updated.id ? { ...conv, ...updated, ...(updated.contextFilters || {}) } : conv));
    if (currentChat && currentChat.id === updated.id) {
      setCurrentChat({ ...currentChat, ...updated, ...(updated.contextFilters || {}) });
    }
  };

  // This callback will be passed to ChatHistory and ChatbotPanel
  const handleChatContextUpdateReload = () => setReloadFlag(f => f + 1);

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

  return (
    <div className="flex h-screen bg-gray-50">
      {/* User Mode */}
      
      {/* Left Sidebar - Conversation History */}
      <div className="relative">
        <ChatHistory 
          chats={chats}
          setChats={setChats}
          selectedChatId={selectedChatId}
          setSelectedChatId={setSelectedChatId}
          onChatSelect={(chat) => {
            setCurrentChat({ ...chat });
            setSelectedChatId(chat.id);
            setPendingNewChat(false);
          }}
          onNewChat={undefined}
          onStartNewChat={handleStartNewChat}
          onWidthChange={setSidebarWidth}
          width={sidebarWidth}
          onModeSwitch={() => setMode('admin')}
          reloadFlag={reloadFlag}
          pendingNewChat={pendingNewChat}
        />
      </div>

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col">
        {/* Chat Area */}
        <div className="flex-1 overflow-hidden">
          <ChatbotPanel 
            currentChat={currentChat}
            userProfile={userProfile}
            updateChatTitle={updateChatTitle}
            onChatContextUpdate={handleChatContextUpdateReload}
            pendingNewChat={pendingNewChat}
            onCreateChatWithMessage={handleCreateChatWithMessage}
          />
        </div>
      </div>
    </div>
  );
} 