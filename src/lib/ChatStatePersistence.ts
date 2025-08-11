export interface PersistentChatState {
  id: string;
  title: string;
  messages: Array<{
    id: string;
    role: 'user' | 'assistant';
    content: string;
    timestamp: string;
    status?: 'complete' | 'streaming' | 'cancelled' | 'error' | 'pending';
  }>;
  contextFilters: {
    stateTaxCodes: string[];
    profileTags: string[];
  };
  modelSettings: {
    modelType: 'chatgpt' | 'ollama';
    model: string;
    isAsync: boolean;
    streamingEnabled: boolean;
  };
  loadingState: {
    isLoading: boolean;
    requestId: string | null;
    messageId: string | null;
    streamingContent: string;
    canCancel: boolean;
    isPaused?: boolean;
  };
  inputState: {
    currentInput: string;
    savedInput: string;
  };
  status: "ready" | "pending";
  lastUpdated: number;
  version: string;
}

export interface CrossTabEvent {
  type: 'chat:updated' | 'chat:deleted' | 'chat:created';
  chatId: string;
  timestamp: number;
  source: string;
  data?: any;
}

export class ChatStatePersistence {
  private static readonly STORAGE_KEY = 'lucatax-chat-states';
  private static readonly CROSS_TAB_KEY = 'lucatax-cross-tab-events';
  private static readonly VERSION = '1.0.0';
  private static readonly MAX_STORAGE_SIZE = 50 * 1024 * 1024; // 50MB limit
  private static readonly CLEANUP_THRESHOLD = 0.8; // Cleanup when 80% full
  
  // Cross-tab event listeners
  private static crossTabListeners: Map<string, Set<(event: CrossTabEvent) => void>> = new Map();
  private static isInitialized = false;
  private static readonly SOURCE_ID = `tab_${Date.now()}_${Math.random().toString(36).slice(2)}`;

  // Initialize cross-tab synchronization
  static initializeCrossTabSync(): void {
    if (this.isInitialized || typeof window === 'undefined') return;
    
    this.isInitialized = true;
    
    // Listen for storage events from other tabs
    window.addEventListener('storage', this.handleStorageEvent.bind(this));
    
    // Clean up old cross-tab events periodically
    setInterval(() => this.cleanupOldCrossTabEvents(), 60000); // Every minute
    
    console.log('🔄 ChatStatePersistence: Cross-tab synchronization initialized');
  }

  // Handle storage events from other tabs
  private static handleStorageEvent(event: StorageEvent): void {
    if (event.key !== this.CROSS_TAB_KEY || !event.newValue) return;
    
    try {
      const crossTabEvent: CrossTabEvent = JSON.parse(event.newValue);
      
      // Ignore events from this tab
      if (crossTabEvent.source === this.SOURCE_ID) return;
      
      console.log(`🔄 [CrossTab] Received event: ${crossTabEvent.type} for chat ${crossTabEvent.chatId}`);
      
      // Notify listeners
      this.notifyCrossTabListeners(crossTabEvent);
      
    } catch (error) {
      console.error('Failed to parse cross-tab event:', error);
    }
  }

  // Emit cross-tab event to other tabs
  private static emitCrossTabEvent(event: CrossTabEvent): void {
    if (typeof window === 'undefined') return;
    
    try {
      // Add source and timestamp
      const crossTabEvent: CrossTabEvent = {
        ...event,
        source: this.SOURCE_ID,
        timestamp: Date.now()
      };
      
      // Store the event in localStorage to trigger storage event in other tabs
      localStorage.setItem(this.CROSS_TAB_KEY, JSON.stringify(crossTabEvent));
      
      // Remove the event after a short delay to prevent accumulation
      setTimeout(() => {
        localStorage.removeItem(this.CROSS_TAB_KEY);
      }, 100);
      
    } catch (error) {
      console.error('Failed to emit cross-tab event:', error);
    }
  }

  // Add cross-tab event listener
  static onCrossTabEvent(eventType: string, listener: (event: CrossTabEvent) => void): () => void {
    if (!this.crossTabListeners.has(eventType)) {
      this.crossTabListeners.set(eventType, new Set());
    }
    
    this.crossTabListeners.get(eventType)!.add(listener);
    
    // Return unsubscribe function
    return () => {
      const listeners = this.crossTabListeners.get(eventType);
      if (listeners) {
        listeners.delete(listener);
        if (listeners.size === 0) {
          this.crossTabListeners.delete(eventType);
        }
      }
    };
  }

