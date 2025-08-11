const Document = require('../models/Document');
const { ChromaClient } = require('chromadb');

let collection;

// Initialize ChromaDB client
// TODO: When Chroma JS client supports 'host', 'port', 'ssl', update this to avoid deprecated 'path' argument warning.
const chromaClient = new ChromaClient({
  path: process.env.CHROMA_URL || "http://localhost:8000"
});

// Initialize or get collection
async function getCollection() {
  if (!collection) {
    try {
      collection = await chromaClient.getOrCreateCollection({
        name: "tax_documents",
        metadata: { "hnsw:space": "cosine" }
      });
    } catch (error) {
      console.error('Error initializing ChromaDB collection:', error);
      throw error;
    }
  }
  return collection;
}

// Create embeddings for documents
async function createEmbeddings(documentIds, force = false) {
  console.log(`Starting embedding creation for ${documentIds.length} documents`);
  
  const results = {
    success: 0,
    failed: 0,
    skipped: 0,
    errors: []
  };
  
  const collection = await getCollection();
  
  for (const docId of documentIds) {
    try {
      const document = await Document.findById(docId);
      if (!document) {
        results.errors.push(`Document ${docId} not found`);
        results.failed++;
        continue;
      }
      
      // Skip if already embedded and not forced
      if (document.embeddingId && !force) {
        results.skipped++;
        continue;
      }
      
      // Create embedding
      await createDocumentEmbedding(document, collection);
      results.success++;
      
    } catch (error) {
      console.error(`Error creating embedding for document ${docId}:`, error);
      results.errors.push(`Document ${docId}: ${error.message}`);
      results.failed++;
      
      // Update document status to error
      await Document.findByIdAndUpdate(docId, {
        status: 'error',
        errorMessage: error.message,
        updatedAt: new Date()
      });
    }
  }
  
  console.log(`Embedding creation completed: ${results.success} success, ${results.failed} failed, ${results.skipped} skipped`);
  
  return results;
}

// Create embedding for a single document
async function createDocumentEmbedding(document, collection) {
  try {
    if (!document.content) {
      throw new Error('Document content not available');
    }
    
    // Prepare text for embedding
    const text = prepareTextForEmbedding(document);
    
    // Create embedding using OpenAI
    const embeddingResponse = await openai.embeddings.create({
      model: "text-embedding-3-small",
      input: text,
      encoding_format: "float"
    });
    
    const embedding = embeddingResponse.data[0].embedding;
    
    // Store in ChromaDB
    const embeddingId = `doc_${document._id}`;
    await collection.add({
      ids: [embeddingId],
      embeddings: [embedding],
      documents: [text],
      metadatas: [{
        documentId: document._id.toString(),
        title: document.title,
        formNumber: document.formNumber,
        year: document.year,
        category: document.category,
        tags: document.tags.join(', ')
      }]
    });
    
    // Update document with embedding info
    document.embeddings = embedding;
    document.embeddingId = embeddingId;
    document.status = 'embedded';
    document.updatedAt = new Date();
    
    await document.save();
    
    console.log(`Created embedding for: ${document.title}`);
    
  } catch (error) {
    console.error(`Error creating embedding for ${document.title}:`, error);
    throw error;
  }
}

// Prepare text for embedding
function prepareTextForEmbedding(document) {
  let text = `Title: ${document.title}\n`;
  text += `Form Number: ${document.formNumber}\n`;
  text += `Year: ${document.year}\n`;
  text += `Category: ${document.category}\n`;
  
  if (document.tags && document.tags.length > 0) {
    text += `Tags: ${document.tags.join(', ')}\n`;
  }
  
  text += `\nContent:\n${document.content}`;
  
  // Limit text length for embedding (max 8000 tokens ~ 32000 characters)
  if (text.length > 32000) {
    text = text.substring(0, 32000);
  }
  
  return text;
}

// Search documents using embeddings
async function searchDocuments(query, domainKnowledge = {}, limit = 5) {
  try {
    const collection = await getCollection();
    
    // Create query embedding
    const queryEmbedding = await openai.embeddings.create({
      model: "text-embedding-3-small",
      input: query,
      encoding_format: "float"
    });
    
    const embedding = queryEmbedding.data[0].embedding;
    
    // Build filter based on domain knowledge
    const filter = buildSearchFilter(domainKnowledge);
    
    // Search in ChromaDB
    const results = await collection.query({
      queryEmbeddings: [embedding],
      nResults: limit,
      where: filter
    });
    
    // Get document details
    const documents = [];
    if (results.ids && results.ids[0]) {
      for (let i = 0; i < results.ids[0].length; i++) {
        const documentId = results.metadatas[0][i].documentId;
        const document = await Document.findById(documentId);
        
        if (document) {
          documents.push({
            ...document.toObject(),
            similarity: results.distances[0][i]
          });
        }
      }
    }
    
    return documents;
    
  } catch (error) {
    console.error('Error searching documents:', error);
    // Fallback to text search
    return await fallbackTextSearch(query, domainKnowledge, limit);
  }
}

