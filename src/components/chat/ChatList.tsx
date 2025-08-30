'use client';

import React, { useState } from 'react';
import ReactDOM from 'react-dom';
import { MoreVertical } from 'lucide-react';
import type { ChatListItem } from '@/types/chat';

interface ChatListProps {
  chats: ChatListItem[];
  selectedChatId?: string | null;
  deletingChatId: string | null;
  renamingChatId: string | null;
  renameInput: string;
  onChatSelect: (chat: ChatListItem) => void;
  onRenameStart: (chatId: string, title: string) => void;
  onRenameChange: (value: string) => void;
  onRenameSave: (chatId: string) => void;
  onRenameCancel: () => void;
  onDeleteChat: (chatId: string) => void;
}

export default function ChatList({
  chats,
  selectedChatId,
  deletingChatId,
  renamingChatId,
  renameInput,
  onChatSelect,
  onRenameStart,
  onRenameChange,
  onRenameSave,
  onRenameCancel,
  onDeleteChat
}: ChatListProps) {
  const [dropdownMenu, setDropdownMenu] = useState<{ show: boolean, chatId: string | null, anchor: { top: number, left: number } }>({ 
    show: false, 
    chatId: null, 
    anchor: { top: 0, left: 0 } 
  });

  const handleDropdownToggle = (e: React.MouseEvent, chatId: string) => {
    e.stopPropagation();
    setDropdownMenu({
      show: !dropdownMenu.show || dropdownMenu.chatId !== chatId,
      chatId: dropdownMenu.show && dropdownMenu.chatId === chatId ? null : chatId,
      anchor: { 
        top: e.currentTarget.getBoundingClientRect().bottom, 
        left: e.currentTarget.getBoundingClientRect().right 
      }
    });
  };

  const closeDropdown = () => {
    setDropdownMenu({ show: false, chatId: null, anchor: { top: 0, left: 0 } });
  };

  // Close dropdown when clicking outside
  React.useEffect(() => {
    const handleClick = () => {
      if (dropdownMenu.show) closeDropdown();
    };
    window.addEventListener('click', handleClick);
    return () => window.removeEventListener('click', handleClick);
  }, [dropdownMenu.show]);

  if (chats.length === 0) {
    return (
      <div className="p-4 text-center text-gray-400 text-sm">No chats found</div>
    );
  }

  return (
    <ul className="space-y-1">
      {chats.map((chat) => (
        <li
          key={chat.id}
          className={`group flex items-center gap-2 px-2 py-2 rounded-lg cursor-pointer transition-colors ${
            selectedChatId === chat.id ? 'bg-gray-200 border-l-4 border-gray-700' : 'hover:bg-gray-100'
          } ${
            deletingChatId === chat.id ? 'opacity-50 cursor-not-allowed' : ''
          }`}
          onClick={() => {
            // Prevent selection if chat is being deleted
            if (deletingChatId === chat.id) {
              return;
            }
            onChatSelect(chat);
          }}
        >
          {/* Removed chat icon */}
          <div className="flex-1 min-w-0">
            {/* Inline rename input or title */}
            {renamingChatId === chat.id ? (
              <input
                className="truncate font-normal text-xs text-gray-900 bg-gray-50 border border-gray-300 rounded px-2 py-1 w-full focus:outline-none focus:ring-2 focus:ring-gray-300"
                value={renameInput}
                autoFocus
                onChange={e => onRenameChange(e.target.value)}
                onBlur={() => onRenameSave(chat.id)}
                onKeyDown={e => {
                  if (e.key === 'Enter') onRenameSave(chat.id);
                  if (e.key === 'Escape') onRenameCancel();
                }}
                maxLength={60}
              />
            ) : (
              <div className="truncate font-normal text-xs text-gray-900">
                {chat.title}
                {deletingChatId === chat.id && (
                  <span className="ml-2 text-xs text-gray-400">(deleting...)</span>
                )}
              </div>
            )}
            {chat.lastMessage && (
              <div className="truncate text-xs text-gray-500">{chat.lastMessage}</div>
            )}
          </div>
          <div className="relative">
            <button
              className={`p-1 rounded-full hover:bg-gray-200 transition-opacity ${
                deletingChatId === chat.id ? 'opacity-50 cursor-not-allowed' : ''
              }`}
              disabled={deletingChatId === chat.id}
              ref={el => {
                if (el && dropdownMenu.show && dropdownMenu.chatId === chat.id) {
                  const rect = el.getBoundingClientRect();
                  if (dropdownMenu.anchor.top !== rect.bottom || dropdownMenu.anchor.left !== rect.right) {
                    setDropdownMenu(dm => ({ ...dm, anchor: { top: rect.bottom, left: rect.right } }));
                  }
                }
              }}
              onClick={(e) => {
                // Prevent dropdown if chat is being deleted
                if (deletingChatId === chat.id) {
                  e.stopPropagation();
                  return;
                }
                handleDropdownToggle(e, chat.id);
              }}
            >
              <MoreVertical className="w-4 h-4 text-gray-400" />
            </button>
            {/* Dropdown menu for chat options */}
            {dropdownMenu.show && dropdownMenu.chatId === chat.id && ReactDOM.createPortal(
              <div
                className="fixed z-[200000] bg-white rounded shadow-lg w-32 py-1 flex flex-col justify-center items-center"
                style={{ 
                  top: dropdownMenu.anchor.top, 
                  left: dropdownMenu.anchor.left, 
                  minWidth: '7.5rem', 
                  boxShadow: '0 4px 16px 0 rgba(0,0,0,0.10)' 
                }}
              >
                <button
                  onClick={() => {
                    // Prevent rename if chat is being deleted
                    if (deletingChatId === chat.id) {
                      return;
                    }
                    onRenameStart(chat.id, chat.title);
                    closeDropdown();
                  }}
                  className={`block w-11/12 mx-auto mb-1 px-2 py-1 text-center text-[13px] font-medium text-gray-800 hover:bg-gray-100 focus:bg-gray-100 transition rounded ${
                    deletingChatId === chat.id ? 'opacity-50 cursor-not-allowed' : ''
                  }`}
                  style={{ minHeight: '32px' }}
                  disabled={deletingChatId === chat.id}
                >
                  {deletingChatId === chat.id ? 'Renaming...' : 'Rename'}
                </button>
                <button
                  onClick={() => { 
                    onDeleteChat(chat.id); 
                    closeDropdown(); 
                  }}
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
  );
}
