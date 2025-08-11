import EventEmitter from '@/lib/events';
import type { ChatListItem, ChatListEvents } from '@/types/chat';
import chatService from '@/lib/api/chatService';

export class ChatListManager extends EventEmitter<ChatListEvents> {
  private chats: Map<string, ChatListItem> = new Map();
  private selectedChatId: string | null = null;
  private retryCount: number = 0;
  private maxRetries: number = 3;
  private lastLoadTime: number = 0;
  private loadCooldown: number = 2000; // 2 seconds cooldown between loads
  private isRateLimited: boolean = false;
  private rateLimitResetTime: number = 0;
  
  // Add caching properties
  private isLoaded: boolean = false;
  private cacheExpiry: number = 5 * 60 * 1000; // 5 minutes cache
  private lastCacheTime: number = 0;
  private isLoading: boolean = false;

  constructor() {
    super();
  }

  // Getters
  getAllChats(): ChatListItem[] {
    return Array.from(this.chats.values()).sort((a, b) => 
      b.timestamp.getTime() - a.timestamp.getTime()
    );
  }

  getChat(chatId: string): ChatListItem | undefined {
    return this.chats.get(chatId);
  }

  getSelectedChatId(): string | null {
    return this.selectedChatId;
  }

  // Chat list operations
  addChat(chat: ChatListItem): void {
    this.chats.set(chat.id, chat);
    this.emit('chat:added', chat);
  }

  updateChat(chatId: string, updates: Partial<ChatListItem>): void {
    const chat = this.chats.get(chatId);
    if (chat) {
      const updatedChat = { ...chat, ...updates };
      this.chats.set(chatId, updatedChat);
      this.emit('chat:updated', chatId, updates);
    }
  }

  removeChat(chatId: string): void {
    if (this.chats.has(chatId)) {
      this.chats.delete(chatId);
      this.emit('chat:removed', chatId);
      
      // If this was the selected chat, clear selection
      if (this.selectedChatId === chatId) {
        this.selectChat(null);
      }
    }
  }

  selectChat(chatId: string | null): void {
    this.selectedChatId = chatId;
    if (chatId !== null) {
      this.emit('chat:selected', chatId);
    }
  }

  // Backend operations
  async loadAllChats(forceRefresh: boolean = false): Promise<void> {
    const now = Date.now();
    
    // Check if we're already loading
    if (this.isLoading) {
      console.log('⏸️ ChatListManager: Already loading chats, skipping request');
      return;
    }
    
    // Check if we have valid cached data and don't need to force refresh
    if (!forceRefresh && this.isLoaded && (now - this.lastCacheTime) < this.cacheExpiry) {
      console.log('📋 ChatListManager: Using cached chat data');
      return;
    }
    
    // Check if we're currently rate limited
    if (this.isRateLimited && now < this.rateLimitResetTime) {
      console.log('⏸️ ChatListManager: Rate limited, skipping request');
      return;
    }
    
    // Rate limiting: prevent too frequent requests
    if (!forceRefresh && (now - this.lastLoadTime) < this.loadCooldown) {
      console.log('⏸️ ChatListManager: Rate limited by cooldown, skipping request');
      return;
    }
    
    this.isLoading = true;
    this.lastLoadTime = now;

    try {
      console.log('📡 ChatListManager: Loading chats from backend...');
      const backendChats = await chatService.listChats();
      
      // Clear existing chats
      this.chats.clear();
      
      // Convert backend chats to ChatListItem format
      backendChats.forEach((backendChat) => {
        const lastMessage = backendChat.messages && backendChat.messages.length > 0
          ? backendChat.messages[backendChat.messages.length - 1].content
          : undefined;
        const chatItem: ChatListItem = {
          id: backendChat.id,
          title: backendChat.title || 'New Conversation',
          lastMessage,
          timestamp: new Date(backendChat.updatedAt || backendChat.createdAt || Date.now()),
          messageCount: backendChat.messages?.length || 0,
        };
        this.addChat(chatItem);
      });

      this.retryCount = 0; // Reset retry count on success
      this.isLoaded = true;
      this.lastCacheTime = now;
      console.log(`✅ ChatListManager: Loaded ${this.chats.size} chats successfully`);
    } catch (error) {
      console.error('❌ ChatListManager: Failed to load chats:', error);
      
      // Retry logic
      if (this.retryCount < this.maxRetries) {
        this.retryCount++;
        console.log(`🔄 ChatListManager: Retrying load (${this.retryCount}/${this.maxRetries})`);
        setTimeout(() => this.loadAllChats(forceRefresh), 1000 * this.retryCount);
      } else {
        console.error('💥 ChatListManager: Failed to load chats after multiple attempts');
        this.emit('error', 'Failed to load chats after multiple attempts');
      }
    } finally {
      this.isLoading = false;
    }
  }

