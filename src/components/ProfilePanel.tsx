'use client';

import { useState, useEffect } from 'react';

interface UserProfile {
  tags: string[];
  context: string;
}

interface ProfilePanelProps {
  onClose?: () => void;
  isOpen?: boolean;
  onToggle?: () => void;
}

// Color-coded tag categories
const TAG_CATEGORIES = {
  'Marital Status': {
    color: 'bg-blue-100 text-blue-800 border-blue-200',
    tags: ['Single', 'Married', 'Divorced', 'Widowed', 'Head of Household', 'Married Filing Separately']
  },
  'Job Title': {
    color: 'bg-green-100 text-green-800 border-green-200',
    tags: ['Employee', 'Self-Employed', 'Business Owner', 'Contractor', 'Freelancer', 'Consultant', 'Investor', 'Retired', 'Student', 'Unemployed']
  },
  'Inquiry Topic': {
    color: 'bg-purple-100 text-purple-800 border-purple-200',
    tags: ['Deductions', 'Credits', 'Filing Status', 'Business Expenses', 'Investment Income', 'Real Estate', 'Retirement', 'Education', 'Healthcare', 'Charitable Giving', 'Foreign Income', 'State Taxes']
  }
};

export default function ProfilePanel({ onClose, isOpen = false, onToggle }: ProfilePanelProps) {
  const [profile, setProfile] = useState<UserProfile>({
    tags: [],
    context: ''
  });
  const [newTag, setNewTag] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    loadProfile();
  }, []);

  const loadProfile = async () => {
    try {
      const response = await fetch('/api/profile/demo-user');
      if (response.ok) {
        const data = await response.json();
        setProfile({
          tags: data.profile.tags || [],
          context: data.profile.context || ''
        });
      }
    } catch (error) {
      console.error('Error loading profile:', error);
    }
  };

  const saveProfile = async () => {
    setIsLoading(true);
    try {
      const response = await fetch('/api/profile/demo-user', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(profile),
      });
      
      if (response.ok) {
        console.log('Profile saved successfully');
        onClose?.();
      }
    } catch (error) {
      console.error('Error saving profile:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const addTag = async (tag: string) => {
    if (!tag.trim() || profile.tags.includes(tag.trim())) return;

    try {
      const response = await fetch('/api/profile/demo-user/tags', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ tag: tag.trim() }),
      });

      if (response.ok) {
        const data = await response.json();
        setProfile(prev => ({ ...prev, tags: data.tags }));
      }
    } catch (error) {
      console.error('Error adding tag:', error);
    }
  };

  const removeTag = async (tagToRemove: string) => {
    try {
      const response = await fetch(`/api/profile/demo-user/tags/${encodeURIComponent(tagToRemove)}`, {
        method: 'DELETE',
      });

      if (response.ok) {
        const data = await response.json();
        setProfile(prev => ({ ...prev, tags: data.tags }));
      }
    } catch (error) {
      console.error('Error removing tag:', error);
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      addTag(newTag);
    }
  };

  const getTagCategory = (tag: string) => {
    for (const [category, data] of Object.entries(TAG_CATEGORIES)) {
      if (data.tags.includes(tag)) {
        return { category, color: data.color };
      }
    }
    return { category: 'Custom', color: 'bg-gray-100 text-gray-800 border-gray-200' };
  };

  if (!isOpen) {
    return null;
  }

  return (
    <div className="absolute top-full right-0 mt-2 w-96 bg-white border border-gray-200 rounded-lg shadow-lg z-10 p-4">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold text-gray-900">Edit Profile</h2>
        <button
          onClick={onToggle}
          className="text-gray-400 hover:text-gray-600"
        >
          ×
        </button>
      </div>

      {/* Selected Tags Summary */}
      {profile.tags.length > 0 && (
        <div>
          <h4 className="text-sm font-medium text-gray-700 mb-2">Selected Tags ({profile.tags.length})</h4>
          <div className="flex flex-wrap gap-2">
            {profile.tags.map((tag, index) => {
              const { color } = getTagCategory(tag);
              return (
                <span
                  key={index}
                  className={`inline-flex items-center px-3 py-1 rounded-full text-sm border ${color}`}
                >
                  {tag}
                  <button
                    onClick={() => removeTag(tag)}
                    className="ml-2 hover:text-red-600"
                  >
                    ×
                  </button>
                </span>
              );
            })}
          </div>
        </div>
      )}

      {/* Tag Categories */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">
          Profile Tags
        </label>
        
        {/* Tag Categories */}
        {Object.entries(TAG_CATEGORIES).map(([category, data]) => (
          <div key={category} className="mb-4">
            <h4 className="text-sm font-medium text-gray-700 mb-2">{category}</h4>
            <div className="flex flex-wrap gap-2">
              {data.tags.map((tag) => (
                <button
                  key={tag}
                  onClick={() => profile.tags.includes(tag) ? removeTag(tag) : addTag(tag)}
                  className={`px-3 py-1 rounded-full text-sm border transition-colors ${
                    profile.tags.includes(tag)
                      ? `${data.color} ring-2 ring-offset-1 ring-blue-500`
                      : 'bg-gray-50 text-gray-600 border-gray-200 hover:bg-gray-100'
                  }`}
                >
                  {tag}
                </button>
              ))}
            </div>
          </div>
        ))}

        {/* Custom Tag Input */}
        <div className="mt-4">
          <h4 className="text-sm font-medium text-gray-700 mb-2">Custom Tags</h4>
          <div className="flex space-x-2">
            <input
              type="text"
              value={newTag}
              onChange={(e) => setNewTag(e.target.value)}
              onKeyPress={handleKeyPress}
              placeholder="Add custom tag"
              className="flex-1 px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
            />
            <button
              onClick={() => addTag(newTag)}
              disabled={!newTag.trim()}
              className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Add
            </button>
          </div>
        </div>
      </div>

      {/* Save Button */}
      <div className="pt-4 border-t border-gray-200">
        <button
          onClick={saveProfile}
          disabled={isLoading}
          className="w-full px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-green-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {isLoading ? 'Saving...' : 'Save Profile'}
        </button>
      </div>
    </div>
  );
} 