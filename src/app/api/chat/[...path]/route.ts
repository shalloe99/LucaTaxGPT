import { NextRequest, NextResponse } from 'next/server';

// Track backend startup state
let backendStartupTime = 0;
let lastBackendError = 0;
const BACKEND_STARTUP_TIMEOUT = 30000; // 30 seconds
const RETRY_COOLDOWN = 2000; // 2 seconds between retries - faster retry for better UX
const MAX_RETRIES = 5; // More retry attempts for long AI requests
const LONG_REQUEST_TIMEOUT = 300000; // 5 minutes for very long AI requests

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ path: string[] }> }
) {
  const resolvedParams = await params;
  const path = resolvedParams.path.join('/');
  const url = new URL(request.url);
  const backendUrl = `http://localhost:5300/api/chat/${path}${url.search}`;

  // Check if we should skip this request due to recent backend errors
  const now = Date.now();
  if (lastBackendError > 0 && now - lastBackendError < RETRY_COOLDOWN) {
    console.log(`⏸️ [API Proxy] Skipping request to ${path} due to recent backend error (cooldown: ${Math.ceil((RETRY_COOLDOWN - (now - lastBackendError)) / 1000)}s remaining)`);
    return NextResponse.json(
      { 
        error: 'Backend is restarting, please wait a moment',
        retryAfter: Math.ceil((RETRY_COOLDOWN - (now - lastBackendError)) / 1000),
        backendRestarting: true
      },
      { 
        status: 503,
        headers: {
          'Retry-After': Math.ceil((RETRY_COOLDOWN - (now - lastBackendError)) / 1000).toString()
        }
      }
    );
  }

  try {
    const response = await fetch(backendUrl, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'text/event-stream, application/json',
      },
      signal: AbortSignal.timeout(300000), // 5 minute timeout for GET requests (SSE connections need longer timeout)
    });

    // Reset error tracking on success
    lastBackendError = 0;

    // Check if this is an SSE response
    const contentType = response.headers.get('content-type');
    if (contentType?.includes('text/event-stream')) {
      // Handle SSE streaming response
      const stream = response.body;
      if (!stream) {
        throw new Error('No response body for SSE');
      }
      
      // Create a ReadableStream that properly handles the backend SSE stream
      const readableStream = new ReadableStream({
        async start(controller) {
          const reader = stream.getReader();
          
          try {
            while (true) {
              const { done, value } = await reader.read();
              if (done) {
                controller.close();
                break;
              }
              
                              // IMMEDIATE DELIVERY: Pass through the chunk as-is to maintain SSE format
                controller.enqueue(value);
            }
          } catch (error) {
            console.error('SSE stream processing error:', error);
            controller.error(error);
          } finally {
            reader.releaseLock();
          }
        },
        cancel() {
          // Handle cancellation
          console.log('SSE stream cancelled by client');
        }
      });
      
      return new Response(readableStream, {
        headers: {
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache, no-transform',
          'Connection': 'keep-alive',
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Headers': 'Cache-Control',
          'X-Accel-Buffering': 'no', // Disable nginx buffering
          'Keep-Alive': 'timeout=900, max=1000',
        },
      });
    }

    // Check if response is ok before trying to parse JSON
    if (!response.ok) {
      const errorText = await response.text();
      console.error(`❌ [API Proxy] Backend error for ${path}:`, response.status, errorText);
      
      // Special handling for 404 errors (chat not found)
      if (response.status === 404) {
        // Check if this is a chat request
        if (path.startsWith('chats/')) {
          const chatId = path.split('/')[1];
          console.log(`📝 [API Proxy] Chat not found: ${chatId}, returning 404 with helpful message`);
          return NextResponse.json(
            { 
              error: 'Chat not found',
              message: 'The requested chat could not be found. It may have been deleted or never existed.',
              chatId,
              code: 'CHAT_NOT_FOUND'
            },
            { status: 404 }
          );
        }
      }
      
      return NextResponse.json(
        { error: `Backend error: ${response.status} ${response.statusText}` },
        { status: response.status }
      );
    }

    // Try to parse JSON, but handle non-JSON responses gracefully
    let data;
    const responseContentType = response.headers.get('content-type');
    if (responseContentType && responseContentType.includes('application/json')) {
      data = await response.json();
    } else {
      // If not JSON, get the text and try to parse it
      const text = await response.text();
      try {
        data = JSON.parse(text);
      } catch (parseError) {
        console.error(`❌ [API Proxy] Non-JSON response for ${path}:`, text);
        return NextResponse.json(
          { error: 'Backend returned non-JSON response' },
          { status: 500 }
        );
      }
    }
    
    return NextResponse.json(data, { status: response.status });
  } catch (error) {
    lastBackendError = now;
    console.error(`❌ [API Proxy] Error for ${path}:`, error);
    
    // Check if this is a backend startup error
    const isStartupError = error instanceof Error && (
      error.message.includes('ECONNREFUSED') ||
      error.message.includes('fetch failed') ||
      error.message.includes('other side closed')
    );
    
    if (isStartupError) {
      return NextResponse.json(
        { 
          error: 'Backend is starting up, please try again in a few seconds',
          retryAfter: Math.ceil(RETRY_COOLDOWN / 1000)
        },
        { 
          status: 503,
          headers: {
            'Retry-After': Math.ceil(RETRY_COOLDOWN / 1000).toString()
          }
        }
      );
    }
    
    return NextResponse.json(
      { error: 'Backend service unavailable' },
      { status: 503 }
    );
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ path: string[] }> }
) {
  const resolvedParams = await params;
  const path = resolvedParams.path.join('/');
  const url = new URL(request.url);
  const backendUrl = `http://localhost:5300/api/chat/${path}${url.search}`;

  // Check if we should skip this request due to recent backend errors
  const now = Date.now();
  if (lastBackendError > 0 && now - lastBackendError < RETRY_COOLDOWN) {
    console.log(`⏸️ [API Proxy] Skipping POST request to ${path} due to recent backend error (cooldown: ${Math.ceil((RETRY_COOLDOWN - (now - lastBackendError)) / 1000)}s remaining)`);
    return NextResponse.json(
      { 
        error: 'Backend is restarting, please wait a moment',
        retryAfter: Math.ceil((RETRY_COOLDOWN - (now - lastBackendError)) / 1000),
        backendRestarting: true
      },
      { 
        status: 503,
        headers: {
          'Retry-After': Math.ceil((RETRY_COOLDOWN - (now - lastBackendError)) / 1000).toString()
        }
      }
    );
  }

  // Connection monitoring
  const connectionMonitor = {
    startTime: Date.now(),
    clientConnected: true,
    issues: [] as string[]
  };

  let body: any;
  let isSyncRequest: boolean;
  
  try {
    body = await request.json();
    
    // Check if this is a sync request vs async mode
    // Async mode: mode === 'async' -> returns immediate JSON response 
    // Sync mode: mode !== 'async' && stream === true -> returns streaming response
    // Non-streaming: stream === false -> returns JSON response
    isSyncRequest = body.mode === 'async' || body.stream === false;
    
    // Debug: Log the request parameters to see what's being sent
    console.log(`🔍 [API Proxy] Request body parameters:`, {
      stream: body.stream,
      mode: body.mode,
      modelType: body.modelType,
      model: body.model,
      isSyncRequest
    });
    
    // Set appropriate timeout based on request type - longer for streaming AI requests
    const timeout = isSyncRequest ? LONG_REQUEST_TIMEOUT : LONG_REQUEST_TIMEOUT; // 5 minutes for both
    
    const requestType = body.mode === 'async' ? 'ASYNC' : (body.stream === false ? 'SYNC' : 'STREAMING');
    console.log(`🚀 [API Proxy] ${requestType} request to ${path}, timeout: ${timeout}ms`);
    
    const response = await fetchWithRetry(backendUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Client-Request-Type': requestType.toLowerCase(),
        'X-Request-Timeout': timeout.toString(),
        'X-Client-Start-Time': connectionMonitor.startTime.toString()
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(timeout),
    }, MAX_RETRIES);

    // Reset error tracking on success
    lastBackendError = 0;

    // Check if this is a streaming response
    const contentType = response.headers.get('content-type');
    console.log(`🔍 [API Proxy] Response content-type: ${contentType}, isSyncRequest: ${isSyncRequest}`);
    
    if (contentType?.includes('text/event-stream')) {
      // Handle streaming response with proper connection management
      const stream = response.body;
      if (!stream) {
        throw new Error('No response body');
      }
      
      // Create a ReadableStream that properly handles the backend stream
      const readableStream = new ReadableStream({
        async start(controller) {
          const reader = stream.getReader();
          const decoder = new TextDecoder();
          
          try {
            while (true) {
              const { done, value } = await reader.read();
              if (done) {
                controller.close();
                break;
              }
              
                              // IMMEDIATE DELIVERY: Pass through the chunk as-is to maintain SSE format
                controller.enqueue(value);
            }
          } catch (error) {
            console.error('Stream processing error:', error);
            controller.error(error);
          } finally {
            reader.releaseLock();
          }
        },
        cancel() {
          // Handle cancellation
          console.log('Stream cancelled by client');
        }
      });
      
      console.log(`✅ [API Proxy] STREAMING response established for ${path}`);
      
      return new Response(readableStream, {
        headers: {
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache, no-transform',
          'Connection': 'keep-alive',
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Headers': 'Cache-Control',
          'X-Accel-Buffering': 'no', // Disable nginx buffering
          'Keep-Alive': 'timeout=900, max=1000',
        },
      });
    } else {
      // Handle JSON response for sync requests
      const data = await response.json();
      
      // Add connection health information to response
      const processingTime = Date.now() - connectionMonitor.startTime;
      const enhancedData = {
        ...data,
        connectionHealth: {
          processingTime,
          clientConnected: connectionMonitor.clientConnected,
          issues: connectionMonitor.issues
        }
      };
      
      const responseType = body.mode === 'async' ? 'ASYNC' : 'SYNC';
      console.log(`✅ [API Proxy] ${responseType} response sent in ${processingTime}ms`);
      
      return NextResponse.json(enhancedData, { 
        status: response.status,
        headers: {
          'X-Processing-Time': processingTime.toString(),
          'X-Connection-Status': 'connected'
        }
      });
    }
  } catch (error) {
    const processingTime = Date.now() - connectionMonitor.startTime;
    lastBackendError = now;
    console.error(`❌ [API Proxy] Error for ${path} after ${processingTime}ms:`, error);
    
    // Check if this is a backend connection issue
    const isBackendConnectionError = error instanceof Error && (
      error.message.includes('fetch failed') ||
      error.message.includes('ECONNREFUSED') ||
      error.message.includes('other side closed') ||
      error.message.includes('UND_ERR_SOCKET') ||
      error.message.includes('ECONNRESET') ||
      error.message.includes('socket hang up') ||
      error.message.includes('network timeout')
    );
    
    if (isBackendConnectionError) {
      console.log(`🔌 [API Proxy] Backend connection failed, returning startup message`);
      
      // Return a user-friendly error for backend startup
      return NextResponse.json({
        response: "I apologize, but the server is currently starting up. Please try again in a few seconds.",
        error: 'Backend starting up',
        backendStartup: true,
        retryAfter: Math.ceil(RETRY_COOLDOWN / 1000),
        connectionHealth: {
          processingTime,
          clientConnected: connectionMonitor.clientConnected,
          issues: ['Backend server is starting up']
        }
      }, { 
        status: 503,
        headers: {
          'X-Processing-Time': processingTime.toString(),
          'X-Connection-Status': 'backend-starting',
          'Retry-After': Math.ceil(RETRY_COOLDOWN / 1000).toString()
        }
      });
    }
    
    // Enhanced error handling for network issues
    let errorMessage = 'Backend service unavailable';
    let statusCode = 503;
    
    if (error instanceof Error) {
      if (error.name === 'AbortError' || error.message.includes('timeout')) {
        errorMessage = 'Request timeout - the operation took too long to complete';
        statusCode = 408;
      } else if (error.message.includes('fetch') || error.message.includes('network')) {
        errorMessage = 'Network connection issue - please check your internet connection';
        statusCode = 503;
      } else {
        errorMessage = error.message;
        statusCode = 500;
      }
    }
    
    return NextResponse.json(
      { 
        error: errorMessage,
        connectionHealth: {
          processingTime,
          clientConnected: connectionMonitor.clientConnected,
          issues: connectionMonitor.issues
        }
      },
      { 
        status: statusCode,
        headers: {
          'X-Processing-Time': processingTime.toString(),
          'X-Connection-Status': 'error'
        }
      }
    );
  }
}

