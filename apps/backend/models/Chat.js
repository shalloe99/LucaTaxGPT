// Chat model with file-based persistence for demo/dev
const fs = require('fs').promises;
const path = require('path');
const { v4: uuidv4 } = require('uuid');

const STORAGE_DIR = path.join(__dirname, '..', 'storage');
const CHATS_FILE = path.join(STORAGE_DIR, 'chats.json');



let chats = [];
let saveTimeout = null;
const SAVE_DELAY = 15000; // 15 second delay to reduce I/O during streaming requests

// Helper to ensure commit structures exist on a chat object
function ensureCommitStructure(chat) {
  if (!chat.commits) {
    chat.commits = [];
  }
  if (typeof chat.headCommitId === 'undefined') {
    chat.headCommitId = null;
  }
}

// Ensure storage directory exists
async function ensureStorageDir() {
  try {
    await fs.access(STORAGE_DIR);
  } catch {
    await fs.mkdir(STORAGE_DIR, { recursive: true });
  }
}

// Migrate existing chats to have proper commit structure
function migrateChatsToCommitStructure() {
  for (const chat of chats) {
    ensureCommitStructure(chat);
    
    // If chat has messages but no commits, create commits for them
    if (chat.messages && chat.messages.length > 0 && (!chat.commits || chat.commits.length === 0)) {
      console.log(`🔄 Migrating chat ${chat.id} to commit structure...`);
      
      for (const message of chat.messages) {
        createCommitForMessage(chat, message, {
          action: message.role === 'user' ? 'new' : 'amend',
          amendedFromCommitId: message.role === 'assistant' ? findLatestCommitIdForMessage(chat, message.parentUserId) : null,
          final: true
        });
      }
      
      console.log(`✅ Chat ${chat.id} migrated with ${chat.commits.length} commits`);
    }
  }
}

// Load chats from file
async function loadChatsFromFile() {
  try {
    await ensureStorageDir();
    const data = await fs.readFile(CHATS_FILE, 'utf8');
    const loadedChats = JSON.parse(data);
    
    // Clear the existing array and push the loaded chats
    chats.length = 0;
    chats.push(...loadedChats);
    
    console.log(`📂 Loaded ${chats.length} chats from storage`);
    
    // Migrate any existing chats to have proper commit structure
    migrateChatsToCommitStructure();
  } catch (error) {
    if (error.code === 'ENOENT') {
      console.log('📂 No existing chats file found, starting fresh');
      chats.length = 0;
      bootstrapDemoData();
    } else {
      console.error('❌ Error loading chats from file:', error);
      chats.length = 0;
      bootstrapDemoData();
    }
  }
}

// Debounced save function to prevent excessive file writes
function debouncedSave() {
  if (saveTimeout) {
    clearTimeout(saveTimeout);
  }
  
  saveTimeout = setTimeout(async () => {
    try {
      await ensureStorageDir();
      await fs.writeFile(CHATS_FILE, JSON.stringify(chats, null, 2));
      console.log(`💾 Saved ${chats.length} chats to storage (debounced)`);
    } catch (error) {
      console.error('❌ Error saving chats to file:', error);
    }
  }, SAVE_DELAY);
}

// Legacy function for backward compatibility (now uses debounced save)
async function saveChatsToFile() {
  debouncedSave();
}