// Build search filter based on domain knowledge
function buildSearchFilter(domainKnowledge) {
  const filter = {};
  
  if (domainKnowledge.filingEntity) {
    filter.category = { $in: [domainKnowledge.filingEntity] };
  }
  
  if (domainKnowledge.stateTaxCode) {
    filter.tags = { $contains: domainKnowledge.stateTaxCode.toLowerCase() };
  }
  
  return Object.keys(filter).length > 0 ? filter : undefined;
}

// Fallback text search
async function fallbackTextSearch(query, domainKnowledge, limit) {
  try {
    let searchQuery = { $text: { $search: query } };
    
    // Add domain knowledge filters
    if (domainKnowledge.filingEntity) {
      searchQuery.category = domainKnowledge.filingEntity;
    }
    
    const documents = await Document.find(searchQuery)
      .sort({ score: { $meta: "textScore" } })
      .limit(limit)
      .select('title formNumber year category tags content');
    
    return documents.map(doc => ({
      ...doc.toObject(),
      similarity: 0.8 // Default similarity score
    }));
    
  } catch (error) {
    console.error('Error in fallback text search:', error);
    return [];
  }
}

// Get similar documents
async function getSimilarDocuments(documentId, limit = 5) {
  try {
    const document = await Document.findById(documentId);
    if (!document || !document.embeddings) {
      throw new Error('Document not found or no embeddings available');
    }
    
    const collection = await getCollection();
    
    const results = await collection.query({
      queryEmbeddings: [document.embeddings],
      nResults: limit + 1, // +1 to exclude the document itself
      where: {
        documentId: { $ne: documentId }
      }
    });
    
    const similarDocuments = [];
    if (results.ids && results.ids[0]) {
      for (let i = 0; i < results.ids[0].length; i++) {
        const docId = results.metadatas[0][i].documentId;
        const doc = await Document.findById(docId);
        
        if (doc) {
          similarDocuments.push({
            ...doc.toObject(),
            similarity: results.distances[0][i]
          });
        }
      }
    }
    
    return similarDocuments;
    
  } catch (error) {
    console.error('Error getting similar documents:', error);
    return [];
  }
}

// Delete embedding
async function deleteEmbedding(documentId) {
  try {
    const document = await Document.findById(documentId);
    if (!document || !document.embeddingId) {
      return;
    }
    
    const collection = await getCollection();
    await collection.delete({
      ids: [document.embeddingId]
    });
    
    // Update document
    document.embeddings = null;
    document.embeddingId = null;
    document.status = 'processed';
    document.updatedAt = new Date();
    
    await document.save();
    
    console.log(`Deleted embedding for: ${document.title}`);
    
  } catch (error) {
    console.error(`Error deleting embedding for document ${documentId}:`, error);
    throw error;
  }
}

// Get embedding statistics
async function getEmbeddingStats() {
  try {
    const collection = await getCollection();
    const count = await collection.count();
    
    const embeddedDocs = await Document.countDocuments({ 
      status: 'embedded',
      embeddingId: { $exists: true }
    });
    
    return {
      totalEmbeddings: count,
      embeddedDocuments: embeddedDocs
    };
    
  } catch (error) {
    console.error('Error getting embedding stats:', error);
    return {
      totalEmbeddings: 0,
      embeddedDocuments: 0
    };
  }
}

// Rebuild all embeddings
async function rebuildAllEmbeddings() {
  try {
    console.log('Starting rebuild of all embeddings');
    
    const documents = await Document.find({ 
      status: { $in: ['processed', 'embedded'] },
      content: { $exists: true, $ne: null }
    });
    
    const documentIds = documents.map(doc => doc._id);
    
    // Delete existing embeddings
    const collection = await getCollection();
    await collection.delete({
      where: {}
    });
    
    // Recreate embeddings
    const results = await createEmbeddings(documentIds, true);
    
    console.log(`Rebuild completed: ${results.success} documents processed`);
    
    return results;
    
  } catch (error) {
    console.error('Error rebuilding embeddings:', error);
    throw error;
  }
}

module.exports = {
  createEmbeddings,
  searchDocuments,
  getSimilarDocuments,
  deleteEmbedding,
  getEmbeddingStats,
  rebuildAllEmbeddings
}; 