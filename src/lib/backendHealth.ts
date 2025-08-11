// Backend health check utility
export interface BackendStatus {
  isOnline: boolean;
  lastCheck: Date;
  error?: string;
  details?: any;
}

let backendStatus: BackendStatus = {
  isOnline: false,
  lastCheck: new Date(),
};

export const checkBackendHealth = async (): Promise<BackendStatus> => {
  try {
    const response = await fetch('/api/health', {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
    });
    
    if (response.ok) {
      const data = await response.json();
      backendStatus = {
        isOnline: data.status === 'healthy' || data.status === 'degraded',
        lastCheck: new Date(),
        details: data,
      };
    } else {
      backendStatus = {
        isOnline: false,
        lastCheck: new Date(),
        error: `Server returned ${response.status}`,
      };
    }
  } catch (error) {
    backendStatus = {
      isOnline: false,
      lastCheck: new Date(),
      error: error instanceof Error ? error.message : 'Connection failed',
    };
  }
  
  return backendStatus;
};

export const getBackendStatus = (): BackendStatus => {
  return backendStatus;
};

export const isBackendOnline = (): boolean => {
  return backendStatus.isOnline;
}; 