  // Notify cross-tab listeners
  private static notifyCrossTabListeners(event: CrossTabEvent): void {
    const listeners = this.crossTabListeners.get(event.type);
    if (listeners) {
      listeners.forEach(listener => {
        try {
          listener(event);
        } catch (error) {
          console.error('Cross-tab listener error:', error);
        }
      });
    }
  }

  // Clean up old cross-tab events
  private static cleanupOldCrossTabEvents(): void {
    try {
      const stored = localStorage.getItem(this.CROSS_TAB_KEY);
      if (!stored) return;
      
      const event: CrossTabEvent = JSON.parse(stored);
      const now = Date.now();
      const MAX_EVENT_AGE = 300000; // 5 minutes
      
      if (now - event.timestamp > MAX_EVENT_AGE) {
        localStorage.removeItem(this.CROSS_TAB_KEY);
      }
    } catch (error) {
      // Ignore cleanup errors
    }
  }

  // Save chat state to localStorage with cross-tab notification
  static saveChatState(chatId: string, state: any): boolean {
    try {
      const persistentState: PersistentChatState = {
        id: state.id,
        title: state.title,
        messages: state.messages.map((msg: any) => ({
          ...msg,
          timestamp: msg.timestamp instanceof Date ? msg.timestamp.toISOString() : msg.timestamp
        })),
        contextFilters: state.contextFilters,
        modelSettings: state.modelSettings,
        loadingState: state.loadingState,
        inputState: state.inputState,
        status: state.status,
        lastUpdated: Date.now(),
        version: this.VERSION
      };

      const existingStates = this.getAllChatStates();
      const isNew = !existingStates.has(chatId);
      existingStates.set(chatId, persistentState);

      // Check storage size and cleanup if necessary
      if (this.shouldCleanup(existingStates)) {
        this.cleanupOldStates(existingStates);
      }

      localStorage.setItem(this.STORAGE_KEY, JSON.stringify(Array.from(existingStates.entries())));
      
      // Emit cross-tab event
      this.emitCrossTabEvent({
        type: isNew ? 'chat:created' : 'chat:updated',
        chatId,
        timestamp: Date.now(),
        source: this.SOURCE_ID,
        data: { title: persistentState.title, messageCount: persistentState.messages.length }
      });
      
      return true;
    } catch (error) {
      console.error('Failed to save chat state to localStorage:', error);
      return false;
    }
  }

  // Save ChatState directly (for use with ChatInstance)
  static saveChatStateFromInstance(chatId: string, chatState: any): boolean {
    try {
      // Convert ChatState to PersistentChatState format
      const persistentState: PersistentChatState = {
        id: chatState.id || chatId,
        title: chatState.title || 'Untitled Chat',
        messages: chatState.messages?.map((msg: any) => ({
          id: msg.id,
          role: msg.role,
          content: msg.content,
          timestamp: msg.timestamp instanceof Date ? msg.timestamp.toISOString() : msg.timestamp,
          status: msg.status
        })) || [],
        contextFilters: chatState.contextFilters || {
          stateTaxCodes: [],
          profileTags: []
        },
        modelSettings: chatState.modelSettings || {
          modelType: 'ollama',
          model: 'phi3:3.8b',
          isAsync: true,
          streamingEnabled: true
        },
        loadingState: chatState.loadingState || {
          isLoading: false,
          requestId: null,
          messageId: null,
          streamingContent: '',
          canCancel: false
        },
        inputState: chatState.inputState || {
          currentInput: '',
          savedInput: ''
        },
        status: chatState.status || 'ready',
        lastUpdated: Date.now(),
        version: this.VERSION
      };

      return this.saveChatState(chatId, persistentState);
    } catch (error) {
      console.error('Failed to save chat state from instance:', error);
      return false;
    }
  }

  // Load chat state from localStorage
  static loadChatState(chatId: string): PersistentChatState | null {
    try {
      const existingStates = this.getAllChatStates();
      const state = existingStates.get(chatId);
      
      if (!state) return null;

      // Validate version compatibility
      if (state.version !== this.VERSION) {
        console.warn(`Chat state version mismatch for ${chatId}, clearing old state`);
        this.removeChatState(chatId);
        return null;
      }

      return state;
    } catch (error) {
      console.error('Failed to load chat state from localStorage:', error);
      return null;
    }
  }

  // Get all chat states
  static getAllChatStates(): Map<string, PersistentChatState> {
    try {
      const stored = localStorage.getItem(this.STORAGE_KEY);
      if (!stored) return new Map();

      const parsed = JSON.parse(stored);
      if (!Array.isArray(parsed)) return new Map();

      return new Map(parsed);
    } catch (error) {
      console.error('Failed to parse stored chat states:', error);
      return new Map();
    }
  }

