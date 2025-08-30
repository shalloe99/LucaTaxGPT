'use client';

import React from 'react';
import { PencilLine } from 'lucide-react';
import type { ChatListItem } from '@/types/chat';
import { isYesterday, isToday, subDays, isAfter } from 'date-fns';

interface ChatSearchPopupProps {
  isOpen: boolean;
  searchQuery: string;
  filteredChats: ChatListItem[];
  deletingChatId: string | null;
  onClose: () => void;
  onSearchChange: (query: string) => void;
  onStartNewChat: () => void;
  onChatSelect: (chat: ChatListItem) => void;
}

// Utility to group chats by date
function groupChatsByDate(chats: ChatListItem[]) {
  const groups: { [key: string]: ChatListItem[] } = { Today: [], Yesterday: [], 'Previous 7 Days': [], Older: [] };
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

export default function ChatSearchPopup({
  isOpen,
  searchQuery,
  filteredChats,
  deletingChatId,
  onClose,
  onSearchChange,
  onStartNewChat,
  onChatSelect
}: ChatSearchPopupProps) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50" onClick={onClose}>
      <div className="flex flex-col max-h-[480px] min-h-[480px] w-[638px] bg-white rounded-xl shadow-xl" onClick={e => e.stopPropagation()}>
        {/* Input row */}
        <div className="ms-6 me-4 flex max-h-[64px] min-h-[64px] items-center justify-between">
          <input
            className="placeholder:text-gray-400 w-full border-none bg-transparent focus:border-transparent focus:ring-0 focus:outline-none text-base text-black"
            placeholder="Search chats..."
            value={searchQuery}
            onChange={e => onSearchChange(e.target.value)}
            autoFocus
          />
          <button
            className="hover:bg-gray-200 focus-visible:ring-2 focus-visible:ring-gray-300 flex items-center justify-center rounded-full bg-transparent p-1 ms-4"
            aria-label="Close"
            onClick={onClose}
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
                className={`cursor-pointer group relative flex items-center rounded-xl px-4 py-3 hover:bg-gray-100 focus:bg-gray-100 ${
                  deletingChatId ? 'opacity-50 cursor-not-allowed' : ''
                }`}
                tabIndex={0}
                onClick={() => { 
                  // Prevent creating new chat if there are pending deletions
                  if (deletingChatId) {
                    return;
                  }
                  onStartNewChat(); 
                  onClose(); 
                }}
                onKeyDown={e => { 
                  if (e.key === 'Enter' || e.key === ' ') { 
                    // Prevent creating new chat if there are pending deletions
                    if (deletingChatId) {
                      return;
                    }
                    onStartNewChat(); 
                    onClose(); 
                  } 
                }}
              >
                <PencilLine className="w-5 h-5 text-gray-500" />
                <div className="relative grow overflow-hidden whitespace-nowrap ps-2">
                  <div className="text-sm font-medium text-black">
                    New chat
                    {deletingChatId && (
                      <span className="ml-2 text-xs text-gray-400">(deletion in progress)</span>
                    )}
                  </div>
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
                        className={`cursor-pointer group relative flex items-center rounded-xl px-4 py-3 hover:bg-gray-100 focus:bg-gray-100 ${
                          deletingChatId === chat.id ? 'opacity-50 cursor-not-allowed' : ''
                        }`}
                        tabIndex={0}
                        onClick={() => { 
                          // Prevent selection if chat is being deleted
                          if (deletingChatId === chat.id) {
                            return;
                          }
                          onChatSelect(chat); 
                          onClose(); 
                        }}
                        onKeyDown={e => { 
                          if (e.key === 'Enter' || e.key === ' ') { 
                            // Prevent selection if chat is being deleted
                            if (deletingChatId === chat.id) {
                              return;
                            }
                            onChatSelect(chat); 
                            onClose(); 
                          } 
                        }}
                      >
                        {/* Removed chat icon */}
                        <div className="relative grow overflow-hidden whitespace-nowrap ps-2">
                          <div className="text-sm truncate">
                            {chat.title}
                            {deletingChatId === chat.id && (
                              <span className="ml-2 text-xs text-gray-400">(deleting...)</span>
                            )}
                          </div>
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
  );
}
