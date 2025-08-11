export interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
  status?: 'complete' | 'streaming' | 'cancelled' | 'error' | 'pending';
  relevantDocs?: any[];
  parentUserId?: string | null;
  assistantVariants?: string[];
}

export interface ContextFilters {
  stateTaxCodes: string[];
  profileTags: string[];
  filingEntity?: string;
}

export interface ModelSettings {
  modelType: 'chatgpt' | 'ollama';
  model: string;
  isAsync: boolean;
  streamingEnabled: boolean;
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
}

export interface ChatEvents {
  'state:updated': (updates: Partial<ChatState>) => void;
  'message:added': (message: Message) => void;
  'message:updated': (messageId: string, updates: Partial<Message>) => void;
  'loading:started': () => void;
  'loading:stopped': () => void;
  'streaming:updated': (content: string) => void;
  'error': (error: string) => void;
}

import EventEmitter from '@/lib/events';

export class ChatInstance extends EventEmitter<ChatEvents> {
  private state: ChatState;
  private abortController: AbortController | null = null;
  private timeoutId: NodeJS.Timeout | null = null;
  private readonly REQUEST_TIMEOUT = 1800000; // 30 minutes for streaming responses (extended for cloud LLM)
  private networkMonitor: NetworkMonitor | null = null;
  private isDestroyed: boolean = false;

  constructor(initialState?: Partial<ChatState>) {
    super(); // Initialize EventEmitter
    this.state = {
      id: initialState?.id || '', // Don't generate ID - let backend assign it
      title: initialState?.title || 'New Conversation',
      messages: initialState?.messages || [],
      contextFilters: {
        stateTaxCodes: [],
        profileTags: [],
        filingEntity: 'individuals',
        ...initialState?.contextFilters,
      },
      modelSettings: {
        modelType: 'ollama',
        model: 'phi3:3.8b',
        isAsync: true,
        streamingEnabled: true,
        ...initialState?.modelSettings,
      },
      loadingState: {
        isLoading: false,
        requestId: null,
        streamingContent: '',
        ...initialState?.loadingState,
      },
      inputState: {
        currentInput: '',
        savedInput: '',
        ...initialState?.inputState,
      },
      status: initialState?.status || 'ready',
    };
  }

  // Getters for current state
  getState(): ChatState {
    return { ...this.state };
  }

  getId(): string {
    return this.state.id;
  }

  getTitle(): string {
    return this.state.title;
  }

  getMessages(): Message[] {
    return [...this.state.messages];
  }

  getContextFilters(): ContextFilters {
    return { ...this.state.contextFilters };
  }

  getModelSettings(): ModelSettings {
    return { ...this.state.modelSettings };
  }

  getLoadingState(): LoadingState {
    return { ...this.state.loadingState };
  }

  getInputState(): InputState {
    return { ...this.state.inputState };
  }

  // State update methods
  private updateState(updates: Partial<ChatState>): void {
    this.state = { ...this.state, ...updates };
    this.emit('state:updated', updates);
  }

  setTitle(title: string): void {
    this.updateState({ title });
  }

  setContextFilters(filters: Partial<ContextFilters>): void {
    this.updateState({
      contextFilters: { ...this.state.contextFilters, ...filters }
    });
  }

  setModelSettings(settings: Partial<ModelSettings>): void {
    this.updateState({
      modelSettings: { ...this.state.modelSettings, ...settings }
    });
  }

  setInputState(inputState: Partial<InputState>): void {
    this.updateState({
      inputState: { ...this.state.inputState, ...inputState }
    });
  }

  // Update chat ID (used when backend creates a new chat with different ID)
  setId(newId: string): void {
    this.updateState({ id: newId });
  }

  // Message management
  addMessage(message: Message): void {
    this.state.messages.push(message);
    this.updateState({ messages: [...this.state.messages] });
    this.emit('message:added', message);
  }

  updateMessage(messageId: string, updates: Partial<Message>): void {
    const messageIndex = this.state.messages.findIndex(m => m.id === messageId);
    if (messageIndex !== -1) {
      this.state.messages[messageIndex] = { ...this.state.messages[messageIndex], ...updates };
      this.updateState({ messages: [...this.state.messages] });
      this.emit('message:updated', messageId, updates);
    }
  }

