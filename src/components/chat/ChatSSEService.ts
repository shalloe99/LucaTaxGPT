import { flushSync } from 'react-dom';

interface ChatSSEServiceCallbacks {
  updateStreamingMessage?: (messageId: string, content: string, status?: 'streaming' | 'complete' | 'cancelled' | 'error') => void;
  onChatContextUpdate?: (updated: any) => void;
  scrollToBottom: () => void;
  setIsLoading: (loading: boolean) => void;
  setAbortController: (controller: AbortController | null) => void;
  setForceRender: (updater: (prev: number) => number) => void;
}

export class ChatSSEService {
  private updateTimeoutRef: NodeJS.Timeout | null = null;
  private streamingMessageRef: { id: string; content: string } | null = null;

  async subscribeToAsyncUpdates(
    chatId: string,
    messageId: string,
    abortController: AbortController,
    callbacks: ChatSSEServiceCallbacks,
    isUserNearBottom: boolean
  ) {
    try {
      console.log(`📡 [${chatId}] Starting SSE subscription for message ${messageId}`);
      
      // Create a timeout signal separate from the abort controller for SSE connection
      const sseTimeoutMs = 300000; // 5 minute timeout for SSE connection (same as backend timeout)
      const timeoutSignal = AbortSignal.timeout(sseTimeoutMs);
      const combinedSignal = AbortSignal.any([abortController.signal, timeoutSignal]);
      
      const response = await fetch(`/api/chat/user/messaging/${chatId}/subscribe`, {
        signal: combinedSignal,
        headers: {
          'Accept': 'text/event-stream',
          'Cache-Control': 'no-cache, no-transform',
          'Connection': 'keep-alive',
          'X-Requested-With': 'XMLHttpRequest'
        }
      });
      
      if (!response.ok) {
        throw new Error(`SSE subscription failed: ${response.status} ${response.statusText}`);
      }
      
      const reader = response.body?.getReader();
      if (!reader) {
        throw new Error('No response body for SSE');
      }
      
      const decoder = new TextDecoder();
      let accumulatedContent = '';
      
      console.log(`📡 [${chatId}] SSE connection established, waiting for events...`);
      
      let lastEventTime = Date.now();
      let hasReceivedEvents = false;
      
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) {
            console.log(`📡 [${chatId}] SSE stream ended`);
            break;
          }
          
          const chunk = decoder.decode(value, { stream: true });
          console.log(`📡 [${chatId}] SSE chunk received:`, chunk);
          const lines = chunk.split('\n');
          
          let currentEvent = '';
          
          for (const line of lines) {
            if (line.startsWith('event: ')) {
              currentEvent = line.slice(7).trim();
              continue;
            }
            
            if (line.startsWith('data: ')) {
              const data = line.slice(6).trim();
              if (!data) continue;
              
              // Skip ping events
              if (currentEvent === 'ping') {
                continue;
              }
              
              try {
                const eventData = JSON.parse(data);
                
                // Only log non-token events for clean console
                const isTokenEvent = (currentEvent === 'token' || eventData.type === 'token');
                if (!isTokenEvent) {
                  console.log(`📡 [${chatId}] SSE event received:`, { currentEvent, eventData, targetMessageId: messageId });
                }
                
                if (isTokenEvent && eventData.messageId === messageId) {
                  // Update message status to streaming and append content
                  hasReceivedEvents = true;
                  lastEventTime = Date.now();
                  accumulatedContent += eventData.content;
                  
                  // Update streaming message ref for immediate access
                  this.streamingMessageRef = { id: messageId, content: accumulatedContent };
                  
                  // Update ChatInstance state for proper React re-renders with immediate flush
                  if (callbacks.updateStreamingMessage) {
                    console.log(`🔄 [ChatbotPanel] Calling updateStreamingMessage for ${messageId}: ${accumulatedContent.length} chars`);
                    flushSync(() => {
                      callbacks.updateStreamingMessage(messageId, accumulatedContent, 'streaming');
                      // Force immediate re-render to prevent tab-switch dependency
                      callbacks.setForceRender(prev => prev + 1);
                    });
                  } else {
                    console.warn(`⚠️ [ChatbotPanel] updateStreamingMessage not available for ${messageId}`);
                  }
                  
                  // Only auto-scroll if the user is near bottom
                  if (isUserNearBottom) {
                    callbacks.scrollToBottom();
                  }
                  
                } else if ((currentEvent === 'message_complete' || eventData.type === 'message_complete') && eventData.messageId === messageId) {
                  // Clear any pending debounced updates
                  if (this.updateTimeoutRef) {
                    clearTimeout(this.updateTimeoutRef);
                    this.updateTimeoutRef = null;
                  }
                  
                  // Clear streaming ref
                  this.streamingMessageRef = null;
                  
                  // Mark message as complete
                  console.log(`✅ [${chatId}] Message ${messageId} completed via SSE`);
                  
                  // Update ChatInstance state for message completion with immediate flush
                  if (callbacks.updateStreamingMessage) {
                    flushSync(() => {
                      callbacks.updateStreamingMessage(messageId, eventData.finalContent || accumulatedContent, 'complete');
                      // Force final re-render for completion
                      callbacks.setForceRender(prev => prev + 1);
                    });
                  }
                  
                  // Notify parent to refresh context without duplicating messages
                  if (callbacks.onChatContextUpdate) {
                    callbacks.onChatContextUpdate({ id: chatId });
                  }
                  
                  // Reset loading state and abort controller to change button back to "Send"
                  callbacks.setIsLoading(false);
                  callbacks.setAbortController(null);
                  break;
                  
                } else if ((currentEvent === 'message_cancelled' || eventData.type === 'message_cancelled') && eventData.messageId === messageId) {
                  // Clear any pending debounced updates
                  if (this.updateTimeoutRef) {
                    clearTimeout(this.updateTimeoutRef);
                    this.updateTimeoutRef = null;
                  }
                  
                  // Clear streaming ref
                  this.streamingMessageRef = null;
                  
                  // Mark message as cancelled
                  console.log(`🛑 [${chatId}] Message ${messageId} cancelled via SSE`);
                  
                  // Update ChatInstance state for message cancellation
                  if (callbacks.updateStreamingMessage) {
                    callbacks.updateStreamingMessage(messageId, eventData.partialContent || accumulatedContent, 'cancelled');
                  }
                  
                  // Reset loading state and abort controller to change button back to "Send"
                  callbacks.setIsLoading(false);
                  callbacks.setAbortController(null);
                  break;
                }
                
              } catch (parseError) {
                console.warn('Failed to parse SSE event data:', parseError);
              }
            }
          }
        }
      } finally {
        reader.releaseLock();
        
        // Clean up any pending debounced updates
        if (this.updateTimeoutRef) {
          clearTimeout(this.updateTimeoutRef);
          this.updateTimeoutRef = null;
        }
        
        // Clear streaming ref
        this.streamingMessageRef = null;
        
        // If SSE stream ended but we didn't receive any events, check backend for final result
        if (!hasReceivedEvents) {
          console.log(`📡 [${chatId}] SSE ended without receiving events, checking backend for result...`);
          
          // Fallback: poll backend for the final message content
          setTimeout(async () => {
            try {
              const response = await fetch(`/api/chat/chats/${chatId}`);
              if (response.ok) {
                const chatData = await response.json();
                const assistantMessage = chatData.messages.find((m: any) => m.id === messageId);
                
                if (assistantMessage && assistantMessage.status === 'complete' && assistantMessage.content) {
                  console.log(`📡 [${chatId}] Found completed message in backend, updating UI`);
                  // Update ChatInstance state for fallback completion
                  if (callbacks.updateStreamingMessage) {
                    callbacks.updateStreamingMessage(messageId, assistantMessage.content, 'complete');
                  }
                  callbacks.setIsLoading(false);
                  callbacks.setAbortController(null);
                }
              }
            } catch (error) {
              console.error(`❌ [${chatId}] Failed to check backend for final result:`, error);
            }
          }, 1000); // Check after 1 second
        }
      }
      
    } catch (error) {
      // Clean up any pending updates and streaming ref
      if (this.updateTimeoutRef) {
        clearTimeout(this.updateTimeoutRef);
        this.updateTimeoutRef = null;
      }
      this.streamingMessageRef = null;
      
      if (abortController.signal.aborted) {
        console.log(`📡 [${chatId}] SSE subscription cancelled`);
      } else {
        console.error(`❌ [${chatId}] SSE subscription error:`, error);
        
        // Update ChatInstance state for SSE error
        if (callbacks.updateStreamingMessage) {
          callbacks.updateStreamingMessage(messageId, 'Failed to connect for real-time updates. Please try again.', 'error');
        }
      }
      
      // Always reset loading state and abort controller to ensure button returns to "Send"
      callbacks.setIsLoading(false);
      callbacks.setAbortController(null);
    }
  }

  getStreamingMessageRef() {
    return this.streamingMessageRef;
  }

  clearStreamingMessageRef() {
    this.streamingMessageRef = null;
  }
}