  // Remove specific chat state with cross-tab notification
  static removeChatState(chatId: string): boolean {
    try {
      const existingStates = this.getAllChatStates();
      const existed = existingStates.has(chatId);
      
      if (existed) {
        existingStates.delete(chatId);
        localStorage.setItem(this.STORAGE_KEY, JSON.stringify(Array.from(existingStates.entries())));
        
        // Emit cross-tab event
        this.emitCrossTabEvent({
          type: 'chat:deleted',
          chatId,
          timestamp: Date.now(),
          source: this.SOURCE_ID
        });
      }
      
      return existed;
    } catch (error) {
      console.error('Failed to remove chat state from localStorage:', error);
      return false;
    }
  }

  // Clear all chat states with cross-tab notification
  static clearAllChatStates(): boolean {
    try {
      const existingStates = this.getAllChatStates();
      const chatIds = Array.from(existingStates.keys());
      
      localStorage.removeItem(this.STORAGE_KEY);
      
      // Emit cross-tab events for each deleted chat
      chatIds.forEach(chatId => {
        this.emitCrossTabEvent({
          type: 'chat:deleted',
          chatId,
          timestamp: Date.now(),
          source: this.SOURCE_ID
        });
      });
      
      return true;
    } catch (error) {
      console.error('Failed to clear chat states from localStorage:', error);
      return false;
    }
  }

  // Check if storage cleanup is needed
  private static shouldCleanup(states: Map<string, PersistentChatState>): boolean {
    try {
      const serialized = JSON.stringify(Array.from(states.entries()));
      const size = new Blob([serialized]).size;
      return size > this.MAX_STORAGE_SIZE * this.CLEANUP_THRESHOLD;
    } catch {
      return false;
    }
  }

  // Cleanup old states to free up storage
  private static cleanupOldStates(states: Map<string, PersistentChatState>): void {
    try {
      const sortedStates = Array.from(states.entries())
        .sort((a, b) => a[1].lastUpdated - b[1].lastUpdated);

      // Remove oldest states until we're under threshold
      while (sortedStates.length > 0) {
        const [chatId] = sortedStates.shift()!;
        states.delete(chatId);
        
        const serialized = JSON.stringify(Array.from(states.entries()));
        const size = new Blob([serialized]).size;
        
        if (size < this.MAX_STORAGE_SIZE * this.CLEANUP_THRESHOLD) {
          break;
        }
      }

      console.log(`Cleaned up chat states, remaining: ${states.size}`);
    } catch (error) {
      console.error('Failed to cleanup old chat states:', error);
    }
  }

  // Get storage usage statistics
  static getStorageStats(): { used: number; total: number; percentage: number } {
    try {
      const states = this.getAllChatStates();
      const serialized = JSON.stringify(Array.from(states.entries()));
      const used = new Blob([serialized]).size;
      const total = this.MAX_STORAGE_SIZE;
      const percentage = (used / total) * 100;

      return { used, total, percentage };
    } catch {
      return { used: 0, total: this.MAX_STORAGE_SIZE, percentage: 0 };
    }
  }

  // Check if a chat state exists
  static hasChatState(chatId: string): boolean {
    const states = this.getAllChatStates();
    return states.has(chatId);
  }

  // Get chat state metadata (without full content)
  static getChatStateMetadata(chatId: string): { title: string; lastUpdated: number; messageCount: number } | null {
    const state = this.loadChatState(chatId);
    if (!state) return null;

    return {
      title: state.title,
      lastUpdated: state.lastUpdated,
      messageCount: state.messages.length
    };
  }

  // Enhanced method to get chat state with automatic recovery
  static getChatStateWithRecovery(chatId: string): { state: PersistentChatState | null; recovered: boolean } {
    try {
      // First try to get from local storage
      const localState = this.loadChatState(chatId);
      if (localState) {
        return { state: localState, recovered: false };
      }
      
      // If not found locally, try to get from cross-tab storage
      const remoteState = this.getRemoteChatState(chatId);
      if (remoteState) {
        // Save the remote state locally for future use
        this.saveChatState(chatId, remoteState);
        return { state: remoteState, recovered: true };
      }
      
      return { state: null, recovered: false };
    } catch (error) {
      console.error('Error getting chat state with recovery:', error);
      return { state: null, recovered: false };
    }
  }