// Bootstrap demo data for a single user
function bootstrapDemoData() {
  if (chats.length > 0) {
    return; // Only run once
  }
  
  const demoUserId = "demo-user";
  
  const demoChats = [
    {
      id: uuidv4(),
      userId: demoUserId,
      title: 'Tax Deductions for Homeowners',
      contextFilters: {
        federalTaxCode: true,
        stateTaxCodes: ['California'],
        profileTags: ['Married', 'Homeowner', 'Employee'],
        filingEntity: 'individuals'
      },
      messages: [
        {
          id: 'demo-msg-1',
          role: 'user',
          content: 'What are the main deductions I can claim for my home?',
          timestamp: new Date(Date.now() - 3600000).toISOString(),
          status: 'complete'
        },
        {
          id: 'demo-msg-2',
          role: 'assistant',
          content: 'As a homeowner, you can claim several key deductions:\n\n1. **Mortgage Interest**: Deduct interest on up to $750,000 of mortgage debt\n2. **Property Taxes**: Deduct state and local property taxes (capped at $10,000 total with SALT)\n3. **Home Office**: If you work from home, you can deduct a portion of expenses\n4. **Points**: Deduct points paid to obtain your mortgage\n5. **Energy Credits**: Various credits for energy-efficient improvements\n\nWould you like me to explain any of these in more detail?',
          timestamp: new Date(Date.now() - 3590000).toISOString(),
          status: 'complete',
          parentUserId: 'demo-msg-1'
        }
      ],
      commits: [],
      headCommitId: null,
      createdAt: new Date(Date.now() - 3600000).toISOString(),
      updatedAt: new Date(Date.now() - 3590000).toISOString(),
    },
    {
      id: uuidv4(),
      userId: demoUserId,
      title: 'Self-Employment Tax Questions',
      contextFilters: {
        federalTaxCode: true,
        stateTaxCodes: ['Texas', 'Florida'],
        profileTags: ['Self-Employed', 'Single'],
        filingEntity: 'individuals'
      },
      messages: [
        {
          id: 'demo-msg-3',
          role: 'user',
          content: 'How do I calculate self-employment tax?',
          timestamp: new Date(Date.now() - 7200000).toISOString(),
          status: 'complete'
        },
        {
          id: 'demo-msg-4',
          role: 'assistant',
          content: 'Self-employment tax consists of two parts:\n\n1. **Social Security Tax**: 12.4% on the first $160,200 of net earnings (2023)\n2. **Medicare Tax**: 2.9% on all net earnings\n\n**Total Rate**: 15.3%\n\n**Calculation**:\n- Take your net earnings from self-employment\n- Multiply by 0.9235 (to account for employer portion)\n- Apply the 15.3% rate\n\n**Example**: If you earn $50,000 net:\n$50,000 × 0.9235 × 0.153 = $7,065\n\nYou can deduct half of this amount on your 1040.',
          timestamp: new Date(Date.now() - 7190000).toISOString(),
          status: 'complete',
          parentUserId: 'demo-msg-3'
        }
      ],
      commits: [],
      headCommitId: null,
      createdAt: new Date(Date.now() - 7200000).toISOString(),
      updatedAt: new Date(Date.now() - 7190000).toISOString(),
    },
    {
      id: uuidv4(),
      userId: demoUserId,
      title: 'Student Loan Interest Deduction',
      contextFilters: {
        federalTaxCode: true,
        stateTaxCodes: ['New York'],
        profileTags: ['Student', 'Single'],
        filingEntity: 'individuals'
      },
      messages: [
        {
          id: 'demo-msg-5',
          role: 'user',
          content: 'Can I deduct student loan interest?',
          timestamp: new Date(Date.now() - 86400000).toISOString(),
          status: 'complete'
        },
        {
          id: 'demo-msg-6',
          role: 'assistant',
          content: 'Yes, you can deduct up to $2,500 in student loan interest if you meet these requirements:\n\n**Eligibility**:\n- You paid interest on a qualified student loan\n- Your modified adjusted gross income (MAGI) is less than $85,000 (single) or $175,000 (married filing jointly)\n- You\'re legally obligated to pay interest on the loan\n- The loan was taken out solely to pay qualified education expenses\n\n**Phase-out**:\n- Single: $70,000 - $85,000 MAGI\n- Married: $140,000 - $175,000 MAGI\n\n**What counts**:\n- Federal and private student loans\n- Interest paid during the tax year\n- Both principal and interest payments count toward the $2,500 limit',
          timestamp: new Date(Date.now() - 86300000).toISOString(),
          status: 'complete',
          parentUserId: 'demo-msg-5'
        }
      ],
      commits: [],
      headCommitId: null,
      createdAt: new Date(Date.now() - 86400000).toISOString(),
      updatedAt: new Date(Date.now() - 86300000).toISOString(),
    }
  ];
  
  chats.push(...demoChats);
  
  // Now create commits for all existing messages to establish proper history
  for (const chat of demoChats) {
    ensureCommitStructure(chat);
    for (const message of chat.messages) {
      createCommitForMessage(chat, message, {
        action: message.role === 'user' ? 'new' : 'amend',
        amendedFromCommitId: message.role === 'assistant' ? findLatestCommitIdForMessage(chat, message.parentUserId) : null,
        final: true
      });
    }
  }
}

