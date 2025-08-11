import { NextRequest, NextResponse } from 'next/server';

export async function GET(request: NextRequest) {
  const startTime = Date.now();
  
  try {
    // Test backend connectivity with a longer timeout and better error handling
    const backendResponse = await fetch('http://localhost:5300/api/health', {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
      signal: AbortSignal.timeout(10000), // 10 second timeout like chat proxy
    });
    
    const processingTime = Date.now() - startTime;
    
    if (backendResponse.ok) {
      const backendData = await backendResponse.json();
      return NextResponse.json({
        status: 'healthy',
        backend: 'connected',
        processingTime,
        timestamp: new Date().toISOString(),
        backendDetails: backendData
      }, {
        headers: {
          'X-Processing-Time': processingTime.toString(),
          'Cache-Control': 'no-cache'
        }
      });
    } else {
      return NextResponse.json({
        status: 'degraded',
        backend: 'unavailable',
        processingTime,
        timestamp: new Date().toISOString(),
        backendStatus: backendResponse.status,
        backendStatusText: backendResponse.statusText
      }, {
        status: 503,
        headers: {
          'X-Processing-Time': processingTime.toString(),
          'Cache-Control': 'no-cache'
        }
      });
    }
  } catch (error) {
    const processingTime = Date.now() - startTime;
    
    // Determine the type of error
    let errorType = 'unknown';
    let errorDetails = '';
    
    if (error instanceof Error) {
      if (error.name === 'AbortError') {
        errorType = 'timeout';
        errorDetails = 'Backend health check timed out';
      } else if (error.message.includes('ECONNREFUSED') || error.message.includes('fetch failed')) {
        errorType = 'connection_refused';
        errorDetails = 'Backend server is not running';
      } else if (error.message.includes('other side closed')) {
        errorType = 'connection_closed';
        errorDetails = 'Backend connection was closed';
      } else {
        errorType = 'network_error';
        errorDetails = error.message;
      }
    }
    
    return NextResponse.json({
      status: 'unhealthy',
      backend: 'unreachable',
      error: errorDetails,
      errorType,
      processingTime,
      timestamp: new Date().toISOString(),
      recommendations: [
        'Check if the backend server is running on port 5300',
        'Ensure the backend dependencies are installed',
        'Check the backend logs for any startup errors',
        'Try restarting the development environment'
      ]
    }, {
      status: 503,
      headers: {
        'X-Processing-Time': processingTime.toString(),
        'Cache-Control': 'no-cache'
      }
    });
  }
} 