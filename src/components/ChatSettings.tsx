'use client';

import React, { useState, useEffect, useRef, useImperativeHandle, forwardRef } from 'react';
import { Settings, Zap, Clock, Cpu, Cloud, Check, X } from 'lucide-react';

interface ChatSettingsProps {
  selectedModelType: 'chatgpt' | 'ollama';
  selectedModel: string;
  isAsyncMode: boolean;
  onModelChange: (modelType: 'chatgpt' | 'ollama', model: string) => void;
  onModeChange: (isAsync: boolean) => void;
  onClose: () => void;
  onSave?: () => void;
  onCancel?: () => void;
  availableModels: {
    chatgpt: Array<{ id: string; name: string; description: string }>;
    ollama: Array<{ id: string; name: string; description: string }>;
  };
}

export interface ChatSettingsRef {
  save: () => void;
}

// Hardcoded model lists for consistent UI
const LOCAL_MODELS = [
  {
    id: 'phi3:3.8b',
    name: 'Phi-3 3.8B',
    description: 'Fast local model, good for quick responses'
  },
  {
    id: 'mistral:7b',
    name: 'Mistral 7B',
    description: 'High-quality local model with good reasoning'
  }
];

const CHATGPT_MODELS = [
  {
    id: 'gpt-4o',
    name: 'GPT-4o',
    description: 'Most capable model, best quality'
  },
  {
    id: 'gpt-4o-mini',
    name: 'GPT-4o Mini',
    description: 'Fast and cost-effective'
  },
  {
    id: 'gpt-3.5-turbo',
    name: 'GPT-3.5 Turbo',
    description: 'Fastest response time'
  }
];