// Helper function to save empty message to backend
async function saveEmptyMessageToBackend(path: string, originalBody: any): Promise<boolean> {
  try {
    // Extract chat ID from path
    const pathParts = path.split('/');
    const chatId = pathParts[pathParts.length - 1];
    
    if (!chatId) {
      console.error('❌ [API Proxy] Could not extract chat ID from path:', path);
      return false;
    }
    
    // Create empty AI message
    const emptyMessage = {
      role: 'assistant',
      content: "I apologize, but I'm experiencing technical difficulties. Please try again in a moment.",
      timestamp: new Date().toISOString(),
    };
    
    // Try to save directly to backend
    const saveResponse = await fetch(`http://localhost:5300/api/chat/chats/${chatId}/messages`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(emptyMessage),
      signal: AbortSignal.timeout(5000), // 5 second timeout for save operation
    });
    
    if (saveResponse.ok) {
      console.log(`✅ [API Proxy] Successfully saved empty message for chat ${chatId}`);
      return true;
    } else {
      console.error(`❌ [API Proxy] Failed to save empty message, status: ${saveResponse.status}`);
      return false;
    }
  } catch (error) {
    console.error(`❌ [API Proxy] Error saving empty message:`, error);
    return false;
  }
}

// Helper function to retry fetch requests with exponential backoff
async function fetchWithRetry(url: string, options: RequestInit, maxRetries: number = MAX_RETRIES): Promise<Response> {
  let lastError: Error | null = null;
  
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      console.log(`🔄 [API Proxy] Attempt ${attempt}/${maxRetries} for ${url}`);
      
      const response = await fetch(url, options);
      
      // If successful, return immediately
      if (response.ok || response.status < 500) {
        return response;
      }
      
      // For 5xx errors, retry if we have attempts left
      if (attempt < maxRetries && response.status >= 500) {
        lastError = new Error(`HTTP ${response.status}: ${response.statusText}`);
        const delay = Math.min(1000 * Math.pow(2, attempt - 1), 5000); // Exponential backoff, max 5s
        console.log(`⏳ [API Proxy] Retrying in ${delay}ms due to HTTP ${response.status}`);
        await new Promise(resolve => setTimeout(resolve, delay));
        continue;
      }
      
      return response;
      
    } catch (error) {
      lastError = error as Error;
      
      // Check if this is a retryable error
      const isRetryable = error instanceof Error && (
        error.message.includes('fetch failed') ||
        error.message.includes('ECONNREFUSED') ||
        error.message.includes('other side closed') ||
        error.message.includes('UND_ERR_SOCKET') ||
        error.message.includes('ECONNRESET') ||
        error.message.includes('socket hang up') ||
        error.message.includes('network timeout')
      );
      
      // Don't retry timeout errors for very long requests 
      const isTimeoutError = error instanceof Error && error.name === 'AbortError';
      
      if (!isRetryable || attempt >= maxRetries || isTimeoutError) {
        throw error;
      }
      
      const delay = Math.min(2000 * Math.pow(1.5, attempt - 1), 10000); // More patient exponential backoff, max 10s
      console.log(`⏳ [API Proxy] Connection error, retrying in ${delay}ms (attempt ${attempt}/${maxRetries}): ${error.message}`);
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
  
  throw lastError || new Error('Max retries exceeded');
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ path: string[] }> }
) {
  const resolvedParams = await params;
  const path = resolvedParams.path.join('/');
  const url = new URL(request.url);
  const backendUrl = `http://localhost:5300/api/chat/${path}${url.search}`;

  try {
    const body = await request.json();
    
    const response = await fetch(backendUrl, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(1200000), // 20 minutes
    });

    const data = await response.json();
    return NextResponse.json(data, { status: response.status });
  } catch (error) {
    console.error(`❌ [API Proxy] Error for ${path}:`, error);
    return NextResponse.json(
      { error: 'Backend service unavailable' },
      { status: 503 }
    );
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ path: string[] }> }
) {
  const resolvedParams = await params;
  const path = resolvedParams.path.join('/');
  const url = new URL(request.url);
  const backendUrl = `http://localhost:5300/api/chat/${path}${url.search}`;

  try {
    const body = await request.json();
    
    const response = await fetch(backendUrl, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(30000), // 30 seconds for cancellation
    });

    const data = await response.json();
    return NextResponse.json(data, { status: response.status });
  } catch (error) {
    console.error(`❌ [API Proxy] PATCH Error for ${path}:`, error);
    return NextResponse.json(
      { error: 'Backend service unavailable' },
      { status: 503 }
    );
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ path: string[] }> }
) {
  const resolvedParams = await params;
  const path = resolvedParams.path.join('/');
  const url = new URL(request.url);
  const backendUrl = `http://localhost:5300/api/chat/${path}${url.search}`;

  try {
    const response = await fetch(backendUrl, {
      method: 'DELETE',
      headers: {
        'Content-Type': 'application/json',
      },
      signal: AbortSignal.timeout(1200000), // 20 minutes
    });

    const data = await response.json();
    return NextResponse.json(data, { status: response.status });
  } catch (error) {
    console.error(`❌ [API Proxy] Error for ${path}:`, error);
    return NextResponse.json(
      { error: 'Backend service unavailable' },
      { status: 503 }
    );
  }
} 