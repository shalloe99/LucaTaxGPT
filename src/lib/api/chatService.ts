import apiClient from '@/lib/api/client';

// Types collocated for simplicity; align with backend DTOs
export interface BackendConversation {
  id: string;
  title: string;
  updatedAt?: string;
  createdAt?: string;
  messages?: Array<{ content: string }>;
  contextFilters?: {
    stateTaxCodes?: string[];
    profileTags?: string[];
  };
}

export const chatService = {
  async listChats(): Promise<BackendConversation[]> {
    return apiClient.get('/api/chat/chats');
  },

  async getChat(chatId: string): Promise<BackendConversation> {
    return apiClient.get(`/api/chat/chats/${encodeURIComponent(chatId)}`);
  },

  async createChat(payload: { title: string; contextFilters?: any; messages?: any[] }): Promise<BackendConversation> {
    return apiClient.post('/api/chat/chats', payload);
  },

  async updateChatTitle(chatId: string, title: string): Promise<BackendConversation> {
    return apiClient.put(`/api/chat/chats/${encodeURIComponent(chatId)}`, { title });
  },

  async deleteChat(chatId: string): Promise<{ success: boolean }> {
    return apiClient.delete(`/api/chat/chats/${encodeURIComponent(chatId)}`);
  },

  async listModels(): Promise<{ chatgpt: any[]; ollama: any[] } | { models: { chatgpt: any[]; ollama: any[] } }> {
    return apiClient.get('/api/chat/models');
  },
};

export default chatService;


