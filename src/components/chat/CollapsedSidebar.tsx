'use client';

import React from 'react';
import { ArrowLeft, Search, PencilLine, Settings } from 'lucide-react';
import ChatSearchPopup from './ChatSearchPopup';
import type { ChatListItem } from '@/types/chat';

interface CollapsedSidebarProps {
  chats: ChatListItem[];
  searchQuery: string;
  filteredChats: ChatListItem[];
  deletingChatId: string | null;
  showSearch: boolean;
  onSidebarToggle: (open: boolean) => void;
  onOpenSearch: () => void;
  onStartNewChat: () => void;
  onOpenSettings: () => void;
  onSearchChange: (query: string) => void;
  onCloseSearch: () => void;
  onChatSelect: (chat: ChatListItem) => void;
}

export default function CollapsedSidebar({
  chats,
  searchQuery,
  filteredChats,
  deletingChatId,
  showSearch,
  onSidebarToggle,
  onOpenSearch,
  onStartNewChat,
  onOpenSettings,
  onSearchChange,
  onCloseSearch,
  onChatSelect
}: CollapsedSidebarProps) {
  return (
    <div className="flex h-full">
      <div className="flex flex-col items-center bg-white border-r border-gray-200 w-14 min-w-[56px] max-w-[56px] z-[99999]">
        <button
          className="mt-4 mb-2 p-2 rounded hover:bg-gray-100"
          onClick={() => onSidebarToggle(true)}
          aria-label="Expand sidebar"
          title="Expand sidebar"
        >
          <ArrowLeft className="w-5 h-5" style={{ transform: 'rotate(180deg)' }} />
        </button>
        <button
          className="my-2 p-2 rounded hover:bg-gray-100"
          onClick={onOpenSearch}
          aria-label="Search chats"
          title="Search chats"
        >
          <Search className="w-5 h-5 text-gray-500" />
        </button>
        <button
          className="my-2 p-2 rounded hover:bg-gray-100"
          onClick={e => { e.preventDefault(); onStartNewChat(); }}
          aria-label="New chat"
          title="New chat"
        >
          <PencilLine className="w-5 h-5 text-gray-500" />
        </button>
        
        {/* Spacer to push settings to bottom */}
        <div className="flex-1"></div>
        
        {/* Settings Button at bottom */}
        <button
          className="mb-4 p-2 rounded hover:bg-gray-100"
          onClick={onOpenSettings}
          aria-label="Model settings"
          title="Model settings"
        >
          <Settings className="w-5 h-5 text-gray-500" />
        </button>
      </div>
      <div className="flex-1 h-full relative">{/* Chat panel will be here, not overlapped */}</div>
      
      {/* Search Popup (always render, even if sidebar is collapsed) */}
      <ChatSearchPopup
        isOpen={showSearch}
        searchQuery={searchQuery}
        filteredChats={filteredChats}
        deletingChatId={deletingChatId}
        onClose={onCloseSearch}
        onSearchChange={onSearchChange}
        onStartNewChat={onStartNewChat}
        onChatSelect={onChatSelect}
      />
    </div>
  );
}
