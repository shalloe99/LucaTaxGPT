const express = require('express');
const router = express.Router();
const UserProfile = require('../models/UserProfile');

// Get user profile
router.get('/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    const { sessionId } = req.query;
    
    let profile = await UserProfile.findOne({ userId });
    
    if (!profile) {
      // Create new profile if doesn't exist
      profile = new UserProfile({
        userId,
        sessionId: sessionId || userId,
        tags: [],
        context: '',
        filingEntity: 'individuals'
      });
      await profile.save();
    }
    
    res.json({
      success: true,
      profile
    });
  } catch (error) {
    console.error('Error fetching user profile:', error);
    res.status(500).json({ error: 'Failed to fetch user profile' });
  }
});

// Update user profile
router.put('/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    const updates = req.body;
    
    const profile = await UserProfile.findOneAndUpdate(
      { userId },
      { ...updates, updatedAt: new Date() },
      { new: true, upsert: true }
    );
    
    res.json({
      success: true,
      profile
    });
  } catch (error) {
    console.error('Error updating user profile:', error);
    res.status(500).json({ error: 'Failed to update user profile' });
  }
});

// Add tag to user profile
router.post('/:userId/tags', async (req, res) => {
  try {
    const { userId } = req.params;
    const { tag } = req.body;
    
    if (!tag || typeof tag !== 'string') {
      return res.status(400).json({ error: 'Tag is required and must be a string' });
    }
    
    const profile = await UserProfile.findOne({ userId });
    if (!profile) {
      return res.status(404).json({ error: 'User profile not found' });
    }
    
    // Add tag if not already present
    if (!profile.tags.includes(tag)) {
      profile.tags.push(tag);
      profile.updatedAt = new Date();
      await profile.save();
    }
    
    res.json({
      success: true,
      tags: profile.tags
    });
  } catch (error) {
    console.error('Error adding tag:', error);
    res.status(500).json({ error: 'Failed to add tag' });
  }
});

// Remove tag from user profile
router.delete('/:userId/tags/:tag', async (req, res) => {
  try {
    const { userId, tag } = req.params;
    
    const profile = await UserProfile.findOne({ userId });
    if (!profile) {
      return res.status(404).json({ error: 'User profile not found' });
    }
    
    // Remove tag
    profile.tags = profile.tags.filter(t => t !== tag);
    profile.updatedAt = new Date();
    await profile.save();
    
    res.json({
      success: true,
      tags: profile.tags
    });
  } catch (error) {
    console.error('Error removing tag:', error);
    res.status(500).json({ error: 'Failed to remove tag' });
  }
});

// Update user context
router.put('/:userId/context', async (req, res) => {
  try {
    const { userId } = req.params;
    const { context } = req.body;
    
    if (typeof context !== 'string') {
      return res.status(400).json({ error: 'Context must be a string' });
    }
    
    const profile = await UserProfile.findOneAndUpdate(
      { userId },
      { context, updatedAt: new Date() },
      { new: true }
    );
    
    if (!profile) {
      return res.status(404).json({ error: 'User profile not found' });
    }
    
    res.json({
      success: true,
      context: profile.context
    });
  } catch (error) {
    console.error('Error updating context:', error);
    res.status(500).json({ error: 'Failed to update context' });
  }
});

// Update filing entity
router.put('/:userId/filing-entity', async (req, res) => {
  try {
    const { userId } = req.params;
    const { filingEntity, state } = req.body;
    
    const validEntities = [
      'individuals',
      'business',
      'self-employed',
      'charities',
      'nonprofits',
      'international',
      'governmental',
      'federal-state-local',
      'indian-tribal'
    ];
    
    if (!validEntities.includes(filingEntity)) {
      return res.status(400).json({ error: 'Invalid filing entity' });
    }
    
    const updateData = { 
      filingEntity, 
      updatedAt: new Date() 
    };
    
    if (state) {
      updateData.state = state;
    }
    
    const profile = await UserProfile.findOneAndUpdate(
      { userId },
      updateData,
      { new: true }
    );
    
    if (!profile) {
      return res.status(404).json({ error: 'User profile not found' });
    }
    
    res.json({
      success: true,
      filingEntity: profile.filingEntity,
      state: profile.state
    });
  } catch (error) {
    console.error('Error updating filing entity:', error);
    res.status(500).json({ error: 'Failed to update filing entity' });
  }
});

// Get all tags (for autocomplete)
router.get('/tags/all', async (req, res) => {
  try {
    const profiles = await UserProfile.find({}, 'tags');
    const allTags = new Set();
    
    profiles.forEach(profile => {
      profile.tags.forEach(tag => allTags.add(tag));
    });
    
    res.json({
      success: true,
      tags: Array.from(allTags).sort()
    });
  } catch (error) {
    console.error('Error fetching all tags:', error);
    res.status(500).json({ error: 'Failed to fetch tags' });
  }
});

// Get popular tags
router.get('/tags/popular', async (req, res) => {
  try {
    const profiles = await UserProfile.find({}, 'tags');
    const tagCounts = {};
    
    profiles.forEach(profile => {
      profile.tags.forEach(tag => {
        tagCounts[tag] = (tagCounts[tag] || 0) + 1;
      });
    });
    
    const popularTags = Object.entries(tagCounts)
      .sort(([,a], [,b]) => b - a)
      .slice(0, 10)
      .map(([tag, count]) => ({ tag, count }));
    
    res.json({
      success: true,
      popularTags
    });
  } catch (error) {
    console.error('Error fetching popular tags:', error);
    res.status(500).json({ error: 'Failed to fetch popular tags' });
  }
});

module.exports = router; 