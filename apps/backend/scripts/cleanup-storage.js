#!/usr/bin/env node

/**
 * Cleanup script for chat storage
 * This script helps maintain consistency between frontend and backend chat data
 */

const fs = require('fs').promises;
const path = require('path');

const CHATS_FILE = path.join(__dirname, '../storage/chats.json');

async function cleanupStorage() {
  try {
    console.log('🧹 Starting storage cleanup...');
    
    // Check if storage directory exists
    const storageDir = path.join(__dirname, '..', 'storage');
    const chatsFile = path.join(storageDir, 'chats.json');
    
    // If chats.json exists, validate and clean it
    if (await fs.access(chatsFile).then(() => true).catch(() => false)) {
      console.log('📂 Found existing chats.json, validating...');
      
      try {
        const data = await fs.readFile(chatsFile, 'utf8');
        const chats = JSON.parse(data);
        
        if (!Array.isArray(chats)) {
          console.log('⚠️  chats.json is not an array, removing...');
          await fs.unlink(chatsFile);
          console.log('✅ Removed invalid chats.json');
        } else {
          console.log(`📊 Found ${chats.length} chats, validating structure...`);
          
          let validChats = 0;
          let invalidChats = 0;
          
          for (const chat of chats) {
            if (isValidChat(chat)) {
              validChats++;
            } else {
              invalidChats++;
            }
          }
          
          console.log(`✅ Valid chats: ${validChats}`);
          console.log(`❌ Invalid chats: ${invalidChats}`);
          
          if (invalidChats > 0) {
            console.log('🧹 Cleaning up invalid chats...');
            const cleanedChats = chats.filter(isValidChat);
            await fs.writeFile(chatsFile, JSON.stringify(cleanedChats, null, 2));
            console.log(`✅ Cleaned chats.json, kept ${cleanedChats.length} valid chats`);
          }
        }
      } catch (parseError) {
        console.log('❌ Error parsing chats.json, removing...');
        await fs.unlink(chatsFile);
        console.log('✅ Removed corrupted chats.json');
      }
    } else {
      console.log('📂 No existing chats.json found');
    }
    
    // Reset demo data if requested
    if (process.argv.includes('--reset-demo')) {
      console.log('🔄 Resetting demo data...');
      await resetDemoData();
    }
    
    console.log('✅ Storage cleanup completed');
  } catch (error) {
    console.error('❌ Error during storage cleanup:', error);
    process.exit(1);
  }
}

function isValidChat(chat) {
  // Basic validation
  if (!chat || typeof chat !== 'object') {
    return false;
  }
  
  if (!chat.id || typeof chat.id !== 'string') {
    return false;
  }
  
  if (!chat.userId || typeof chat.userId !== 'string') {
    return false;
  }
  
  if (!chat.title || typeof chat.title !== 'string') {
    return false;
  }
  
  if (!Array.isArray(chat.messages)) {
    return false;
  }
  
  // Validate messages
  for (const message of chat.messages) {
    if (!isValidMessage(message)) {
      return false;
    }
  }
  
  return true;
}

function isValidMessage(message) {
  if (!message || typeof message !== 'object') {
    return false;
  }
  
  if (!message.id || typeof message.id !== 'string') {
    return false;
  }
  
  if (!message.role || !['user', 'assistant'].includes(message.role)) {
    return false;
  }
  
  if (!message.content || typeof message.content !== 'string') {
    return false;
  }
  
  if (!message.timestamp) {
    return false;
  }
  
  return true;
}

async function ensureStorageDir() {
  const storageDir = path.dirname(CHATS_FILE);
  try {
    await fs.mkdir(storageDir, { recursive: true });
  } catch (error) {
    console.error('Error creating storage directory:', error);
  }
}

async function resetDemoData() {
  try {
    const storageDir = path.join(__dirname, '..', 'storage');
    const chatsFile = path.join(storageDir, 'chats.json');
    
    // Remove existing chats.json
    if (await fs.access(chatsFile).then(() => true).catch(() => false)) {
      await fs.unlink(chatsFile);
      console.log('🗑️  Removed existing chats.json');
    }
    
    // Import and reinitialize the Chat model to trigger bootstrap
    const Chat = require('../models/Chat');
    
    // Force reload of demo data
    await Chat.loadChatsFromFile();
    
    console.log('✅ Demo data reset completed');
  } catch (error) {
    console.error('❌ Error resetting demo data:', error);
  }
}

// Run cleanup if this script is executed directly
if (require.main === module) {
  cleanupStorage();
}

module.exports = { cleanupStorage }; 