  removeMessagesAfter(messageIndex: number): void {
    this.state.messages = this.state.messages.slice(0, messageIndex + 1);
    this.updateState({ messages: [...this.state.messages] });
  }

  // Loading state management
  private setLoadingState(loadingState: Partial<LoadingState>): void {
    const newLoadingState = { ...this.state.loadingState, ...loadingState };
    this.updateState({ loadingState: newLoadingState });
    
    if (newLoadingState.isLoading && !this.state.loadingState.isLoading) {
      this.emit('loading:started');
    } else if (!newLoadingState.isLoading && this.state.loadingState.isLoading) {
      this.emit('loading:stopped');
    }
    
    if (newLoadingState.streamingContent !== this.state.loadingState.streamingContent) {
      this.emit('streaming:updated', newLoadingState.streamingContent);
    }
  }

  // Timeout management
  private startTimeout(): void {
    this.clearTimeout();
    this.timeoutId = setTimeout(() => {
      console.log(`Request timeout for chat ${this.state.id}`);
      this.cancelRequest();
    }, this.REQUEST_TIMEOUT);
  }

  private clearTimeout(): void {
    if (this.timeoutId) {
      clearTimeout(this.timeoutId);
      this.timeoutId = null;
    }
  }

  // API operations
  async sendMessage(message: string, userProfile?: any): Promise<boolean> {
    return this.sendMessageCore(message, userProfile, { addUserMessage: true });
  }

  private async sendMessageCore(
    message: string,
    userProfile: any,
    options: { addUserMessage?: boolean; rerunOfUserId?: string } = { addUserMessage: true }
  ): Promise<boolean> {
    // Check if chat ID is set (backend should assign it)
    if (!this.state.id) {
      console.error('❌ Chat ID not set - cannot send message. Current state:', {
        id: this.state.id,
        title: this.state.title,
        messageCount: this.state.messages.length
      });
      this.emit('error', 'Chat ID not set - please wait for backend to assign ID');
      return false;
    }
    
    console.log(`🚀 Sending message to chat ID: ${this.state.id}`);

    // Add user message immediately (if not editing existing one)
    if (options.addUserMessage !== false) {
      const userMessage: Message = {
        id: `user_${Date.now()}_${Math.random().toString(36).slice(2)}`,
        role: 'user',
        content: message,
        timestamp: new Date(),
      };
      this.addMessage(userMessage);
      this.setInputState({ currentInput: '', savedInput: '' });
    }

    // Set loading state
    const requestId = Date.now().toString();
    this.setLoadingState({
      isLoading: true,
      requestId,
      streamingContent: '',
    });

    // Cancel any existing request
    if (this.abortController) {
      this.abortController.abort();
    }
    this.abortController = new AbortController();

    try {
      // Prepare context
      let context = '';
      if (userProfile) {
        if (userProfile.context) {
          context += `User Context: ${userProfile.context}\n`;
        }
        if (userProfile.tags && userProfile.tags.length > 0) {
          context += `User Tags: ${userProfile.tags.join(', ')}\n`;
        }
      }

      console.log(`🔀 [${requestId}] ChatInstance routing decision:`, {
        isAsync: this.state.modelSettings.isAsync,
        modelType: this.state.modelSettings.modelType,
        model: this.state.modelSettings.model
      });

      if (this.state.modelSettings.isAsync) {
        console.log(`🚀 [${requestId}] Taking ASYNC path`);
        return await this.sendMessageAsync(message, context, requestId, options.rerunOfUserId);
      } else {
        console.log(`🚀 [${requestId}] Taking SYNC path`);
        return await this.sendMessageSync(message, context, options.rerunOfUserId);
      }
    } catch (error: unknown) {
      if (error instanceof Error && error.name === 'AbortError') {
        console.log('Request was cancelled');
      } else {
        console.error('Error sending message:', error);
      }
      this.setLoadingState({
        isLoading: false,
        requestId: null,
        streamingContent: '',
      });
      this.emit('error', 'Failed to send message');
      return false;
    }
  }