  // Enhanced recovery for tab switches with state validation
  static recoverChatStateAfterTabSwitch(chatId: string): { state: PersistentChatState | null; recovered: boolean; conflicts: boolean } {
    try {
      console.log(`🔄 [ChatStatePersistence] Attempting to recover chat state for ${chatId} after tab switch`);
      
      // Get local state
      const localState = this.loadChatState(chatId);
      
      // Get remote state from other tabs
      const remoteState = this.getRemoteChatState(chatId);
      
      if (!localState && !remoteState) {
        console.log(`📝 [ChatStatePersistence] No state found for chat ${chatId}`);
        return { state: null, recovered: false, conflicts: false };
      }
      
      if (localState && !remoteState) {
        console.log(`📝 [ChatStatePersistence] Using local state for chat ${chatId}`);
        return { state: localState, recovered: false, conflicts: false };
      }
      
      if (!localState && remoteState) {
        console.log(`📝 [ChatStatePersistence] Recovered remote state for chat ${chatId}`);
        this.saveChatState(chatId, remoteState);
        return { state: remoteState, recovered: true, conflicts: false };
      }
      
      // Both states exist, check for conflicts
      if (localState && remoteState) {
        const conflictResult = this.detectConflicts(localState, remoteState);
        
        if (conflictResult.hasConflicts) {
          console.log(`⚠️ [ChatStatePersistence] Conflicts detected for chat ${chatId}, using timestamp-based resolution`);
          
          // Use timestamp-based resolution for conflicts
          const resolvedState = this.mergeChatStates(localState, remoteState, 'timestamp-wins');
          this.saveChatState(chatId, resolvedState);
          
          return { state: resolvedState, recovered: true, conflicts: true };
        } else {
          // No conflicts, use the more recent state
          const useLocal = localState.lastUpdated > remoteState.lastUpdated;
          const finalState = useLocal ? localState : remoteState;
          
          if (!useLocal) {
            // Update local storage with remote state
            this.saveChatState(chatId, remoteState);
          }
          
          console.log(`📝 [ChatStatePersistence] Recovered remote state for chat ${chatId}`);
          return { state: finalState, recovered: !useLocal, conflicts: false };
        }
      }
      
      return { state: null, recovered: false, conflicts: false };
    } catch (error) {
      console.error('Error recovering chat state after tab switch:', error);
      return { state: null, recovered: false, conflicts: false };
    }
  }

  // Update only specific parts of a chat state
  static updateChatStatePartial(chatId: string, updates: Partial<PersistentChatState>): boolean {
    try {
      const existingState = this.loadChatState(chatId);
      if (!existingState) return false;

      const updatedState = {
        ...existingState,
        ...updates,
        lastUpdated: Date.now()
      };

      return this.saveChatState(chatId, updatedState);
    } catch (error) {
      console.error('Failed to update chat state partially:', error);
      return false;
    }
  }

  // Check for conflicts between local and remote chat states
  static detectConflicts(localState: PersistentChatState, remoteState: PersistentChatState): {
    hasConflicts: boolean;
    conflicts: Array<{
      field: string;
      localValue: any;
      remoteValue: any;
      severity: 'low' | 'medium' | 'high';
    }>;
  } {
    const conflicts: Array<{
      field: string;
      localValue: any;
      remoteValue: any;
      severity: 'low' | 'medium' | 'high';
    }> = [];

    // Check for message conflicts
    if (localState.messages.length !== remoteState.messages.length) {
      conflicts.push({
        field: 'messages',
        localValue: localState.messages.length,
        remoteValue: remoteState.messages.length,
        severity: 'high'
      });
    }

    // Check for title conflicts
    if (localState.title !== remoteState.title) {
      conflicts.push({
        field: 'title',
        localValue: localState.title,
        remoteValue: remoteState.title,
        severity: 'low'
      });
    }

    // Check for context filter conflicts
    const localFilters = JSON.stringify(localState.contextFilters);
    const remoteFilters = JSON.stringify(remoteState.contextFilters);
    if (localFilters !== remoteFilters) {
      conflicts.push({
        field: 'contextFilters',
        localValue: localState.contextFilters,
        remoteValue: remoteState.contextFilters,
        severity: 'medium'
      });
    }

    // Check for model setting conflicts
    const localSettings = JSON.stringify(localState.modelSettings);
    const remoteSettings = JSON.stringify(remoteState.modelSettings);
    if (localSettings !== remoteSettings) {
      conflicts.push({
        field: 'modelSettings',
        localValue: localState.modelSettings,
        remoteValue: remoteState.modelSettings,
        severity: 'medium'
      });
    }

    return {
      hasConflicts: conflicts.length > 0,
      conflicts
    };
  }

