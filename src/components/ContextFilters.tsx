import React, { useRef, useState, useEffect } from 'react';

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

export default function ContextFilters({
  domainKnowledge,
  setDomainKnowledge,
  profileTags,
  setProfileTags
}: any) {
  // State for state search input
  const [stateInput, setStateInput] = useState('');
  const [filteredStates, setFilteredStates] = useState(US_STATES);
  const stateInputRef = useRef<HTMLInputElement>(null);
  const stateDropdownRef = useRef<HTMLDivElement>(null);
  const [showStateDropdown, setShowStateDropdown] = useState(false);

  // State for profile tag dropdown
  const [showProfileTagDropdown, setShowProfileTagDropdown] = useState(false);
  const [profileInput, setProfileInput] = useState('');
  const profileInputRef = useRef<HTMLInputElement>(null);
  const profileDropdownRef = useRef<HTMLDivElement>(null);

  // Effect: filter states for autocomplete
  useEffect(() => {
    setFilteredStates(
      US_STATES.filter(
        s => s.toLowerCase().includes(stateInput.toLowerCase()) && !domainKnowledge.stateTaxCodes.includes(s)
      )
    );
  }, [stateInput, domainKnowledge.stateTaxCodes]);

  // Effect: close dropdowns on outside click
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (stateDropdownRef.current && !stateDropdownRef.current.contains(e.target as Node)) {
        setShowStateDropdown(false);
        setStateInput('');
      }
      if (profileDropdownRef.current && !profileDropdownRef.current.contains(e.target as Node)) {
        setShowProfileTagDropdown(false);
        setProfileInput('');
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Prevent dropdown from closing when removing tags
  const handleRemoveStateMouseDown = (e: React.MouseEvent, state: string) => {
    e.stopPropagation();
    e.preventDefault();
    handleStateRemove(state);
  };
  const handleRemoveProfileTagMouseDown = (e: React.MouseEvent, tag: string) => {
    e.stopPropagation();
    e.preventDefault();
    handleProfileTagRemove(tag);
  };



  // --- State Tax Code ---
  const handleStateBoxClick = () => {
    setShowStateDropdown((v: boolean) => !v);
    setTimeout(() => stateInputRef.current?.focus(), 100);
  };
  const handleStateSelect = (state: string) => {
    setDomainKnowledge((dk: any) => ({
      ...dk,
      stateTaxCodes: [...dk.stateTaxCodes, state]
    }));
    setStateInput(''); // Do NOT close dropdown here
  };
  const handleStateRemove = (state: string) => {
    setDomainKnowledge((dk: any) => ({
      ...dk,
      stateTaxCodes: dk.stateTaxCodes.filter((s: string) => s !== state)
    }));
    // Do NOT close dropdown here
  };

  // --- Custom Profile ---
  const handleProfileBoxClick = () => {
    setShowProfileTagDropdown((v: boolean) => !v);
    setTimeout(() => profileInputRef.current?.focus(), 100);
    setProfileInput('');
  };
  const handleProfileTagAdd = (tag: string) => {
    if (!tag.trim() || profileTags.includes(tag.trim())) return;
    setProfileTags([...profileTags, tag.trim()]);
    setProfileInput(''); // Do NOT close dropdown here
  };
  const handleProfileTagRemove = (tag: string) => {
    setProfileTags(profileTags.filter((t: string) => t !== tag));
    // Do NOT close dropdown here
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

  // --- Render ---
  return (
    <div className="flex flex-wrap items-center gap-4 mt-4">
      {/* State Tax Code - Clickable Box and Dropdown */}
      <div className="relative" ref={stateDropdownRef}>
        <div
          className={`cursor-pointer px-3 py-1 rounded border text-sm font-medium select-none transition-all ${
            domainKnowledge.stateTaxCodes.length > 0
              ? 'bg-green-600 text-white border-green-600 shadow'
              : 'bg-white text-green-700 border-green-300 hover:bg-green-50'
          }`}
          onClick={handleStateBoxClick}
          title="Select state tax codes"
        >
          {domainKnowledge.stateTaxCodes.length === 0
            ? 'state tax code'
            : domainKnowledge.stateTaxCodes.slice(-3).map((state: string, i: number) => (
                <span key={state} className="inline-block bg-green-100 text-green-800 rounded px-2 py-0.5 text-xs font-semibold mr-1">
                  {state}
                  <button
                    className="ml-1 text-green-600 hover:text-red-600"
                    onMouseDown={e => handleRemoveStateMouseDown(e, state)}
                    title="Remove state"
                  >×</button>
                </span>
              ))}
        </div>
        {showStateDropdown && (
          <div className="absolute top-full left-0 mt-2 w-64 bg-white border border-gray-200 rounded-lg shadow-lg z-10 p-3" style={{minWidth: '220px'}}>
            <input
              ref={stateInputRef}
              value={stateInput}
              onChange={e => setStateInput(e.target.value)}
              placeholder="Type to search states..."
              className="w-full px-2 py-1 border rounded text-xs mb-2"
              onKeyDown={e => {
                if (e.key === 'Enter' && filteredStates.length > 0) {
                  handleStateSelect(filteredStates[0]);
                }
              }}
            />
            <div className="max-h-40 overflow-y-auto mb-2">
              {filteredStates.length === 0 ? (
                <div className="text-xs text-gray-400 px-2 py-1">No states found</div>
              ) : (
                filteredStates.map(state => (
                  <div
                    key={state}
                    className="px-2 py-1 hover:bg-green-50 cursor-pointer text-xs rounded"
                    onMouseDown={() => handleStateSelect(state)}
                  >
                    {state}
                  </div>
                ))
              )}
            </div>
            {/* Selected states at bottom, removable, does not close dropdown */}
            <div className="border-t pt-2 mt-2">
              <div className="text-xs font-semibold text-gray-500 mb-1">Selected States</div>
              {domainKnowledge.stateTaxCodes.length === 0 ? (
                <div className="text-xs text-gray-400 px-2 py-1">No states selected</div>
              ) : (
                <div className="flex flex-wrap gap-1">
                  {domainKnowledge.stateTaxCodes.map((state: string) => (
                    <span key={state} className="inline-flex items-center bg-green-100 text-green-800 rounded px-2 py-0.5 text-xs font-semibold">
                      {state}
                      <button
                        className="ml-1 text-green-600 hover:text-red-600"
                        onMouseDown={e => handleRemoveStateMouseDown(e, state)}
                        title="Remove state"
                      >×</button>
                    </span>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Custom Profile - Clickable Box and Dropdown */}
      <div className="relative" ref={profileDropdownRef}>
        <div
          className={`cursor-pointer px-3 py-1 rounded border text-sm font-medium select-none transition-all ${
            profileTags.length > 0
              ? 'bg-purple-600 text-white border-purple-600 shadow'
              : 'bg-white text-purple-700 border-purple-300 hover:bg-purple-50'
          }`}
          onClick={handleProfileBoxClick}
          title="Edit custom profile tags"
        >
          {profileTags.length === 0
            ? 'custom profile'
            : profileTags.slice(-3).map((tag: string, i: number) => (
                <span key={tag} className="inline-block bg-purple-100 text-purple-800 rounded px-2 py-0.5 text-xs font-semibold mr-1">
                  {tag}
                  <button
                    className="ml-1 text-purple-600 hover:text-red-600"
                    onMouseDown={e => handleRemoveProfileTagMouseDown(e, tag)}
                    title="Remove tag"
                  >×</button>
                </span>
              ))}
        </div>
        {showProfileTagDropdown && (
          <div className="absolute top-full left-0 mt-2 w-72 bg-white border border-gray-200 rounded-lg shadow-lg z-10 p-3" style={{minWidth: '260px'}}>
            <input
              ref={profileInputRef}
              value={profileInput}
              onChange={e => setProfileInput(e.target.value)}
              placeholder="Add custom tag..."
              className="w-full px-2 py-1 border rounded text-xs mb-2"
              onKeyDown={e => {
                if (e.key === 'Enter' && profileInput.trim()) {
                  handleProfileTagAdd(profileInput);
                }
              }}
            />
            <div className="max-h-40 overflow-y-auto mb-2">
              {/* Preset tag autocomplete - grouped by category */}
              {filteredPresetByCategory.length > 0 && (
                <div className="mb-2">
                  {filteredPresetByCategory.map(group => (
                    <div key={group.category} className="mb-1">
                      <div className="text-xs font-semibold text-gray-500 mb-1">{group.category}</div>
                      <div className="flex flex-wrap gap-1">
                        {group.tags.map(tag => (
                          <div
                            key={tag}
                            className="px-2 py-1 bg-purple-100 text-purple-800 rounded cursor-pointer text-xs hover:bg-purple-200"
                            onMouseDown={() => handleProfileTagAdd(tag)}
                          >
                            {tag}
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
            {/* Selected profile tags at bottom, removable, does not close dropdown */}
            <div className="border-t pt-2 mt-2">
              <div className="text-xs font-semibold text-gray-500 mb-1">Selected Profile Tags</div>
              {profileTags.length === 0 ? (
                <div className="text-xs text-gray-400 px-2 py-1">No tags yet</div>
              ) : (
                <div className="flex flex-wrap gap-1">
                  {profileTags.map((tag: string) => (
                    <span key={tag} className="inline-flex items-center bg-purple-100 text-purple-800 rounded px-2 py-0.5 text-xs font-semibold">
                      {tag}
                      <button
                        className="ml-1 text-purple-600 hover:text-red-600 text-xs"
                        onMouseDown={e => handleRemoveProfileTagMouseDown(e, tag)}
                        title="Remove tag"
                      >×</button>
                    </span>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
} 