  private async sendMessageAsync(message: string, context: string, requestId: string, rerunOfUserId?: string): Promise<boolean> {
    try {
      console.log(`🚀 [${requestId}] Starting async streaming request`);
      console.log(`📤 [${requestId}] Request payload:`, {
        message,
        context,
        domainKnowledge: this.state.contextFilters,
        modelType: this.state.modelSettings.modelType,
        model: this.state.modelSettings.model,
        mode: 'async',
        stream: true,
      });
      
      const response = await fetch(`/api/chat/user/messaging/${this.state.id}/`, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          message,
          context,
          domainKnowledge: this.state.contextFilters,
          modelType: this.state.modelSettings.modelType,
          model: this.state.modelSettings.model,
          mode: 'async', // Set async mode parameter
          stream: true, // Ensure API proxy treats this as ASYNC request
          requestId,
          rerunOfUserId,
        }),
        signal: this.abortController!.signal,
      });

      if (!response.ok) {
        let errorMessage = `HTTP ${response.status}: ${response.statusText}`;
        
        // Try to get more detailed error information from the response
        try {
          const errorData = await response.json();
          if (errorData.error) {
            errorMessage = `HTTP ${response.status}: ${errorData.error}`;
            if (errorData.details) {
              errorMessage += ` - ${errorData.details}`;
            }
            if (errorData.availableUserMessages) {
              console.error(`🔍 [${requestId}] Available user messages for rerun:`, errorData.availableUserMessages);
            }
          }
        } catch (parseError) {
          // If we can't parse the error response, use the default message
          console.warn(`⚠️ [${requestId}] Could not parse error response:`, parseError);
        }
        
        throw new Error(errorMessage);
      }

      // For async mode, expect immediate JSON response with job details
      const data = await response.json();
      console.log(`📡 [${requestId}] Async response data:`, data);
      
      if (!data.success) {
        throw new Error(data.error || 'Failed to queue async message');
      }
      
      // Create assistant message placeholder with 'pending' status
      const assistantMessage: Message = {
        id: data.assistantMessageId,
        role: 'assistant',
        content: '',
        timestamp: new Date(),
        status: 'pending',
        parentUserId: rerunOfUserId || null,
      } as Message;
      this.addMessage(assistantMessage);
      this.emit('message:added', assistantMessage);
      
      // Note: SSE subscription is handled externally by ChatbotPanel
      // The ChatInstance doesn't manage SSE directly
      console.log(`📡 [${requestId}] Async request successful, waiting for external SSE updates`);
      
      return true;
    } catch (error: unknown) {
      if (error instanceof Error && error.name === 'AbortError') {
        console.log(`🛑 [${requestId}] Async request was cancelled`);
        return false;
      }
      console.error(`❌ [${requestId}] Async request error:`, error);
      throw error;
    }
  }

  private async sendMessageSync(message: string, context: string, rerunOfUserId?: string): Promise<boolean> {
    const maxRetries = 3;
    let retryCount = 0;
    let lastError: Error | null = null;
    
    while (retryCount <= maxRetries) {
      try {
        console.log(`🚀 [SYNC] Starting sync request for ${this.state.modelSettings.modelType} (attempt ${retryCount + 1}/${maxRetries + 1})`);
        
        // Initialize network monitoring
        this.networkMonitor = new NetworkMonitor();
        this.networkMonitor.startMonitoring();
        
        // Add connection health check
        const connectionCheck = this.networkMonitor.isConnectionHealthy();
        if (!connectionCheck.healthy) {
          console.warn(`⚠️ [SYNC] Network connection issues detected:`, connectionCheck.issues);
        }
        
        const response = await fetch(`/api/chat/user/messaging/${this.state.id}/`, {
          method: 'POST',
          headers: { 
            'Content-Type': 'application/json',
            'X-Connection-Health': JSON.stringify(connectionCheck),
            'X-Request-Timeout': '1800000', // 30 minutes
            'X-Client-Version': '1.0.0'
          },
          body: JSON.stringify({
            message,
            context,
            domainKnowledge: this.state.contextFilters,
            modelType: this.state.modelSettings.modelType,
            model: this.state.modelSettings.model,
            stream: false, // Disable streaming for sync mode
            rerunOfUserId,
          }),
          signal: this.abortController!.signal,
        });

        if (!response.ok) {
          let errorMessage = `HTTP ${response.status}: ${response.statusText}`;
          
          // Try to get more detailed error information from the response
          try {
            const errorData = await response.json();
            if (errorData.error) {
              errorMessage = `HTTP ${response.status}: ${errorData.error}`;
              if (errorData.details) {
                errorMessage += ` - ${errorData.details}`;
              }
              if (errorData.availableUserMessages) {
                console.error(`🔍 [SYNC] Available user messages for rerun:`, errorData.availableUserMessages);
              }
            }
          } catch (parseError) {
            // If we can't parse the error response, use the default message
            console.warn(`⚠️ [SYNC] Could not parse error response:`, parseError);
          }
          
          throw new Error(errorMessage);
        }

        const data = await response.json();
        console.log(`📡 [SYNC] Received response:`, data);
        console.log(`📡 [SYNC] Response type:`, typeof data);
        console.log(`📡 [SYNC] Response keys:`, Object.keys(data));
        
        if (data.response) {
          const aiMessage: Message = {
            id: `assistant_${Date.now()}_${Math.random().toString(36).slice(2)}`,
            role: 'assistant',
            content: data.response,
            timestamp: new Date(),
          };
          this.addMessage(aiMessage);
          this.setLoadingState({
            isLoading: false,
            requestId: null,
            streamingContent: '',
          });
          
          // Emit events
          this.emit('message:added', aiMessage);
          this.emit('loading:stopped');
          this.emit('state:updated', { messages: this.state.messages });
          
          console.log(`✅ [SYNC] Successfully added message: ${data.response.substring(0, 50)}...`);
          return true;
        } else {
          console.error(`❌ [SYNC] Invalid response format:`, data);
          throw new Error(`Invalid response format: ${JSON.stringify(data)}`);
        }
      } catch (error: unknown) {
        lastError = error instanceof Error ? error : new Error(String(error));
        retryCount++;
        
        if (error instanceof Error && error.name === 'AbortError') {
          console.log('🛑 [SYNC] Sync request was cancelled');
          return false;
        }
        
        // Check if this is a backend restart or temporary connection issue
        if (error instanceof Error && this.isBackendRestartError(error.message)) {
          console.log(`🔄 [SYNC] Backend restart detected (attempt ${retryCount}/${maxRetries}), retrying in 2 seconds...`);
          if (retryCount <= maxRetries) {
            await new Promise(resolve => setTimeout(resolve, 2000));
            continue;
          } else {
            console.log(`⚠️ [SYNC] Max retries reached for backend restart`);
            // Don't show this error to the user, it's just a restart
            this.setLoadingState({
              isLoading: false,
              requestId: null,
              streamingContent: '',
            });
            this.emit('loading:stopped');
            return false;
          }
        }
        
        // Enhanced error handling for network issues
        if (error instanceof Error && this.isNetworkError(error)) {
          console.error(`🌐 [SYNC] Network error detected:`, error.message);
          if (retryCount > maxRetries) {
            this.emit('error', `Network connection issue: ${error.message}. Please check your internet connection and try again.`);
            return false;
          }
          console.log(`🔄 [SYNC] Retrying due to network error (${retryCount}/${maxRetries})`);
          await new Promise(resolve => setTimeout(resolve, 1000 * retryCount));
          continue;
        }
        
        console.error(`❌ [SYNC] Sync request error:`, error);
        if (retryCount > maxRetries) {
          throw error;
        }
        console.log(`🔄 [SYNC] Retrying due to error (${retryCount}/${maxRetries})`);
        await new Promise(resolve => setTimeout(resolve, 1000 * retryCount));
      } finally {
        // Clean up network monitoring
        if (this.networkMonitor) {
          this.networkMonitor.stopMonitoring();
          this.networkMonitor = null;
        }
      }
    }
    
    // If we get here, all retries failed
    if (lastError) {
      throw lastError;
    }
    
    return false; // Should never reach here, but TypeScript requires it
  }

  private isBackendRestartError(errorMessage: string): boolean {
    const restartErrorPatterns = [
      'HTTP 503: Service Unavailable',
      'fetch failed',
      'ECONNREFUSED',
      'other side closed',
      'UND_ERR_SOCKET',
      'Backend connection issue',
      'Backend service unavailable',
      'Backend is starting up',
      'Backend starting up',
      'Backend restarting'
    ];
    
    return restartErrorPatterns.some(pattern => 
      errorMessage.includes(pattern)
    );
  }

  private isNetworkError(error: Error): boolean {
    const networkErrorPatterns = [
      'Failed to fetch',
      'NetworkError',
      'TypeError: Failed to fetch',
      'ERR_NETWORK',
      'ERR_INTERNET_DISCONNECTED',
      'ERR_NETWORK_CHANGED',
      'ERR_CONNECTION_REFUSED',
      'ERR_CONNECTION_TIMED_OUT',
      'ERR_NAME_NOT_RESOLVED'
    ];
    
    return networkErrorPatterns.some(pattern => 
      error.message.includes(pattern) || error.name.includes(pattern)
    );
  }

  async cancelRequest(): Promise<void> {
    console.log(`Cancelling request for chat ${this.state.id}, requestId: ${this.state.loadingState.requestId}`);
    
    // Clear timeout first
    this.clearTimeout();
    
    // Cancel the backend request if we have a requestId
    if (this.state.loadingState.requestId) {
      try {
        const response = await fetch(`/api/chat/cancel/${this.state.loadingState.requestId}`, {
          method: 'POST',
        });
        
        if (response.ok) {
          console.log(`Successfully cancelled request ${this.state.loadingState.requestId} on backend`);
        } else {
          console.warn(`Backend cancel request failed with status: ${response.status}`);
        }
      } catch (error: unknown) {
        console.error('Error cancelling request on backend:', error);
      }
    }
    
    // Always stop the UI regardless of backend cancel success
    this.setLoadingState({
      isLoading: false,
      requestId: null,
      streamingContent: '', // Clear streaming content when cancelled
    });
    
    // Abort the fetch request
    if (this.abortController) {
      this.abortController.abort();
      this.abortController = null;
      console.log('Aborted fetch request');
    }
    
    // Save the current state to backend
    this.saveToBackend().catch((error: unknown) => {
      console.error('Failed to save chat state after cancellation:', error);
    });
  }

  // Method to update a streaming message (called from external SSE updates)
  updateStreamingMessage(messageId: string, content: string, status: 'streaming' | 'complete' | 'cancelled' | 'error' = 'streaming'): void {
    const messageIndex = this.state.messages.findIndex(m => m.id === messageId);
    if (messageIndex === -1) {
      console.warn(`⚠️ [ChatInstance] updateStreamingMessage: Message ${messageId} not found`);
      return;
    }

    const updatedMessages = [...this.state.messages];
    const oldContent = updatedMessages[messageIndex].content;
    updatedMessages[messageIndex] = {
      ...updatedMessages[messageIndex],
      content,
      status,
      timestamp: new Date()
    };

    console.log(`🔄 [ChatInstance] Updating message ${messageId}: ${oldContent.length} → ${content.length} chars`);
    
    this.updateState({ messages: updatedMessages });
    this.emit('message:updated', messageId, { content, status });
    
    if (status === 'complete') {
      this.setLoadingState({
        isLoading: false,
        requestId: null,
        streamingContent: '',
      });
      this.emit('loading:stopped');
    }
  }

  async reloadMessage(messageId: string, modelType: 'chatgpt' | 'ollama', model: string): Promise<boolean> {
    // Find the message to reload
    const messageIndex = this.state.messages.findIndex(m => m.id === messageId);
    if (messageIndex === -1) return false;

    const message = this.state.messages[messageIndex];
    if (message.role !== 'user') return false;

    // Remove all messages after this user message
    this.removeMessagesAfter(messageIndex);

    // Update model settings temporarily
    const originalSettings = { ...this.state.modelSettings };
    this.setModelSettings({ modelType, model });

    // Send the message again
    const success = await this.sendMessage(message.content);

    // Restore original model settings
    this.setModelSettings(originalSettings);

    return success;
  }

  async editMessage(messageId: string, newContent: string, userProfile?: any): Promise<boolean> {
    const messageIndex = this.state.messages.findIndex(m => m.id === messageId);
    if (messageIndex === -1) return false;

    const message = this.state.messages[messageIndex];
    if (message.role !== 'user') return false;

    // Call backend rebase edit API first to keep history consistent
    if (!this.state.id) {
      this.emit('error', 'Chat ID not set - cannot edit message');
      return false;
    }

    try {
      const response = await fetch(`/api/chat/chats/${this.state.id}/messages/${messageId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: newContent }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        const errMsg = (errorData && (errorData.error || errorData.message)) || `HTTP ${response.status}`;
        this.emit('error', `Failed to rebase edit message: ${errMsg}`);
        return false;
      }
    } catch (error) {
      this.emit('error', 'Network error while editing message');
      return false;
    }

    // Optimistically update local state to reflect edit
    this.updateMessage(messageId, { content: newContent });

    // Remove all messages after this user message in the UI
    this.removeMessagesAfter(messageIndex);

    // Re-run from the edited user message without adding a duplicate
    return await this.sendMessageCore(newContent, userProfile, { addUserMessage: false, rerunOfUserId: messageId });
  }

  async tryAgain(assistantMessageId: string, userProfile?: any): Promise<boolean> {
    console.log(`🔄 [ChatInstance] tryAgain called for assistant message: ${assistantMessageId}`);
    
    // Validate chat ID exists
    if (!this.state.id) {
      console.error(`❌ [ChatInstance] Chat ID not set - cannot retry message`);
      this.emit('error', 'Chat ID not set - please wait for backend to assign ID');
      return false;
    }
    
    // Find the assistant message
    const assistantMsg = this.state.messages.find(m => m.id === assistantMessageId && m.role === 'assistant');
    if (!assistantMsg) {
      console.error(`❌ [ChatInstance] Assistant message not found: ${assistantMessageId}`);
      return false;
    }

    // Prefer explicit parentUserId linkage; fallback to nearest preceding user
    let userMessageId: string | null = assistantMsg.parentUserId ?? null;
    if (!userMessageId) {
      const assistantIndex = this.state.messages.findIndex(m => m.id === assistantMessageId);
      let userIndex = assistantIndex - 1;
      while (userIndex >= 0 && this.state.messages[userIndex].role !== 'user') {
        userIndex--;
      }
      if (userIndex < 0) {
        console.error(`❌ [ChatInstance] No user message found before assistant message: ${assistantMessageId}`);
        return false;
      }
      userMessageId = this.state.messages[userIndex].id;
      console.log(`🔍 [ChatInstance] Using fallback user message ID: ${userMessageId}`);
    } else {
      console.log(`🔍 [ChatInstance] Using explicit parentUserId: ${userMessageId}`);
    }

    const userMessage = this.state.messages.find(m => m.id === userMessageId);
    if (!userMessage || userMessage.role !== 'user') {
      console.error(`❌ [ChatInstance] User message not found or invalid: ${userMessageId}`, userMessage);
      return false;
    }

    console.log(`✅ [ChatInstance] Found user message for rerun: ${userMessage.id} - "${userMessage.content.substring(0, 100)}..."`);
    console.log(`🔄 [ChatInstance] Sending rerun request with rerunOfUserId: ${userMessage.id}`);
    console.log(`🔍 [ChatInstance] Chat ID: ${this.state.id}, Message count: ${this.state.messages.length}`);

    // Validate that the chat exists in the backend before making the rerun request
    let backendChat: any = null;
    try {
      const chatResponse = await fetch(`/api/chat/chats/${this.state.id}`);
      if (!chatResponse.ok) {
        if (chatResponse.status === 404) {
          console.error(`❌ [ChatInstance] Chat not found in backend: ${this.state.id}`);
          this.emit('error', 'Chat not found in backend - it may have been deleted');
          return false;
        }
        console.warn(`⚠️ [ChatInstance] Could not validate chat in backend: HTTP ${chatResponse.status}`);
      } else {
        backendChat = await chatResponse.json();
        console.log(`✅ [ChatInstance] Chat validated in backend: ${this.state.id}`);
        console.log(`🔍 [ChatInstance] Backend chat has ${backendChat.messages?.length || 0} messages`);
        
        // Log backend message IDs for debugging
        if (backendChat.messages && backendChat.messages.length > 0) {
          const backendMessageIds = backendChat.messages.map((m: any) => ({ id: m.id, role: m.role, content: m.content?.substring(0, 50) }));
          console.log(`🔍 [ChatInstance] Backend message IDs:`, backendMessageIds);
          
          // Check if our user message ID exists in backend
          const backendUserMessage = backendChat.messages.find((m: any) => m.id === userMessage.id && m.role === 'user');
          if (!backendUserMessage) {
            console.warn(`⚠️ [ChatInstance] User message ${userMessage.id} not found in backend chat`);
            console.warn(`⚠️ [ChatInstance] This may cause the rerunOfUserId validation to fail`);
            
            // Try to find a similar user message in the backend
            const similarUserMessage = backendChat.messages.find((m: any) => 
              m.role === 'user' && 
              m.content === userMessage.content
            );
            
            if (similarUserMessage) {
              console.log(`🔄 [ChatInstance] Found similar user message in backend: ${similarUserMessage.id}`);
              userMessage.id = similarUserMessage.id; // Use the backend message ID
            } else {
              console.log(`🔄 [ChatInstance] No similar user message found, will create new user message`);
              // We'll handle this case in the logic below
            }
          } else {
            console.log(`✅ [ChatInstance] User message ${userMessage.id} found in backend chat`);
          }
        }
      }
    } catch (validationError) {
      console.warn(`⚠️ [ChatInstance] Chat validation failed:`, validationError);
      // Continue with the request even if validation fails
    }

    // Determine if we should use rerunOfUserId or create a new user message
    const shouldUseRerun = backendChat && backendChat.messages && 
      backendChat.messages.some((m: any) => m.id === userMessage.id && m.role === 'user');
    const rerunOfUserId = shouldUseRerun ? userMessage.id : undefined;
    
    if (shouldUseRerun) {
      console.log(`🔄 [ChatInstance] Using rerun mode with rerunOfUserId: ${rerunOfUserId}`);
    } else {
      console.log(`🔄 [ChatInstance] Using new message mode (no rerunOfUserId)`);
    }

    // Send again without adding a new user message; backend will create a new assistant placeholder variant
    return await this.sendMessageCore(userMessage.content, userProfile, { 
      addUserMessage: !shouldUseRerun, 
      rerunOfUserId 
    });
  }

  // Backend persistence
  async saveToBackend(): Promise<boolean> {
    try {
      const response = await fetch(`/api/chat/chats/${this.state.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: this.state.title,
          contextFilters: this.state.contextFilters,
          messages: this.state.messages.map(msg => ({
            ...msg,
            timestamp: msg.timestamp.toISOString(),
          })),
        }),
      });

      return response.ok;
    } catch (error) {
      console.error('Failed to save chat to backend:', error);
      return false;
    }
  }

  async loadFromBackend(): Promise<boolean> {
    // Don't attempt to load if instance has been destroyed
    if (this.isDestroyed) {
      console.log(`📝 [ChatInstance] Skipping load - instance destroyed: ${this.state.id}`);
      return false;
    }
    
    try {
      const response = await fetch(`/api/chat/chats/${this.state.id}`);
      
      if (!response.ok) {
        if (response.status === 404) {
          // Chat not found - this is a valid case that should be handled gracefully
          console.log(`📝 [ChatInstance] Chat not found: ${this.state.id}`);
          this.emit('error', 'Chat not found - it may have been deleted or never existed');
          return false;
        }
        console.error(`❌ [ChatInstance] Failed to load chat ${this.state.id}: HTTP ${response.status}`);
        this.emit('error', `Failed to load chat: HTTP ${response.status}`);
        return false;
      }

      const data = await response.json();
      
      this.updateState({
        title: data.title,
        contextFilters: data.contextFilters || this.state.contextFilters,
        messages: data.messages?.map((msg: any) => ({
          ...msg,
          timestamp: new Date(msg.timestamp),
        })) || [],
      });

      return true;
    } catch (error) {
      console.error('Failed to load chat from backend:', error);
      return false;
    }
  }

  async deleteFromBackend(): Promise<boolean> {
    try {
      const response = await fetch(`/api/chat/chats/${this.state.id}`, {
        method: 'DELETE',
      });

      return response.ok;
    } catch (error) {
      console.error('Failed to delete chat from backend:', error);
      return false;
    }
  }

  // Factory method to create from backend data
  static fromBackendData(backendChat: any): ChatInstance {
    const instance = new ChatInstance({
      id: backendChat.id,
      title: backendChat.title,
      contextFilters: backendChat.contextFilters,
      messages: backendChat.messages?.map((msg: any) => ({
        ...msg,
        timestamp: new Date(msg.timestamp),
      })) || [],
    });

    return instance;
  }

  // Cleanup
  destroy(): void {
    // Mark as destroyed to prevent further operations
    this.isDestroyed = true;
    
    this.clearTimeout();
    if (this.abortController) {
      this.abortController.abort();
      this.abortController = null;
    }
    if (this.networkMonitor) {
      this.networkMonitor.stopMonitoring();
      this.networkMonitor = null;
    }
    this.removeAllListeners();
  }
}