function createChat({
  id,
  userId,
  title = 'New Chat',
  contextFilters = {
    federalTaxCode: true,
    stateTaxCodes: [],
    profileTags: [],
    filingEntity: 'individuals'
  },
  messages = [],
}) {
  const chat = {
    id: id || uuidv4(),
    userId,
    title,
    contextFilters,
    messages, // [{id, role, content, timestamp}]
    commits: [],
    headCommitId: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  ensureCommitStructure(chat);
  return chat;
}

// Initialize chats on module load
loadChatsFromFile().catch(error => {
  console.error('❌ Failed to initialize chats:', error);
});

// Helper function to add a message to a chat
function addMessage(chatId, messageData, userId = "demo-user") {
  const chat = chats.find(c => c.id === chatId && c.userId === userId);
  if (!chat) {
    throw new Error(`Chat with id ${chatId} not found`);
  }
  ensureCommitStructure(chat);
  
  const message = {
    id: Date.now().toString() + Math.random().toString(36).slice(2),
    role: messageData.role,
    content: messageData.content,
    timestamp: new Date().toISOString(),
    status: messageData.status || 'complete',
    parentUserId: messageData.parentUserId || null
  };
  
  chat.messages.push(message);
  // If this is an assistant variant linked to a specific user message, record linkage on the parent user message
  if (message.role === 'assistant' && message.parentUserId) {
    const parentIdx = chat.messages.findIndex(m => m.id === message.parentUserId && m.role === 'user');
    if (parentIdx !== -1) {
      const parent = chat.messages[parentIdx];
      const updatedParent = {
        ...parent,
        assistantVariants: Array.isArray(parent.assistantVariants)
          ? [...parent.assistantVariants, message.id]
          : [message.id]
      };
      chat.messages[parentIdx] = updatedParent;
    }
  }
  chat.updatedAt = new Date().toISOString();
  
  // Create a commit for certain messages
  // Rule: Always commit user messages immediately. For assistant, commit only on final states
  const isFinalAssistant = message.role === 'assistant' && ['complete', 'cancelled', 'error'].includes(message.status);
  if (message.role === 'user' || isFinalAssistant) {
    createCommitForMessage(chat, message, {
      action: message.role === 'user' ? 'new' : 'amend',
      amendedFromCommitId: findLatestCommitIdForMessage(chat, message.id) || null,
      final: isFinalAssistant
    });
  }
  
  // Trigger debounced save
  debouncedSave();
  
  return message;
}

// Helper function to update a message
function updateMessage(chatId, messageId, updates, userId = "demo-user") {
  const chat = chats.find(c => c.id === chatId && c.userId === userId);
  if (!chat) {
    throw new Error(`Chat with id ${chatId} not found`);
  }
  ensureCommitStructure(chat);
  
  const messageIndex = chat.messages.findIndex(m => m.id === messageId);
  if (messageIndex === -1) {
    throw new Error(`Message with id ${messageId} not found in chat ${chatId}`);
  }
  
  // Update the message
  const previous = chat.messages[messageIndex];
  const updated = {
    ...chat.messages[messageIndex],
    ...updates,
    timestamp: new Date().toISOString() // Update timestamp when content changes
  };
  chat.messages[messageIndex] = updated;
  
  chat.updatedAt = new Date().toISOString();
  
  // Commit logic on transitions to final states for assistant messages
  const transitionedToFinal = previous.role === 'assistant'
    && ['complete', 'cancelled', 'error'].includes(updated.status)
    && previous.status !== updated.status;
  if (transitionedToFinal) {
    createCommitForMessage(chat, updated, {
      action: 'amend',
      amendedFromCommitId: findLatestCommitIdForMessage(chat, messageId) || null,
      final: true
    });
  }

  // Trigger debounced save
  debouncedSave();
  
  return updated;
}

// Helper function to find a chat by ID (with user filtering for security)
function findChatById(chatId, userId = "demo-user") {
  return chats.find(c => c.id === chatId && c.userId === userId);
}

// Find latest commit ID associated with a given message ID
function findLatestCommitIdForMessage(chat, messageId) {
  ensureCommitStructure(chat);
  for (let i = chat.commits.length - 1; i >= 0; i--) {
    if (chat.commits[i]?.message?.id === messageId) {
      return chat.commits[i].id;
    }
  }
  return null;
}

// Core commit creator
function createCommitForMessage(chat, messageSnapshot, metadata = {}) {
  ensureCommitStructure(chat);
  const commit = {
    id: uuidv4(),
    parentId: chat.headCommitId,
    message: {
      id: messageSnapshot.id,
      role: messageSnapshot.role,
      content: messageSnapshot.content,
      timestamp: messageSnapshot.timestamp,
      status: messageSnapshot.status,
      parentUserId: messageSnapshot.parentUserId || null
    },
    metadata: {
      action: metadata.action || 'new',
      amendedFromCommitId: metadata.amendedFromCommitId || null,
      rebased: metadata.rebased || false,
      final: !!metadata.final
    },
    createdAt: new Date().toISOString()
  };
  chat.commits.push(commit);
  chat.headCommitId = commit.id;
  chat.updatedAt = new Date().toISOString();
  return commit;
}

// Public helper to record assistant completion/cancellation as a commit
function recordAssistantFinalCommit(chatId, messageId, userId = 'demo-user') {
  const chat = chats.find(c => c.id === chatId && c.userId === userId);
  if (!chat) {
    throw new Error(`Chat with id ${chatId} not found`);
  }
  ensureCommitStructure(chat);
  const msg = chat.messages.find(m => m.id === messageId);
  if (!msg) {
    throw new Error(`Message with id ${messageId} not found in chat ${chatId}`);
  }
  const isFinal = ['complete', 'cancelled', 'error'].includes(msg.status);
  if (!isFinal) return null;
  return createCommitForMessage(chat, msg, {
    action: 'amend',
    amendedFromCommitId: findLatestCommitIdForMessage(chat, messageId) || null,
    final: true
  });
}

// Rebuild chat.messages from commits (linear history assumed)
function rebuildMessagesFromCommits(chat) {
  ensureCommitStructure(chat);
  const messagesById = new Map();
  const order = [];
  for (const commit of chat.commits) {
    const m = commit.message;
    if (!messagesById.has(m.id)) {
      messagesById.set(m.id, { ...m });
      order.push(m.id);
    } else {
      messagesById.set(m.id, { ...messagesById.get(m.id), ...m });
    }
  }
  chat.messages = order.map(id => messagesById.get(id));
  chat.updatedAt = new Date().toISOString();
}

// Soft rebase: replace the edited commit's message and drop subsequent commits
function softRebaseEditMessage(chatId, messageId, updates, userId = 'demo-user') {
  const chat = chats.find(c => c.id === chatId && c.userId === userId);
  if (!chat) {
    throw new Error(`Chat with id ${chatId} not found`);
  }
  ensureCommitStructure(chat);
  const targetIdx = (() => {
    for (let i = chat.commits.length - 1; i >= 0; i--) {
      if (chat.commits[i]?.message?.id === messageId) return i;
    }
    return -1;
  })();
  if (targetIdx === -1) {
    throw new Error(`No commit found for message ${messageId}`);
  }
  const originalCommit = chat.commits[targetIdx];
  // Drop subsequent commits
  chat.commits = chat.commits.slice(0, targetIdx); // keep up to but excluding target
  chat.headCommitId = chat.commits.length ? chat.commits[chat.commits.length - 1].id : null;
  // Create new commit with updated message on top of previous head (soft rebase)
  const newMessage = {
    ...originalCommit.message,
    ...updates,
    timestamp: new Date().toISOString()
  };
  const commit = createCommitForMessage(chat, newMessage, {
    action: 'rebase_edit',
    rebased: true,
    amendedFromCommitId: originalCommit.id,
    final: true
  });
  // Rebuild conversation messages to reflect new history
  rebuildMessagesFromCommits(chat);
  // Update the corresponding message in messages array if exists
  const msgIdx = chat.messages.findIndex(m => m.id === messageId);
  if (msgIdx !== -1) {
    chat.messages[msgIdx] = newMessage;
  }
  debouncedSave();
  return commit;
}

// Begin a reload of an assistant message: preserve current content into revisions array
function beginReloadAssistantMessage(chatId, assistantMessageId, userId = 'demo-user', opts = { streaming: true }) {
  const chat = chats.find(c => c.id === chatId && c.userId === userId);
  if (!chat) {
    throw new Error(`Chat with id ${chatId} not found`);
  }
  ensureCommitStructure(chat);
  const idx = chat.messages.findIndex(m => m.id === assistantMessageId);
  if (idx === -1) {
    throw new Error(`Assistant message ${assistantMessageId} not found in chat ${chatId}`);
  }
  const msg = chat.messages[idx];
  if (msg.role !== 'assistant') {
    throw new Error('Can only reload assistant messages');
  }
  // Preserve previous content as a revision entry
  if (typeof msg.content === 'string' && msg.content.length > 0) {
    msg.revisions = Array.isArray(msg.revisions) ? msg.revisions : [];
    msg.revisions.push({
      content: msg.content,
      timestamp: msg.timestamp || new Date().toISOString(),
      status: msg.status || 'complete'
    });
  }
  // Reset content and set status to pending/streaming for regeneration
  msg.content = '';
  msg.status = opts.streaming ? 'streaming' : 'pending';
  msg.timestamp = new Date().toISOString();
  chat.messages[idx] = msg;
  chat.updatedAt = new Date().toISOString();
  debouncedSave();
  return msg;
}

module.exports = {
  chats,
  createChat,
  bootstrapDemoData,
  loadChatsFromFile,
  saveChatsToFile,
  addMessage,
  updateMessage,
  findChatById,
  recordAssistantFinalCommit,
  softRebaseEditMessage,
  rebuildMessagesFromCommits,
  beginReloadAssistantMessage,
  migrateChatsToCommitStructure,
}; 