const ChatSettings = forwardRef<ChatSettingsRef, ChatSettingsProps>(({
  selectedModelType,
  selectedModel,
  isAsyncMode,
  onModelChange,
  onModeChange,
  onClose,
  onSave,
  onCancel,
  availableModels
}, ref) => {
  const [localSelectedModel, setLocalSelectedModel] = useState(() => {
    return selectedModelType === 'ollama' ? selectedModel : LOCAL_MODELS[0].id;
  });
  const [chatgptSelectedModel, setChatgptSelectedModel] = useState(() => {
    return selectedModelType === 'chatgpt' ? selectedModel : CHATGPT_MODELS[0].id;
  });
  const [localSelectedType, setLocalSelectedType] = useState(selectedModelType);
  const [localAsyncMode, setLocalAsyncMode] = useState(isAsyncMode);
  const modalRef = useRef<HTMLDivElement>(null);

  // Expose save function to parent component
  useImperativeHandle(ref, () => ({
    save: handleSave
  }));

  // Update local state when props change
  useEffect(() => {
    setLocalSelectedType(selectedModelType);
    setLocalAsyncMode(isAsyncMode);
    
    if (selectedModelType === 'ollama') {
      setLocalSelectedModel(selectedModel);
    } else {
      setChatgptSelectedModel(selectedModel);
    }
  }, [selectedModelType, selectedModel, isAsyncMode]);

  // Handle click outside to close without saving
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (modalRef.current && !modalRef.current.contains(event.target as Node)) {
        onClose();
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [onClose]);

  const handleModelTypeChange = (newType: 'chatgpt' | 'ollama') => {
    setLocalSelectedType(newType);
  };

  const handleLocalModelChange = (modelId: string) => {
    setLocalSelectedModel(modelId);
  };

  const handleChatGPTModelChange = (modelId: string) => {
    setChatgptSelectedModel(modelId);
  };

  const handleAsyncModeChange = (newAsyncMode: boolean) => {
    setLocalAsyncMode(newAsyncMode);
  };

  const handleSave = () => {
    // Save changes by calling parent functions
    if (localSelectedType !== selectedModelType) {
      const modelToUse = localSelectedType === 'ollama' ? localSelectedModel : chatgptSelectedModel;
      onModelChange(localSelectedType, modelToUse);
    } else if (localSelectedType === 'ollama' && localSelectedModel !== selectedModel) {
      onModelChange('ollama', localSelectedModel);
    } else if (localSelectedType === 'chatgpt' && chatgptSelectedModel !== selectedModel) {
      onModelChange('chatgpt', chatgptSelectedModel);
    }
    
    if (localAsyncMode !== isAsyncMode) {
      onModeChange(localAsyncMode);
    }
    
    onClose();
  };

  const handleCancel = () => {
    onClose();
  };

  return (
    <div className="w-full space-y-3" ref={modalRef}>
      
      {/* Response Mode and Buttons Row */}
      <div className="flex items-start justify-between">
        <div className="flex-1">
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Response Mode
          </label>
          <div className="flex items-center gap-4">
            <div className="flex gap-2">
              <button
                onClick={() => handleAsyncModeChange(false)}
                className={`flex items-center gap-2 px-3 py-2 text-sm rounded-md transition-colors ${
                  !localAsyncMode
                    ? 'bg-gray-200 text-gray-900'
                    : 'bg-white text-gray-600 hover:bg-gray-100'
                }`}
              >
                <Clock className="w-4 h-4" />
                Sync
              </button>
              <button
                onClick={() => handleAsyncModeChange(true)}
                className={`flex items-center gap-2 px-3 py-2 text-sm rounded-md transition-colors ${
                  localAsyncMode
                    ? 'bg-gray-200 text-gray-900'
                    : 'bg-white text-gray-600 hover:bg-gray-100'
                }`}
              >
                <Zap className="w-4 h-4" />
                Async
              </button>
            </div>
            
            {/* Current Selection Summary */}
            <div className="bg-white border border-gray-200 rounded-md p-3">
              <div className="text-xs text-gray-600 space-y-1">
                <div className="flex items-center gap-2">
                  <span className="font-medium">Provider:</span>
                  <span className="text-gray-900">
                    {localSelectedType === 'ollama' ? 'Local' : 'ChatGPT'}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="font-medium">Model:</span>
                  <span className="text-gray-900">
                    {localSelectedType === 'ollama' ? localSelectedModel : chatgptSelectedModel}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="font-medium">Mode:</span>
                  <span className="text-gray-900">
                    {localAsyncMode ? 'Async' : 'Sync'}
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>
        
        {/* Buttons */}
        <div className="flex items-center gap-3 ml-6">
          <button
            onClick={onCancel || handleCancel}
            className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800 hover:bg-gray-100 rounded-lg transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={onSave || handleSave}
            className="px-4 py-2 text-sm bg-gray-800 text-white hover:bg-gray-700 rounded-lg transition-colors"
          >
            Save
          </button>
        </div>
      </div>

      {/* Model Type Selection */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">
          AI Provider
        </label>
        <div className="flex bg-white rounded-md border border-gray-200 p-1">
          <button
            onClick={() => handleModelTypeChange('ollama')}
            className={`flex items-center gap-2 flex-1 px-3 py-2 text-sm rounded-md transition-colors ${
              localSelectedType === 'ollama'
                ? 'bg-gray-100 text-gray-900'
                : 'text-gray-600 hover:text-gray-900'
            }`}
          >
            <Cpu className="w-4 h-4" />
            Local
          </button>
          <button
            onClick={() => handleModelTypeChange('chatgpt')}
            className={`flex items-center gap-2 flex-1 px-3 py-2 text-sm rounded-md transition-colors ${
              localSelectedType === 'chatgpt'
                ? 'bg-gray-100 text-gray-900'
                : 'text-gray-600 hover:text-gray-900'
            }`}
          >
            <Cloud className="w-4 h-4" />
            ChatGPT
          </button>
        </div>
      </div>

      {/* Model Selection */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">
          Model
        </label>
        <div className={`space-y-2 ${(localSelectedType === 'ollama' ? LOCAL_MODELS.length : CHATGPT_MODELS.length) > 3 ? 'max-h-32 overflow-y-auto' : ''}`}>
            {localSelectedType === 'ollama' ? (
              LOCAL_MODELS.map((model) => (
                <button
                  key={model.id}
                  onClick={() => handleLocalModelChange(model.id)}
                  className={`w-full text-left p-2 rounded-md border transition-colors ${
                    localSelectedModel === model.id
                      ? 'border-gray-400 bg-gray-100'
                      : 'border-gray-200 bg-white hover:border-gray-300'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="font-medium text-sm text-gray-900">{model.name}</div>
                      <div className="text-xs text-gray-500 mt-1">{model.description}</div>
                    </div>
                    {localSelectedModel === model.id && (
                      <Check className="w-4 h-4 text-gray-600" />
                    )}
                  </div>
                </button>
              ))
            ) : (
              CHATGPT_MODELS.map((model) => (
                <button
                  key={model.id}
                  onClick={() => handleChatGPTModelChange(model.id)}
                  className={`w-full text-left p-2 rounded-md border transition-colors ${
                    chatgptSelectedModel === model.id
                      ? 'border-gray-400 bg-gray-100'
                      : 'border-gray-200 bg-white hover:border-gray-300'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="font-medium text-sm text-gray-900">{model.name}</div>
                      <div className="text-xs text-gray-500 mt-1">{model.description}</div>
                    </div>
                    {chatgptSelectedModel === model.id && (
                      <Check className="w-4 h-4 text-gray-600" />
                    )}
                  </div>
                </button>
              ))
            )}
          </div>
        </div>
    </div>
  );
});

ChatSettings.displayName = 'ChatSettings';

export default ChatSettings; 