// Network monitoring class for connection health
class NetworkMonitor {
  private isMonitoring = false;
  private healthCheckInterval: NodeJS.Timeout | null = null;
  private connectionIssues: string[] = [];
  private lastHealthCheck = Date.now();

  startMonitoring(): void {
    if (this.isMonitoring) return;
    
    this.isMonitoring = true;
    this.connectionIssues = [];
    
    // Check connection health every 5 seconds
    this.healthCheckInterval = setInterval(() => {
      this.performHealthCheck();
    }, 5000);
    
    // Initial health check
    this.performHealthCheck();
  }

  stopMonitoring(): void {
    this.isMonitoring = false;
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
      this.healthCheckInterval = null;
    }
  }

  private async performHealthCheck(): Promise<void> {
    try {
      // Check if navigator is available (browser environment)
      if (typeof navigator !== 'undefined') {
        // Check online status
        if (!navigator.onLine) {
          this.addIssue('Browser reports offline status');
        }
        
        // Check connection type and speed
        if ('connection' in navigator) {
          const connection = (navigator as any).connection;
          if (connection.effectiveType === 'slow-2g' || connection.effectiveType === '2g') {
            this.addIssue(`Slow connection detected: ${connection.effectiveType}`);
          }
          if (connection.downlink < 1) {
            this.addIssue(`Very slow download speed: ${connection.downlink} Mbps`);
          }
        }
      }
      
      // Test API connectivity with a lightweight request
      const testResponse = await fetch('/api/health', {
        method: 'GET',
        signal: AbortSignal.timeout(5000), // 5 second timeout
      });
      
      if (!testResponse.ok) {
        this.addIssue(`Health check failed with status: ${testResponse.status}`);
      }
      
      this.lastHealthCheck = Date.now();
    } catch (error) {
      this.addIssue(`Health check error: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  private addIssue(issue: string): void {
    if (!this.connectionIssues.includes(issue)) {
      this.connectionIssues.push(issue);
      console.warn(`🌐 [NetworkMonitor] Connection issue detected: ${issue}`);
    }
  }

  isConnectionHealthy(): { healthy: boolean; issues: string[]; lastCheck: number } {
    return {
      healthy: this.connectionIssues.length === 0,
      issues: [...this.connectionIssues],
      lastCheck: this.lastHealthCheck
    };
  }
} 