/**
 * Chat utilities for handling common chat operations and error handling
 */

export interface ChatError {
  type: 'NOT_FOUND' | 'NETWORK_ERROR' | 'SERVER_ERROR' | 'UNKNOWN';
  message: string;
  chatId?: string;
  code?: string;
}

/**
 * Check if a chat exists in the backend
 */
export async function checkChatExists(chatId: string): Promise<boolean> {
  try {
    const response = await fetch(`/api/chat/chats/${chatId}`);
    return response.ok;
  } catch (error) {
    console.error(`Error checking chat existence:`, error);
    return false;
  }
}

/**
 * Handle chat loading errors and provide user-friendly messages
 */
export function handleChatError(error: any, chatId?: string): ChatError {
  if (error instanceof Error) {
    // Check for specific error types
    if (error.message.includes('Chat not found') || error.message.includes('404')) {
      return {
        type: 'NOT_FOUND',
        message: 'This chat could not be found. It may have been deleted or never existed.',
        chatId,
        code: 'CHAT_NOT_FOUND'
      };
    }
    
    if (error.message.includes('fetch failed') || error.message.includes('network')) {
      return {
        type: 'NETWORK_ERROR',
        message: 'Network connection issue. Please check your internet connection and try again.',
        chatId,
        code: 'NETWORK_ERROR'
      };
    }
    
    if (error.message.includes('503') || error.message.includes('Backend')) {
      return {
        type: 'SERVER_ERROR',
        message: 'Server is temporarily unavailable. Please try again in a few moments.',
        chatId,
        code: 'SERVER_ERROR'
      };
    }
  }
  
  // Default error
  return {
    type: 'UNKNOWN',
    message: 'An unexpected error occurred. Please try again.',
    chatId,
    code: 'UNKNOWN_ERROR'
  };
}

/**
 * Validate chat ID format
 */
export function isValidChatId(chatId: string): boolean {
  // UUID v4 format validation
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  return uuidRegex.test(chatId);
}

/**
 * Clean up invalid chat references from localStorage or other storage
 */
export function cleanupInvalidChatReferences(validChatIds: string[]): void {
  try {
    // Clean up any cached chat data
    const keysToRemove: string[] = [];
    
    // Check localStorage for any cached chat data
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && key.startsWith('chat_') && key.includes('_')) {
        const chatId = key.split('_')[1];
        if (chatId && !validChatIds.includes(chatId)) {
          keysToRemove.push(key);
        }
      }
    }
    
    // Remove invalid keys
    keysToRemove.forEach(key => {
      localStorage.removeItem(key);
      console.log(`🗑️ Removed invalid chat reference: ${key}`);
    });
    
    if (keysToRemove.length > 0) {
      console.log(`🧹 Cleaned up ${keysToRemove.length} invalid chat references`);
    }
  } catch (error) {
    console.error('Error cleaning up chat references:', error);
  }
}

/**
 * Get a user-friendly error message for display
 */
export function getErrorMessage(error: ChatError): string {
  switch (error.type) {
    case 'NOT_FOUND':
      return 'Chat not found - it may have been deleted or never existed.';
    case 'NETWORK_ERROR':
      return 'Network connection issue. Please check your internet connection.';
    case 'SERVER_ERROR':
      return 'Server is temporarily unavailable. Please try again in a moment.';
    default:
      return 'An unexpected error occurred. Please try again.';
  }
}

/**
 * Retry a function with exponential backoff
 */
export async function retryWithBackoff<T>(
  fn: () => Promise<T>,
  maxRetries: number = 3,
  baseDelay: number = 1000
): Promise<T> {
  let lastError: Error;
  
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      
      if (attempt === maxRetries) {
        throw lastError;
      }
      
      // Wait before retrying with exponential backoff
      const delay = baseDelay * Math.pow(2, attempt);
      console.log(`🔄 Retrying in ${delay}ms (attempt ${attempt + 1}/${maxRetries + 1})`);
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
  
  throw lastError!;
} 