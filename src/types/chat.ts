// Core chat types
export interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
  status?: 'complete' | 'streaming' | 'cancelled' | 'error' | 'pending';
  relevantDocs?: DocumentReference[];
  // Linkage for assistant variants
  parentUserId?: string | null;
  // Stored on parent user message to track variant IDs
  assistantVariants?: string[];
}

export interface DocumentReference {
  id: string;
  title: string;
  url?: string;
  snippet?: string;
}

// Chat state management
export interface ContextFilters {
  stateTaxCodes: string[];
  profileTags: string[];
  // Optional filing entity to scope guidance (e.g., individuals, businesses, nonprofits)
  filingEntity?: string;
}

export interface ModelSettings {
  modelType: 'chatgpt' | 'ollama';
  model: string;
  isAsync: boolean;
}

export interface LoadingState {
  isLoading: boolean;
  requestId: string | null;
  streamingContent: string;
}

export interface InputState {
  currentInput: string;
  savedInput: string;
}

export interface ChatState {
  id: string;
  title: string;
  messages: Message[];
  contextFilters: ContextFilters;
  modelSettings: ModelSettings;
  loadingState: LoadingState;
  inputState: InputState;
  status: "ready" | "pending";
  notification?: string | null;
}

// Chat list management
export interface ChatListItem {
  id: string;
  title: string;
  lastMessage?: string;
  timestamp: Date;
  messageCount: number;
  isLoading?: boolean; // Track if this chat is currently processing
  contextFilters?: {
    stateTaxCodes: string[];
    profileTags: string[];
    filingEntity?: string;
  };
}

// User profile
export interface UserProfile {
  tags: string[];
  context: string;
}

// Model selection
export interface Model {
  id: string;
  name: string;
  provider: 'openai' | 'ollama';
  description: string;
}

export interface AvailableModels {
  chatgpt: Model[];
  ollama: Model[];
}

// Notification system
export interface Notification {
  id: string;
  message: string;
  type: 'error' | 'info' | 'warning' | 'success';
  duration?: number;
  dismissible?: boolean;
}

// Chat events
export interface ChatEvents {
  'state:updated': (updates: Partial<ChatState>) => void;
  'message:added': (message: Message) => void;
  'message:updated': (messageId: string, updates: Partial<Message>) => void;
  'loading:started': () => void;
  'loading:stopped': () => void;
  'streaming:updated': (content: string) => void;
  'error': (error: string) => void;
}

export interface ChatListEvents {
  'chat:added': (chat: ChatListItem) => void;
  'chat:updated': (chatId: string, updates: Partial<ChatListItem>) => void;
  'chat:removed': (chatId: string) => void;
  'chat:selected': (chatId: string) => void;
  'error': (error: string) => void;
}

// Component props
export interface ChatbotPanelProps {
  currentChat: ChatState | null;
  userProfile?: UserProfile | null;
  onSendMessage: (message: string) => Promise<boolean>;
  onCancelRequest: () => Promise<void>;
  onReloadMessage: (messageId: string, modelType: 'chatgpt' | 'ollama', model: string) => Promise<boolean>;
  onEditMessage: (messageId: string, newContent: string) => Promise<boolean>;
  onUpdateContextFilters: (filters: Partial<ChatState['contextFilters']>) => void;
  onUpdateModelSettings: (settings: Partial<ChatState['modelSettings']>) => void;
  onUpdateInputState: (inputState: Partial<ChatState['inputState']>) => void;
  onUpdateChatTitle: (newTitle: string) => Promise<boolean>;
  onCreateChatWithMessage?: (msg: string, modelType: 'chatgpt' | 'ollama', model: string) => void;
  pendingNewChat?: boolean;
}

export interface ChatHistoryProps {
  chats: ChatListItem[];
  selectedChatId?: string | null;
  onChatSelect: (chat: ChatListItem) => void;
  onStartNewChat: () => void;
  onModeSwitch?: () => void;
  pendingNewChat?: boolean;
}

// Hook options
export interface UseChatInstanceOptions {
  onStateUpdate?: (updates: Partial<ChatState>) => void;
  onMessageAdded?: (message: Message) => void;
  onMessageUpdated?: (messageId: string, updates: Partial<Message>) => void;
  onLoadingStarted?: () => void;
  onLoadingStopped?: () => void;
  onStreamingUpdated?: (content: string) => void;
  onError?: (error: string) => void;
}

export interface UseChatListOptions {
  onChatAdded?: (chat: ChatListItem) => void;
  onChatUpdated?: (chatId: string, updates: Partial<ChatListItem>) => void;
  onChatRemoved?: (chatId: string) => void;
  onChatSelected?: (chatId: string) => void;
  onError?: (error: string) => void;
}

// Backend response types
export interface BackendConversation {
  id: string;
  title: string;
  lastMessage?: string;
  timestamp?: string;
  updatedAt?: string;
  createdAt?: string;
  messageCount?: number;
  messages?: Message[];
  contextFilters?: ContextFilters;
}

// Streaming response types
export interface StreamChunk {
  type: 'content' | 'complete' | 'cancelled' | 'error';
  content?: string;
  messageId?: string;
  finalContent?: string;
  error?: string;
  message?: string;
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
  model?: string;
  provider?: string;
  timestamp: number;
  processingTime?: number;
}

// Utility types
export type ModelType = 'chatgpt' | 'ollama';
export type ChatStatus = 'ready' | 'pending';
export type NotificationType = 'error' | 'info' | 'warning' | 'success';
export type MessageStatus = 'complete' | 'streaming' | 'cancelled' | 'error'; 