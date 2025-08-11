'use client';

import React from 'react';

interface ContextControlsProps {
  selectedStates: string[];
  filingEntity: string;
  onStatesChange: (states: string[]) => void;
  onFilingEntityChange: (value: string) => void;
}

export function StateAutocomplete({
  selectedStates,
  onStatesChange,
}: {
  selectedStates: string[];
  onStatesChange: (states: string[]) => void;
}) {
  const [isOpen, setIsOpen] = React.useState(false);
  const [inputValue, setInputValue] = React.useState('');
  const dropdownRef = React.useRef<HTMLDivElement>(null);

  const allStates = React.useMemo(
    () => [
      'Alabama',
      'Alaska',
      'Arizona',
      'Arkansas',
      'California',
      'Colorado',
      'Connecticut',
      'Delaware',
      'Florida',
      'Georgia',
      'Hawaii',
      'Idaho',
      'Illinois',
      'Indiana',
      'Iowa',
      'Kansas',
      'Kentucky',
      'Louisiana',
      'Maine',
      'Maryland',
      'Massachusetts',
      'Michigan',
      'Minnesota',
      'Mississippi',
      'Missouri',
      'Montana',
      'Nebraska',
      'Nevada',
      'New Hampshire',
      'New Jersey',
      'New Mexico',
      'New York',
      'North Carolina',
      'North Dakota',
      'Ohio',
      'Oklahoma',
      'Oregon',
      'Pennsylvania',
      'Rhode Island',
      'South Carolina',
      'South Dakota',
      'Tennessee',
      'Texas',
      'Utah',
      'Vermont',
      'Virginia',
      'Washington',
      'West Virginia',
      'Wisconsin',
      'Wyoming',
    ],
    []
  );

  const filteredStates = React.useMemo(
    () =>
      allStates.filter(
        (state) =>
          state.toLowerCase().includes(inputValue.toLowerCase()) &&
          !selectedStates.includes(state)
      ),
    [allStates, inputValue, selectedStates]
  );

  const handleSelect = React.useCallback(
    (state: string) => {
      onStatesChange([...selectedStates, state]);
      setInputValue('');
      setIsOpen(false);
    },
    [onStatesChange, selectedStates]
  );

  const handleRemove = React.useCallback(
    (state: string) => {
      onStatesChange(selectedStates.filter((s) => s !== state));
    },
    [onStatesChange, selectedStates]
  );

  const handleInputChange = React.useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      setInputValue(e.target.value);
    },
    []
  );

  const handleInputKeyDown = React.useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter' && filteredStates.length > 0) {
        handleSelect(filteredStates[0]);
      } else if (e.key === 'Escape') {
        setIsOpen(false);
      }
    },
    [filteredStates, handleSelect]
  );

  React.useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  return (
    <div ref={dropdownRef} className="relative">
      <input
        type="text"
        value={inputValue}
        onChange={handleInputChange}
        onFocus={() => setIsOpen(true)}
        onKeyDown={handleInputKeyDown}
        placeholder="Add state..."
        className="w-full p-2 border border-gray-300 rounded text-gray-900"
      />
      {isOpen && filteredStates.length > 0 && (
        <div className="absolute z-10 w-full mt-1 bg-white border border-gray-300 rounded shadow-lg max-h-48 overflow-y-auto">
          {filteredStates.map((state) => (
            <div
              key={state}
              onClick={() => handleSelect(state)}
              className="p-2 hover:bg-gray-100 cursor-pointer text-gray-900"
            >
              {state}
            </div>
          ))}
        </div>
      )}
      {selectedStates.length > 0 && (
        <div className="flex flex-wrap gap-2 mt-2">
          {selectedStates.map((state) => (
            <span key={state} className="text-xs px-2 py-1 bg-gray-100 text-gray-700 rounded">
              {state}
              <button
                onClick={() => handleRemove(state)}
                className="ml-1 text-gray-500 hover:text-gray-700"
                aria-label={`Remove ${state}`}
              >
                ×
              </button>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

export default function ContextControls({
  selectedStates,
  filingEntity,
  onStatesChange,
  onFilingEntityChange,
}: ContextControlsProps) {
  return (
    <div className="border-b border-gray-200 p-4 bg-gray-50">
      <div className="max-w-4xl mx-auto">
        <h3 className="text-sm font-medium text-gray-700 mb-3">Context Filters</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              State Tax Codes
            </label>
            <StateAutocomplete selectedStates={selectedStates} onStatesChange={onStatesChange} />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Filing Entity</label>
            <select
              value={filingEntity}
              onChange={(e) => onFilingEntityChange(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
            >
              <option value="individuals">Individuals</option>
              <option value="businesses">Businesses</option>
              <option value="nonprofits">Nonprofits</option>
            </select>
          </div>
        </div>
      </div>
    </div>
  );
}


