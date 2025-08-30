'use client';

import React, { useRef, useState, useEffect, useLayoutEffect } from 'react';
import ReactDOM from 'react-dom';

const US_STATES = [
  'Alabama', 'Alaska', 'Arizona', 'Arkansas', 'California', 'Colorado', 'Connecticut',
  'Delaware', 'Florida', 'Georgia', 'Hawaii', 'Idaho', 'Illinois', 'Indiana', 'Iowa',
  'Kansas', 'Kentucky', 'Louisiana', 'Maine', 'Maryland', 'Massachusetts', 'Michigan',
  'Minnesota', 'Mississippi', 'Missouri', 'Montana', 'Nebraska', 'Nevada', 'New Hampshire',
  'New Jersey', 'New Mexico', 'New York', 'North Carolina', 'North Dakota', 'Ohio',
  'Oklahoma', 'Oregon', 'Pennsylvania', 'Rhode Island', 'South Carolina', 'South Dakota',
  'Tennessee', 'Texas', 'Utah', 'Vermont', 'Virginia', 'Washington', 'West Virginia',
  'Wisconsin', 'Wyoming'
];

const PROFILE_TAG_CATEGORIES: { [category: string]: string[] } = {
  'Marital Status': [
    'Single', 'Married', 'Divorced', 'Widowed', 'Head of Household', 'Married Filing Separately'
  ],
  'Job Title': [
    'Employee', 'Self-Employed', 'Business Owner', 'Contractor', 'Freelancer', 'Consultant', 'Investor', 'Retired', 'Student', 'Unemployed'
  ],
  'Inquiry Topic': [
    'Deductions', 'Credits', 'Filing Status', 'Business Expenses', 'Investment Income', 'Real Estate', 'Retirement', 'Education', 'Healthcare', 'Charitable Giving', 'Foreign Income', 'State Taxes'
  ]
};

interface ContextFilterMenuProps {
  isOpen: boolean;
  onClose: () => void;
  domainKnowledge: {
    stateTaxCodes: string[];
    filingEntity: string;
  };
  profileTags: string[];
  onDomainKnowledgeChange: (updater: any) => void;
  onProfileTagsChange: (tags: string[]) => void;
  triggerRef: React.RefObject<HTMLElement>;
}

