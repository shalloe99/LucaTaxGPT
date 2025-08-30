'use client';

import React from 'react';

interface ConnectionStatus {
  healthy: boolean;
  issues: string[];
  lastCheck: number;
}

interface ChatConnectionStatusProps {
  isClient: boolean;
  connectionStatus: ConnectionStatus;
}

export default function ChatConnectionStatus({
  isClient,
  connectionStatus
}: ChatConnectionStatusProps) {
  if (!isClient) return null;

  return (
    <div className="mt-2 text-xs text-gray-500">
      Last connection check: {new Date(connectionStatus.lastCheck).toLocaleTimeString()}
      {connectionStatus.healthy && (
        <span className="ml-2 text-green-600">✓ Connected</span>
      )}
      {!connectionStatus.healthy && (
        <span className="ml-2 text-red-600">✗ Connection Issues</span>
      )}
    </div>
  );
}
