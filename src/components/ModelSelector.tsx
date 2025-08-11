'use client';

import React, { useState, useEffect } from 'react';
import { Bot, Cpu, Cloud, Settings, ChevronDown, Check } from 'lucide-react';

interface Model {
  id: string;
  name: string;
  provider: 'openai' | 'ollama';
  description: string;
}

interface AvailableModels {
  chatgpt: Model[];
  ollama: Model[];
}

interface ModelSelectorProps {
  selectedModelType: 'chatgpt' | 'ollama';
  selectedModel: string;
  onModelChange: (modelType: 'chatgpt' | 'ollama', model: string) => void;
  className?: string;
}

export default function ModelSelector({
  selectedModelType,
  selectedModel,
  onModelChange,
  className = ''
}: ModelSelectorProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [models, setModels] = useState<AvailableModels>({ chatgpt: [], ollama: [] });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // Only fetch on client side to prevent hydration mismatch
    if (typeof window !== 'undefined') {
      fetchAvailableModels();
    }
  }, []);

  const fetchAvailableModels = async () => {
    const maxRetries = 3;
    const retryDelay = 2000; // 2 seconds
    
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        setLoading(true);
        const response = await fetch('/api/chat/models');
        
        if (response.ok) {
          const data = await response.json();
          // Handle new API response format
          if (data.models) {
            setModels(data.models);
          } else {
            // Fallback to old format
            setModels(data);
          }
          setError(null);
          break; // Success, exit retry loop
        } else if (response.status === 503) {
          // Backend is starting up, retry after delay
          const retryAfter = response.headers.get('Retry-After');
          const delay = retryAfter ? parseInt(retryAfter) * 1000 : retryDelay;
          
          if (attempt < maxRetries) {
            console.log(`⏳ [ModelSelector] Backend starting up, retrying in ${delay}ms (attempt ${attempt}/${maxRetries})`);
            await new Promise(resolve => setTimeout(resolve, delay));
            continue;
          } else {
            throw new Error('Backend is starting up, please try again in a few seconds');
          }
        } else {
          throw new Error(`Failed to fetch models: ${response.status} ${response.statusText}`);
        }
      } catch (err) {
        console.error(`Error fetching models (attempt ${attempt}/${maxRetries}):`, err);
        
        if (attempt === maxRetries) {
          // Final attempt failed
          if (err instanceof Error && err.message.includes('Backend is starting up')) {
            setError('Backend is starting up, please try again in a few seconds');
          } else {
            setError('Failed to load available models. Please check your connection and try again.');
          }
        } else {
          // Wait before retrying
          await new Promise(resolve => setTimeout(resolve, retryDelay));
        }
      } finally {
        if (attempt === maxRetries) {
          setLoading(false);
        }
      }
    }
  };

  const getCurrentModel = () => {
    const modelList = models[selectedModelType] || [];
    return modelList.find(m => m.id === selectedModel) || modelList[0];
  };

  const getProviderIcon = (provider: 'openai' | 'ollama') => {
    return provider === 'openai' ? <Cloud className="w-4 h-4" /> : <Cpu className="w-4 h-4" />;
  };

  const getProviderName = (provider: 'openai' | 'ollama') => {
    return provider === 'openai' ? 'ChatGPT' : 'Ollama';
  };

  const currentModel = getCurrentModel();

  if (loading) {
    return (
      <div className={`flex items-center gap-2 px-3 py-2 bg-gray-50 rounded-lg ${className}`}>
        <Bot className="w-4 h-4 text-gray-400 animate-pulse" />
        <span className="text-sm text-gray-500">Loading models...</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className={`flex items-center gap-2 px-3 py-2 bg-red-50 rounded-lg ${className}`}>
        <Bot className="w-4 h-4 text-red-400" />
        <span className="text-sm text-red-600">Model selection unavailable</span>
      </div>
    );
  }

  return (
    <div className={`relative ${className}`}>
      <button
        data-testid="model-selector"
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-2 px-3 py-2 bg-gray-50 hover:bg-gray-100 rounded-lg transition-colors"
        disabled={loading}
      >
        {currentModel ? (
          <>
            {getProviderIcon(currentModel.provider)}
            <span className="text-sm font-medium">{currentModel.name}</span>
            <span className="text-xs text-gray-500">({getProviderName(currentModel.provider)})</span>
          </>
        ) : (
          <>
            <Bot className="w-4 h-4 text-gray-400" />
            <span className="text-sm text-gray-500">No models available</span>
          </>
        )}
        <ChevronDown className={`w-4 h-4 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
      </button>

      {isOpen && (
        <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-gray-200 rounded-lg shadow-lg z-50 max-h-80 overflow-y-auto">
          {/* ChatGPT Models */}
          {models.chatgpt.length > 0 && (
            <div className="p-2">
              <div className="flex items-center gap-2 px-2 py-1 text-xs font-semibold text-gray-600 uppercase tracking-wide">
                <Cloud className="w-3 h-3" />
                ChatGPT Models
              </div>
              {models.chatgpt.map((model) => (
                <button
                  key={model.id}
                  onClick={() => {
                    onModelChange('chatgpt', model.id);
                    setIsOpen(false);
                  }}
                  className={`w-full flex items-center justify-between px-3 py-2 text-left hover:bg-gray-50 rounded ${
                    selectedModelType === 'chatgpt' && selectedModel === model.id
                      ? 'bg-blue-50 text-blue-700'
                      : 'text-gray-700'
                  }`}
                >
                  <div className="flex-1">
                    <div className="text-sm font-medium">{model.name}</div>
                    <div className="text-xs text-gray-500">{model.description}</div>
                  </div>
                  {selectedModelType === 'chatgpt' && selectedModel === model.id && (
                    <Check className="w-4 h-4 text-blue-600" />
                  )}
                </button>
              ))}
            </div>
          )}

          {/* Ollama Models */}
          {models.ollama.length > 0 && (
            <div className="p-2 border-t border-gray-100">
              <div className="flex items-center gap-2 px-2 py-1 text-xs font-semibold text-gray-600 uppercase tracking-wide">
                <Cpu className="w-3 h-3" />
                Local Models (Ollama)
              </div>
              {models.ollama.map((model) => (
                <button
                  key={model.id}
                  onClick={() => {
                    onModelChange('ollama', model.id);
                    setIsOpen(false);
                  }}
                  className={`w-full flex items-center justify-between px-3 py-2 text-left hover:bg-gray-50 rounded ${
                    selectedModelType === 'ollama' && selectedModel === model.id
                      ? 'bg-blue-50 text-blue-700'
                      : 'text-gray-700'
                  }`}
                >
                  <div className="flex-1">
                    <div className="text-sm font-medium">{model.name}</div>
                    <div className="text-xs text-gray-500">{model.description}</div>
                  </div>
                  {selectedModelType === 'ollama' && selectedModel === model.id && (
                    <Check className="w-4 h-4 text-blue-600" />
                  )}
                </button>
              ))}
            </div>
          )}

          {models.chatgpt.length === 0 && models.ollama.length === 0 && (
            <div className="p-4 text-center text-gray-500">
              <Bot className="w-8 h-8 mx-auto mb-2 text-gray-300" />
              <p className="text-sm">No AI models available</p>
              <p className="text-xs mt-1">
                Please configure OpenAI API key or start Ollama
              </p>
            </div>
          )}
        </div>
      )}

      {/* Click outside to close */}
      {isOpen && (
        <div
          className="fixed inset-0 z-40"
          onClick={() => setIsOpen(false)}
        />
      )}
    </div>
  );
} 