export default function ContextFilterMenu({
  isOpen,
  onClose,
  domainKnowledge,
  profileTags,
  onDomainKnowledgeChange,
  onProfileTagsChange,
  triggerRef
}: ContextFilterMenuProps) {
  const [stateInput, setStateInput] = useState('');
  const [filteredStates, setFilteredStates] = useState(US_STATES);
  const [profileInput, setProfileInput] = useState('');
  const [activeTab, setActiveTab] = useState<'states' | 'profile'>('states');
  
  const menuRef = useRef<HTMLDivElement>(null);
  const [menuPosition, setMenuPosition] = useState<{ top: number; left: number }>({ top: 0, left: 0 });
  const [isPositioned, setIsPositioned] = useState(false);
  const MENU_WIDTH = 320; // w-80

  // Filter states for autocomplete
  useEffect(() => {
    if (stateInput.trim()) {
      setFilteredStates(
        US_STATES.filter(
          s => s.toLowerCase().includes(stateInput.toLowerCase()) && !domainKnowledge.stateTaxCodes.includes(s)
        )
      );
    } else {
      setFilteredStates([]);
    }
  }, [stateInput, domainKnowledge.stateTaxCodes]);

  // Close menu on outside click
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node) && 
          triggerRef.current && !triggerRef.current.contains(e.target as Node)) {
        onClose();
      }
    }
    
    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [isOpen, onClose, triggerRef]);

  // Compute and set menu position synchronously before paint for no visual lag
  useLayoutEffect(() => {
    if (!isOpen) return;
    const trigger = triggerRef.current as HTMLElement | null;
    const menuEl = menuRef.current as HTMLDivElement | null;
    if (!trigger) return;

    const rect = trigger.getBoundingClientRect();
    // Temporarily set width to measure correct height if needed
    if (menuEl) {
      // Measure height to place exactly above the trigger
      const menuHeight = menuEl.offsetHeight || 0;
      const desiredLeft = rect.left - (MENU_WIDTH - rect.width);
      const clampedLeft = Math.max(8, Math.min(desiredLeft, window.innerWidth - MENU_WIDTH - 8));
      const top = Math.max(8, rect.top - menuHeight - 8);
      setMenuPosition({ top, left: clampedLeft });
      setIsPositioned(true);
    }
  }, [isOpen]);

  // Keep menu pinned to the trigger on scroll/resize
  useEffect(() => {
    function computePosition() {
      const trigger = triggerRef.current as HTMLElement | null;
      const menuEl = menuRef.current as HTMLDivElement | null;
      if (!trigger || !menuEl) return;
      const rect = trigger.getBoundingClientRect();
      const menuHeight = menuEl.offsetHeight || 0;
      const desiredLeft = rect.left - (MENU_WIDTH - rect.width);
      const clampedLeft = Math.max(8, Math.min(desiredLeft, window.innerWidth - MENU_WIDTH - 8));
      const top = Math.max(8, rect.top - menuHeight - 8);
      setMenuPosition({ top, left: clampedLeft });
    }

    if (isOpen) {
      const handleScroll = () => computePosition();
      const handleResize = () => computePosition();
      window.addEventListener('scroll', handleScroll, true);
      window.addEventListener('resize', handleResize);
      return () => {
        window.removeEventListener('scroll', handleScroll, true);
        window.removeEventListener('resize', handleResize);
      };
    }
  }, [isOpen, triggerRef]);

  // Handle state selection
  const handleStateSelect = (state: string) => {
    onDomainKnowledgeChange((dk: any) => ({
      ...dk,
      stateTaxCodes: [...dk.stateTaxCodes, state]
    }));
    setStateInput('');
  };

  const handleStateRemove = (state: string) => {
    onDomainKnowledgeChange((dk: any) => ({
      ...dk,
      stateTaxCodes: dk.stateTaxCodes.filter((s: string) => s !== state)
    }));
  };

  // Handle profile tag selection
  const handleProfileTagAdd = (tag: string) => {
    if (!tag.trim() || profileTags.includes(tag.trim())) return;
    onProfileTagsChange([...profileTags, tag.trim()]);
    setProfileInput('');
  };

  const handleProfileTagRemove = (tag: string) => {
    onProfileTagsChange(profileTags.filter((t: string) => t !== tag));
  };

  // Filtered preset tags by input, grouped by category
  const filteredPresetByCategory = Object.entries(PROFILE_TAG_CATEGORIES).map(
    ([category, tags]) => {
      const filtered = tags.filter(
        t => t.toLowerCase().includes(profileInput.toLowerCase()) && !profileTags.includes(t)
      );
      return { category, tags: filtered };
    }
  ).filter(group => group.tags.length > 0);

  if (!isOpen) return null;

  const menu = (
    <div
      ref={menuRef}
      id="context-filter-menu"
      role="menu"
      aria-labelledby="context-filter-trigger"
      className="fixed w-80 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl shadow-2xl shadow-gray-900/20 z-[200000] backdrop-blur-sm animate-in slide-in-from-bottom-2 duration-200"
      style={{ top: menuPosition.top, left: menuPosition.left, visibility: isPositioned ? 'visible' : 'hidden' }}
    >
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-gray-100 dark:border-gray-700">
        <h3 className="text-sm font-semibold text-gray-900 dark:text-white">Context Filters</h3>
        <button
          onClick={onClose}
          className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 transition-all duration-200"
          aria-label="Close menu"
        >
          <svg width="16" height="16" viewBox="0 0 20 20" fill="currentColor">
            <path d="M6.28 5.22a.75.75 0 00-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 101.06 1.06L10 11.06l3.72 3.72a.75.75 0 101.06-1.06L11.06 10l3.72-3.72a.75.75 0 00-1.06-1.06L10 8.94 6.28 5.22z" />
          </svg>
        </button>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-gray-100 dark:border-gray-700">
        <button
          onClick={() => setActiveTab('states')}
          className={`flex-1 px-4 py-3 text-sm font-medium transition-all duration-200 ${
            activeTab === 'states'
              ? 'text-blue-600 dark:text-blue-400 border-b-2 border-blue-600 dark:border-blue-400 bg-blue-50 dark:bg-blue-900/20'
              : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white hover:bg-gray-50 dark:hover:bg-gray-700/50'
          }`}
          role="tab"
          aria-selected={activeTab === 'states'}
        >
          <div className="flex items-center justify-center space-x-2">
            <svg width="16" height="16" viewBox="0 0 20 20" fill="currentColor" className="shrink-0">
              <path d="M10 3.5a1.5 1.5 0 013 0V4a1 1 0 001 1h3a1 1 0 011 1v3a1 1 0 01-1 1h-.5a1.5 1.5 0 000 3h.5a1 1 0 011 1v3a1 1 0 01-1 1h-3a1 1 0 01-1-1v-.5a1.5 1.5 0 00-3 0v.5a1 1 0 01-1 1H6a1 1 0 01-1-1v-3a1 1 0 00-1-1h-.5a1.5 1.5 0 010-3H4a1 1 0 001-1V6a1 1 0 011-1h3a1 1 0 001-1v-.5z" />
            </svg>
            <span>States ({domainKnowledge.stateTaxCodes.length})</span>
          </div>
        </button>
        <button
          onClick={() => setActiveTab('profile')}
          className={`flex-1 px-4 py-3 text-sm font-medium transition-all duration-200 ${
            activeTab === 'profile'
              ? 'text-blue-600 dark:text-blue-400 border-b-2 border-blue-600 dark:border-blue-400 bg-blue-50 dark:bg-blue-900/20'
              : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white hover:bg-gray-50 dark:hover:bg-gray-700/50'
          }`}
          role="tab"
          aria-selected={activeTab === 'profile'}
        >
          <div className="flex items-center justify-center space-x-2">
            <svg width="16" height="16" viewBox="0 0 20 20" fill="currentColor" className="shrink-0">
              <path d="M10 8a3 3 0 100-6 3 3 0 000 6zM3.465 14.493a1.23 1.23 0 00.41 1.411A9.957 9.957 0 0010 18c2.31 0 4.438-.784 6.131-2.1.43-.333.604-.903.408-1.41a7.002 7.002 0 00-13.074.003z" />
            </svg>
            <span>Profile ({profileTags.length})</span>
          </div>
        </button>
      </div>

      {/* Content */}
      <div className="p-4 max-h-96 overflow-y-auto">
        {activeTab === 'states' && (
          <div className="space-y-4">
            {/* Filing Entity */}
            <div className="space-y-2">
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                Filing Entity
              </label>
              <select
                value={domainKnowledge.filingEntity}
                onChange={(e) => onDomainKnowledgeChange({ ...domainKnowledge, filingEntity: e.target.value })}
                className="w-full px-3 py-2.5 border border-gray-200 dark:border-gray-600 rounded-lg shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-white transition-all duration-200"
              >
                <option value="individuals">Individuals</option>
                <option value="businesses">Businesses</option>
                <option value="nonprofits">Nonprofits</option>
              </select>
            </div>

            {/* State Selection */}
            <div className="space-y-2">
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                State Tax Codes
              </label>
              <div className="relative">
                <input
                  value={stateInput}
                  onChange={(e) => setStateInput(e.target.value)}
                  placeholder="Type to search states..."
                  className="w-full px-3 py-2.5 border border-gray-200 dark:border-gray-600 rounded-lg shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-white transition-all duration-200"
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && filteredStates.length > 0) {
                      handleStateSelect(filteredStates[0]);
                    }
                  }}
                />
                <svg width="16" height="16" viewBox="0 0 20 20" fill="currentColor" className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400">
                  <path d="M8 4a4 4 0 100 8 4 4 0 000-8zM2 8a6 6 0 1110.89 3.476l4.817 4.817a1 1 0 01-1.414 1.414l-4.816-4.816A6 6 0 012 8z" />
                </svg>
              </div>
              
              {/* Available States */}
              {filteredStates.length > 0 && (
                <div className="mt-2 max-h-32 overflow-y-auto border border-gray-200 dark:border-gray-600 rounded-lg bg-gray-50 dark:bg-gray-700">
                  {filteredStates.map(state => (
                    <div
                      key={state}
                      className="px-3 py-2 hover:bg-blue-50 dark:hover:bg-blue-900/20 cursor-pointer text-sm text-gray-700 dark:text-gray-300 transition-colors duration-150 first:rounded-t-lg last:rounded-b-lg"
                      role="menuitem"
                      onClick={() => handleStateSelect(state)}
                    >
                      <div className="flex items-center space-x-2">
                        <svg width="14" height="14" viewBox="0 0 20 20" fill="currentColor" className="text-blue-500">
                          <path d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                        <span>{state}</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Selected States */}
            {domainKnowledge.stateTaxCodes.length > 0 && (
              <div className="space-y-2">
                <div className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide">Selected States</div>
                <div className="flex flex-wrap gap-2">
                  {domainKnowledge.stateTaxCodes.map((state: string) => (
                    <span key={state} className="inline-flex items-center bg-green-100 dark:bg-green-900/30 text-green-800 dark:text-green-300 rounded-full px-3 py-1.5 text-xs font-medium border border-green-200 dark:border-green-700">
                      {state}
                      <button
                        className="ml-2 text-green-600 dark:text-green-400 hover:text-red-600 dark:hover:text-red-400 transition-colors duration-150"
                        onClick={() => handleStateRemove(state)}
                        title="Remove state"
                      >
                        <svg width="12" height="12" viewBox="0 0 20 20" fill="currentColor">
                          <path d="M6.28 5.22a.75.75 0 00-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 101.06 1.06L10 11.06l3.72 3.72a.75.75 0 101.06-1.06L11.06 10l3.72-3.72a.75.75 0 00-1.06-1.06L10 8.94 6.28 5.22z" />
                        </svg>
                      </button>
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {activeTab === 'profile' && (
          <div className="space-y-4">
            {/* Profile Tags */}
            <div className="space-y-2">
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                Profile Tags
              </label>
              <div className="relative">
                <input
                  value={profileInput}
                  onChange={(e) => setProfileInput(e.target.value)}
                  placeholder="Type to search or add custom tags..."
                  className="w-full px-3 py-2.5 border border-gray-200 dark:border-gray-600 rounded-lg shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-white transition-all duration-200"
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && profileInput.trim()) {
                      handleProfileTagAdd(profileInput);
                    }
                  }}
                />
                <svg width="16" height="16" viewBox="0 0 20 20" fill="currentColor" className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400">
                  <path d="M8 4a4 4 0 100 8 4 4 0 000-8zM2 8a6 6 0 1110.89 3.476l4.817 4.817a1 1 0 01-1.414 1.414l-4.816-4.816A6 6 0 012 8z" />
                </svg>
              </div>
            </div>
            
            {/* Preset Tags */}
            {filteredPresetByCategory.length > 0 && (
              <div className="space-y-3">
                <div className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide">Preset Tags</div>
                {filteredPresetByCategory.map(({ category, tags }) => (
                  <div key={category} className="space-y-2">
                    <div className="text-xs font-medium text-gray-600 dark:text-gray-400">{category}</div>
                    <div className="flex flex-wrap gap-2">
                      {tags.map(tag => (
                        <button
                          key={tag}
                          onClick={() => handleProfileTagAdd(tag)}
                          className="px-3 py-1.5 bg-blue-100 dark:bg-blue-900/30 text-blue-800 dark:text-blue-300 rounded-lg text-xs font-medium border border-blue-200 dark:border-blue-700 hover:bg-blue-200 dark:hover:bg-blue-900/50 transition-all duration-150 flex items-center space-x-1"
                        >
                          <svg width="12" height="12" viewBox="0 0 20 20" fill="currentColor">
                            <path d="M10 5a1 1 0 011 1v3h3a1 1 0 110 2h-3v3a1 1 0 11-2 0v-3H6a1 1 0 110-2h3V6a1 1 0 011-1z" />
                          </svg>
                          <span>{tag}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Selected Profile Tags */}
            {profileTags.length > 0 && (
              <div className="space-y-2">
                <div className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide">Selected Tags</div>
                <div className="flex flex-wrap gap-2">
                  {profileTags.map((tag: string) => (
                    <span key={tag} className="inline-flex items-center bg-purple-100 dark:bg-purple-900/30 text-purple-800 dark:text-purple-300 rounded-full px-3 py-1.5 text-xs font-medium border border-purple-200 dark:border-purple-700">
                      {tag}
                      <button
                        className="ml-2 text-purple-600 dark:text-purple-400 hover:text-red-600 dark:hover:text-red-400 transition-colors duration-150"
                        onClick={() => handleProfileTagRemove(tag)}
                        title="Remove tag"
                      >
                        <svg width="12" height="12" viewBox="0 0 20 20" fill="currentColor">
                          <path d="M6.28 5.22a.75.75 0 00-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 101.06 1.06L10 11.06l3.72 3.72a.75.75 0 101.06-1.06L11.06 10l3.72-3.72a.75.75 0 00-1.06-1.06L10 8.94 6.28 5.22z" />
                        </svg>
                      </button>
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );

  return ReactDOM.createPortal(menu, document.body);
}
