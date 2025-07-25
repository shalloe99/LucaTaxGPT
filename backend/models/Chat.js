// In-memory chat model for demo/dev
const chats = [];
const { v4: uuidv4 } = require('uuid');

// Bootstrap demo data for a single user
function bootstrapDemoData() {
  if (chats.length > 0) return; // Only run once
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
          id: 'm1',
          role: 'user',
          content: 'What are the main deductions I can claim for my home?',
          timestamp: new Date(Date.now() - 3600000).toISOString()
        },
        {
          id: 'm2',
          role: 'assistant',
          content: 'You can claim mortgage interest, property taxes, and more.',
          timestamp: new Date(Date.now() - 3590000).toISOString()
        }
      ],
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
      messages: [],
      createdAt: new Date(Date.now() - 7200000).toISOString(),
      updatedAt: new Date(Date.now() - 7190000).toISOString(),
    },
    {
      id: uuidv4(),
      userId: demoUserId,
      title: 'Student Loan Interest Deduction',
      contextFilters: {
        federalTaxCode: false,
        stateTaxCodes: ['New York'],
        profileTags: ['Student', 'Single'],
        filingEntity: 'individuals'
      },
      messages: [],
      createdAt: new Date(Date.now() - 86400000).toISOString(),
      updatedAt: new Date(Date.now() - 86300000).toISOString(),
    }
  ];
  chats.push(...demoChats);
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
  return {
    id: id || uuidv4(),
    userId,
    title,
    contextFilters,
    messages, // [{id, role, content, timestamp}]
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

module.exports = {
  chats,
  createChat,
  bootstrapDemoData,
}; 