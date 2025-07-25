// src/lib/ConversationHistoryModel.ts

export interface Conversation {
  id: string;
  title: string;
  lastMessage: string;
  timestamp: string;
  messageCount: number;
  messages?: any[];
  contextFilters?: {
    federalTaxCode: boolean;
    stateTaxCodes: string[];
    profileTags: string[];
  };
}

// Rename ConversationHistoryModel to ChatHistoryModel
class ChatHistoryModel {
  static STORAGE_KEY = 'cachedConversations';

  static loadAll(): Conversation[] {
    try {
      const raw = localStorage.getItem(this.STORAGE_KEY);
      if (!raw) return [];
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) return [];
      return parsed.map((conv) => ({ ...conv, timestamp: String(conv.timestamp) }));
    } catch (e) {
      console.warn('Failed to load conversation history:', e);
      return [];
    }
  }

  static saveAll(conversations: Conversation[]): boolean {
    try {
      localStorage.setItem(this.STORAGE_KEY, JSON.stringify(conversations));
      return true;
    } catch (e: any) {
      if (e && e.name === 'QuotaExceededError') {
        window.dispatchEvent(new CustomEvent('conversation-storage-warning', { detail: 'Not enough browser memory to save conversation history.' }));
      }
      console.warn('Failed to save conversation history:', e);
      return false;
    }
  }

  static clearAll() {
    try {
      localStorage.removeItem(this.STORAGE_KEY);
      window.dispatchEvent(new CustomEvent('conversation-storage-cleared'));
    } catch (e) {
      console.warn('Failed to clear conversation history:', e);
    }
  }
}

export default ChatHistoryModel; 