  // Merge chat states with conflict resolution
  static mergeChatStates(
    localState: PersistentChatState, 
    remoteState: PersistentChatState,
    strategy: 'local-wins' | 'remote-wins' | 'timestamp-wins' | 'merge' = 'timestamp-wins'
  ): PersistentChatState {
    const conflicts = this.detectConflicts(localState, remoteState);
    
    if (!conflicts.hasConflicts) {
      return localState; // No conflicts, return local state
    }

    console.log(`🔄 [ConflictResolution] Merging chat ${localState.id} with ${conflicts.conflicts.length} conflicts`);

    let mergedState: PersistentChatState;

    switch (strategy) {
      case 'local-wins':
        mergedState = { ...localState };
        break;
        
      case 'remote-wins':
        mergedState = { ...remoteState };
        break;
        
      case 'timestamp-wins':
        mergedState = localState.lastUpdated > remoteState.lastUpdated ? localState : remoteState;
        break;
        
      case 'merge':
        mergedState = this.performSmartMerge(localState, remoteState, conflicts);
        break;
        
      default:
        mergedState = localState;
    }

    // Update timestamp to indicate merge
    mergedState.lastUpdated = Date.now();
    
    console.log(`✅ [ConflictResolution] Successfully merged chat ${localState.id}`);
    return mergedState;
  }

  // Perform smart merging based on conflict severity
  private static performSmartMerge(
    localState: PersistentChatState, 
    remoteState: PersistentChatState,
    conflicts: { hasConflicts: boolean; conflicts: Array<any> }
  ): PersistentChatState {
    let mergedState = { ...localState };

    for (const conflict of conflicts.conflicts) {
      switch (conflict.field) {
        case 'messages':
          // For messages, use the longer conversation (more complete)
          if (remoteState.messages.length > localState.messages.length) {
            mergedState.messages = remoteState.messages;
            console.log(`🔄 [Merge] Using remote messages (${remoteState.messages.length} vs ${localState.messages.length})`);
          }
          break;
          
        case 'title':
          // For title, use the more recent one
          if (remoteState.lastUpdated > localState.lastUpdated) {
            mergedState.title = remoteState.title;
            console.log(`🔄 [Merge] Using remote title: "${remoteState.title}"`);
          }
          break;
          
        case 'contextFilters':
          // For context filters, merge arrays and remove duplicates
          const mergedFilters = {
            stateTaxCodes: [...new Set([
              ...localState.contextFilters.stateTaxCodes,
              ...remoteState.contextFilters.stateTaxCodes
            ])],
            profileTags: [...new Set([
              ...localState.contextFilters.profileTags,
              ...remoteState.contextFilters.profileTags
            ])]
          };
          mergedState.contextFilters = mergedFilters;
          console.log(`🔄 [Merge] Merged context filters`);
          break;
          
        case 'modelSettings':
          // For model settings, use the more recent one
          if (remoteState.lastUpdated > localState.lastUpdated) {
            mergedState.modelSettings = remoteState.modelSettings;
            console.log(`🔄 [Merge] Using remote model settings`);
          }
          break;
      }
    }

    return mergedState;
  }

  // Get chat state with automatic conflict resolution
  static getChatStateWithConflictResolution(
    chatId: string, 
    strategy: 'local-wins' | 'remote-wins' | 'timestamp-wins' | 'merge' = 'timestamp-wins'
  ): { state: PersistentChatState | null; hadConflicts: boolean } {
    try {
      const localState = this.loadChatState(chatId);
      if (!localState) return { state: null, hadConflicts: false };

      // Check if there's a remote state (from another tab)
      const remoteState = this.getRemoteChatState(chatId);
      if (!remoteState) return { state: localState, hadConflicts: false };

      const conflicts = this.detectConflicts(localState, remoteState);
      if (!conflicts.hasConflicts) return { state: localState, hadConflicts: false };

      // Resolve conflicts
      const mergedState = this.mergeChatStates(localState, remoteState, strategy);
      
      // Save the merged state
      this.saveChatState(chatId, mergedState);
      
      return { state: mergedState, hadConflicts: true };
    } catch (error) {
      console.error('Failed to get chat state with conflict resolution:', error);
      return { state: null, hadConflicts: false };
    }
  }

  // Get remote chat state (simulated for now, could be enhanced with actual remote sync)
  private static getRemoteChatState(chatId: string): PersistentChatState | null {
    // This is a placeholder for actual remote state retrieval
    // In a real implementation, this could fetch from a server or other tabs
    return null;
  }

  // Export the class for use in other modules
  static getInstance(): ChatStatePersistence {
    return new ChatStatePersistence();
  }
}