  // Check if chats are loaded
  isChatsLoaded(): boolean {
    return this.isLoaded;
  }

  // Check if cache is still valid
  isCacheValid(): boolean {
    const now = Date.now();
    return this.isLoaded && (now - this.lastCacheTime) < this.cacheExpiry;
  }

  // Force refresh the chat list
  async refreshChats(): Promise<void> {
    console.log('🔄 ChatListManager: Force refreshing chats...');
    await this.loadAllChats(true);
  }

  // Invalidate cache (useful when we know data has changed)
  invalidateCache(): void {
    console.log('🗑️ ChatListManager: Invalidating cache');
    this.isLoaded = false;
    this.lastCacheTime = 0;
  }

  async createChat(title: string = 'New Conversation'): Promise<ChatListItem | null> {
    try {
      const backendChat = await chatService.createChat({
        title,
        contextFilters: { stateTaxCodes: [], profileTags: [] },
        messages: [],
      });
      
      const chatItem: ChatListItem = {
        id: backendChat.id,
        title: backendChat.title,
        timestamp: new Date(backendChat.createdAt || Date.now()),
        messageCount: 0,
      };
      
      this.addChat(chatItem);
      this.selectChat(chatItem.id);
      
      return chatItem;
    } catch (error) {
      console.error('Failed to create chat:', error);
      this.emit('error', 'Failed to create new chat');
      return null;
    }
  }

  async createChatWithMessage(
    message: string,
    modelType: 'chatgpt' | 'ollama',
    model: string
  ): Promise<ChatListItem | null> {
    try {
      const backendChat = await chatService.createChat({
        title: 'New Conversation',
        contextFilters: { stateTaxCodes: [], profileTags: [] },
        messages: [{
          id: Date.now().toString(),
          role: 'user',
          content: message,
          timestamp: new Date().toISOString(),
        }],
      });
      
      const chatItem: ChatListItem = {
        id: backendChat.id,
        title: backendChat.title,
        lastMessage: message,
        timestamp: new Date(backendChat.createdAt || Date.now()),
        messageCount: 1,
      };
      
      this.addChat(chatItem);
      this.selectChat(chatItem.id);
      
      return chatItem;
    } catch (error) {
      console.error('Failed to create chat with message:', error);
      this.emit('error', 'Failed to create new chat');
      return null;
    }
  }

  async deleteChat(chatId: string): Promise<boolean> {
    try {
      // First try to delete from backend
      await chatService.deleteChat(chatId);
      // Only remove from local state if backend deletion succeeds
      this.removeChat(chatId);
      return true;
    } catch (error) {
      console.error('Failed to delete chat:', error);
      // Don't remove from local state if backend deletion fails
      this.emit('error', 'Failed to delete chat');
      return false;
    }
  }

  async updateChatTitle(chatId: string, newTitle: string): Promise<boolean> {
    try {
      await chatService.updateChatTitle(chatId, newTitle);
      this.updateChat(chatId, { title: newTitle });
      return true;
    } catch (error) {
      console.error('Failed to update chat title:', error);
      this.emit('error', 'Failed to update chat title');
      return false;
    }
  }

  // Update chat list from ChatInstance
  updateFromChatInstance(chatInstance: any): void {
    const state = chatInstance.getState();
    const lastMessage = state.messages.length > 0 
      ? state.messages[state.messages.length - 1].content 
      : undefined;
    
    this.updateChat(state.id, {
      title: state.title,
      lastMessage,
      timestamp: new Date(),
      messageCount: state.messages.length,
    });
  }

  // Remove chat if it doesn't exist in backend
  async removeNonExistentChat(chatId: string): Promise<boolean> {
    try {
      await chatService.getChat(chatId);
      return false;
    } catch (error) {
      // If API throws or returns not found via error, remove it
      console.log(`📝 ChatListManager: Removing non-existent chat: ${chatId}`);
      this.removeChat(chatId);
      return true;
    }
  }

  // Cleanup
  destroy(): void {
    this.chats.clear();
    this.selectedChatId = null;
    this.removeAllListeners();
  }
} 