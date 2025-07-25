export interface Chat {
  id: string;
  title: string;
  lastMessage: string;
  timestamp: string;
  messageCount: number;
  messages: any[];
  contextFilters?: {
    federalTaxCode: boolean;
    stateTaxCodes: string[];
    profileTags: string[];
  };
  createdAt: string;
  updatedAt: string;
}

export interface ChatHistoryProps {
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
  pendingNewChat?: boolean;
  onStartNewChat?: () => void;
}

export interface ChatbotPanelProps {
  currentChat?: Chat | null;
  userProfile?: any;
  updateChatTitle?: (chatId: string, newTitle: string) => void;
  onChatContextUpdate?: (updated: Chat & { contextFilters?: any }) => void;
  pendingNewChat?: boolean;
  onCreateChatWithMessage?: (msg: string) => void;
} 