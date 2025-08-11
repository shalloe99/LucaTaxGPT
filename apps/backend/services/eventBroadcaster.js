const EventEmitter = require('events');

/**
 * Event broadcaster for real-time chat updates
 * Manages WebSocket/SSE subscriptions and broadcasts events to connected clients
 */
class EventBroadcaster extends EventEmitter {
  constructor() {
    super();
    this.subscribers = new Map(); // chatId -> Set of response objects (SSE connections)
    this.chatSubscriptions = new Map(); // chatId -> Set of connection IDs
    this.connections = new Map(); // connectionId -> { res, chatId, connectedAt }
    
    console.log('📡 [EventBroadcaster] Initialized');
    
    // Clean up disconnected connections periodically
    setInterval(() => {
      this.cleanupDisconnectedConnections();
    }, 30000); // Every 30 seconds
  }

  /**
   * Subscribe a client to chat events via SSE
   */
  subscribe(chatId, res, connectionId = null) {
    if (!connectionId) {
      connectionId = `conn_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }
    
    console.log(`📡 [EventBroadcaster] Client ${connectionId} subscribing to chat ${chatId}`);
    
    // Initialize subscribers set for chat if not exists
    if (!this.subscribers.has(chatId)) {
      this.subscribers.set(chatId, new Set());
      this.chatSubscriptions.set(chatId, new Set());
    }
    
    // Add connection
    this.connections.set(connectionId, {
      res,
      chatId,
      connectedAt: Date.now(),
      isActive: true
    });
    
    // Add to chat subscribers
    this.subscribers.get(chatId).add(res);
    this.chatSubscriptions.get(chatId).add(connectionId);
    
    // Set up SSE headers with anti-buffering directives
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Headers', 'Cache-Control');
    res.setHeader('X-Accel-Buffering', 'no'); // Disable nginx buffering
    res.setHeader('Transfer-Encoding', 'chunked'); // Enable chunked transfer
    
    // Send initial connection event
    this.sendSSEEvent(res, 'connected', {
      connectionId,
      chatId,
      timestamp: Date.now()
    });
    
    // Handle client disconnect
    res.on('close', () => {
      this.unsubscribe(chatId, connectionId);
    });
    
    res.on('error', (error) => {
      console.error(`❌ [EventBroadcaster] SSE connection error for ${connectionId}:`, error);
      this.unsubscribe(chatId, connectionId);
    });
    
    console.log(`📡 [EventBroadcaster] Client ${connectionId} subscribed to chat ${chatId}. Total subscribers: ${this.subscribers.get(chatId).size}`);
    
    return connectionId;
  }

  /**
   * Unsubscribe a client from chat events
   */
  unsubscribe(chatId, connectionId) {
    console.log(`📡 [EventBroadcaster] Unsubscribing client ${connectionId} from chat ${chatId}`);
    
    const connection = this.connections.get(connectionId);
    if (connection) {
      connection.isActive = false;
      
      // Remove from subscribers
      if (this.subscribers.has(chatId)) {
        this.subscribers.get(chatId).delete(connection.res);
        
        // Clean up empty subscriber sets
        if (this.subscribers.get(chatId).size === 0) {
          this.subscribers.delete(chatId);
          this.chatSubscriptions.delete(chatId);
          console.log(`📡 [EventBroadcaster] No more subscribers for chat ${chatId}, cleaned up`);
        }
      }
      
      // Remove from chat subscriptions
      if (this.chatSubscriptions.has(chatId)) {
        this.chatSubscriptions.get(chatId).delete(connectionId);
      }
      
      // Remove connection
      this.connections.delete(connectionId);
    }
    
    const remainingSubscribers = this.subscribers.get(chatId)?.size || 0;
    console.log(`📡 [EventBroadcaster] Client ${connectionId} unsubscribed. Remaining subscribers for chat ${chatId}: ${remainingSubscribers}`);
  }

  /**
   * Broadcast a token chunk to all subscribers of a chat - IMMEDIATE DELIVERY
   */
  broadcastToken(chatId, tokenData) {
    const subscribers = this.subscribers.get(chatId);
    if (!subscribers || subscribers.size === 0) {
      return;
    }
    
    const eventData = {
      type: 'token',
      content: tokenData.content,
      messageId: tokenData.messageId,
      timestamp: tokenData.timestamp || Date.now()
    };
    
    // IMMEDIATE BROADCAST - no async waiting
    this.broadcastToChat(chatId, 'token', eventData);
  }

  /**
   * Broadcast message completion to all subscribers of a chat
   */
  broadcastMessageComplete(chatId, messageData) {
    const eventData = {
      type: 'message_complete',
      messageId: messageData.messageId,
      finalContent: messageData.finalContent,
      timestamp: messageData.timestamp || Date.now()
    };
    
    this.broadcastToChat(chatId, 'message_complete', eventData);
  }

  /**
   * Broadcast message cancellation to all subscribers of a chat
   */
  broadcastMessageCancelled(chatId, messageData) {
    const eventData = {
      type: 'message_cancelled',
      messageId: messageData.messageId,
      partialContent: messageData.partialContent,
      timestamp: messageData.timestamp || Date.now()
    };
    
    this.broadcastToChat(chatId, 'message_cancelled', eventData);
  }

  /**
   * Broadcast an event to all subscribers of a chat - IMMEDIATE SYNCHRONOUS DELIVERY
   */
  broadcastToChat(chatId, eventType, data) {
    const subscribers = this.subscribers.get(chatId);
    if (!subscribers || subscribers.size === 0) {
      return;
    }
    
    const disconnectedConnections = [];
    
    // Synchronous immediate delivery to all subscribers
    for (const res of subscribers) {
      try {
        this.sendSSEEvent(res, eventType, data);
      } catch (error) {
        disconnectedConnections.push(res);
      }
    }
    
    // Clean up disconnected connections asynchronously to not block delivery
    if (disconnectedConnections.length > 0) {
      process.nextTick(() => {
        disconnectedConnections.forEach(res => {
          subscribers.delete(res);
        });
      });
    }
  }

  /**
   * Send an SSE event to a response object with immediate flushing
   */
  sendSSEEvent(res, eventType, data) {
    try {
      const eventString = `event: ${eventType}\ndata: ${JSON.stringify(data)}\n\n`;
      res.write(eventString);
      
      // Force immediate flush for real-time delivery
      if (res.flush && typeof res.flush === 'function') {
        res.flush();
      }
    } catch (error) {
      console.error(`❌ [EventBroadcaster] Failed to write SSE event:`, error);
      throw error;
    }
  }

  /**
   * Get subscription stats
   */
  getStats() {
    const chatCount = this.subscribers.size;
    let totalSubscribers = 0;
    
    for (const subscribers of this.subscribers.values()) {
      totalSubscribers += subscribers.size;
    }
    
    return {
      totalChats: chatCount,
      totalSubscribers,
      activeConnections: this.connections.size,
      chatSubscriptions: Array.from(this.subscribers.keys()).map(chatId => ({
        chatId,
        subscriberCount: this.subscribers.get(chatId).size
      }))
    };
  }

  /**
   * Clean up disconnected connections
   */
  cleanupDisconnectedConnections() {
    let cleaned = 0;
    const now = Date.now();
    const CLEANUP_TIMEOUT = 5 * 60 * 1000; // 5 minutes
    
    for (const [connectionId, connection] of this.connections.entries()) {
      if (!connection.isActive || (now - connection.connectedAt) > CLEANUP_TIMEOUT) {
        if (connection.res && !connection.res.destroyed) {
          try {
            connection.res.end();
          } catch (error) {
            // Connection already closed
          }
        }
        
        this.unsubscribe(connection.chatId, connectionId);
        cleaned++;
      }
    }
    
    if (cleaned > 0) {
      console.log(`🧹 [EventBroadcaster] Cleaned up ${cleaned} disconnected connections`);
    }
  }

  /**
   * Check if a chat has active subscribers
   */
  hasSubscribers(chatId) {
    const subscribers = this.subscribers.get(chatId);
    return subscribers && subscribers.size > 0;
  }

  /**
   * Get subscriber count for a chat
   */
  getSubscriberCount(chatId) {
    const subscribers = this.subscribers.get(chatId);
    return subscribers ? subscribers.size : 0;
  }
}

module.exports = EventBroadcaster;
