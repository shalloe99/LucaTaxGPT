const Document = require('../models/Document');

// Analyze and tag documents
async function analyzeAndTag(documentIds, force = false) {
  console.log(`Starting analysis of ${documentIds.length} documents`);
  
  const results = {
    success: 0,
    failed: 0,
    skipped: 0,
    errors: []
  };
  
  for (const docId of documentIds) {
    try {
      const document = await Document.findById(docId);
      if (!document) {
        results.errors.push(`Document ${docId} not found`);
        results.failed++;
        continue;
      }
      
      // Skip if already analyzed and not forced
      if (document.tags && document.tags.length > 0 && !force) {
        results.skipped++;
        continue;
      }
      
      // Analyze the document
      await analyzeDocument(document);
      results.success++;
      
    } catch (error) {
      console.error(`Error analyzing document ${docId}:`, error);
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
  
  console.log(`Analysis completed: ${results.success} success, ${results.failed} failed, ${results.skipped} skipped`);
  
  return results;
}

// Analyze a single document
async function analyzeDocument(document) {
  try {
    if (!document.content) {
      throw new Error('Document content not available');
    }
    
    // Prepare content for analysis (limit to first 4000 characters)
    const content = document.content.substring(0, 4000);
    
    // Create analysis prompt
    const prompt = createAnalysisPrompt(document, content);
    
    // Get analysis from OpenAI
    const completion = await openai.chat.completions.create({
      model: "gpt-4",
      messages: [
        {
          role: "system",
          content: "You are a tax document analysis expert. Analyze the provided tax document content and extract relevant tags, categories, and key information."
        },
        {
          role: "user",
          content: prompt
        }
      ],
      temperature: 0.3,
      max_tokens: 1000
    });
    
    const analysis = completion.choices[0].message.content;
    
    // Parse the analysis response
    const parsedAnalysis = parseAnalysisResponse(analysis);
    
    // Update document with analysis results
    document.tags = parsedAnalysis.tags;
    document.metadata = {
      ...document.metadata,
      ...parsedAnalysis.metadata
    };
    document.updatedAt = new Date();
    
    await document.save();
    
    console.log(`Analyzed: ${document.title} - Tags: ${parsedAnalysis.tags.join(', ')}`);
    
  } catch (error) {
    console.error(`Error analyzing ${document.title}:`, error);
    throw error;
  }
}

// Create analysis prompt
function createAnalysisPrompt(document, content) {
  return `
Analyze the following tax document and provide structured information:

Document Information:
- Title: ${document.title}
- Form Number: ${document.formNumber}
- Year: ${document.year}
- Category: ${document.category}

Document Content (first 4000 characters):
${content}

Please provide the analysis in the following JSON format:
{
  "tags": ["tag1", "tag2", "tag3"],
  "metadata": {
    "taxTopics": ["topic1", "topic2"],
    "filingStatus": ["individual", "business", "self-employed"],
    "deductions": ["deduction1", "deduction2"],
    "credits": ["credit1", "credit2"],
    "deadlines": ["deadline1"],
    "requirements": ["requirement1", "requirement2"]
  }
}

Focus on:
1. Tax topics covered (e.g., income, deductions, credits, filing status)
2. Applicable filing entities (individuals, businesses, etc.)
3. Specific deductions or credits mentioned
4. Important deadlines or requirements
5. Key tax concepts or terms

Tags should be concise, relevant, and searchable. Use common tax terminology.
`;
}

// Parse analysis response
function parseAnalysisResponse(analysis) {
  try {
    // Try to extract JSON from the response
    const jsonMatch = analysis.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);
      return {
        tags: parsed.tags || [],
        metadata: parsed.metadata || {}
      };
    }
    
    // Fallback: extract tags from text
    const tags = extractTagsFromText(analysis);
    return {
      tags,
      metadata: {}
    };
    
  } catch (error) {
    console.error('Error parsing analysis response:', error);
    // Fallback: extract tags from text
    const tags = extractTagsFromText(analysis);
    return {
      tags,
      metadata: {}
    };
  }
}

// Extract tags from text (fallback method)
function extractTagsFromText(text) {
  const commonTaxTerms = [
    'income', 'deduction', 'credit', 'filing', 'tax', 'form', 'schedule',
    'individual', 'business', 'self-employed', 'married', 'single',
    'dependent', 'exemption', 'standard deduction', 'itemized',
    'earned income', 'investment income', 'capital gains', 'dividends',
    'interest', 'rental income', 'business income', 'self-employment',
    'retirement', 'ira', '401k', 'hsa', 'fsa', 'medical', 'charitable',
    'mortgage interest', 'property tax', 'state tax', 'local tax'
  ];
  
  const tags = [];
  const textLower = text.toLowerCase();
  
  commonTaxTerms.forEach(term => {
    if (textLower.includes(term)) {
      tags.push(term);
    }
  });
  
  return tags.slice(0, 10); // Limit to 10 tags
}

// Get document summary
async function getDocumentSummary(documentId) {
  try {
    const document = await Document.findById(documentId);
    if (!document || !document.content) {
      throw new Error('Document not found or no content available');
    }
    
    const content = document.content.substring(0, 2000);
    
    const completion = await openai.chat.completions.create({
      model: "gpt-4",
      messages: [
        {
          role: "system",
          content: "You are a tax expert. Provide a concise summary of the tax document."
        },
        {
          role: "user",
          content: `Summarize this tax document in 2-3 sentences:\n\n${content}`
        }
      ],
      temperature: 0.3,
      max_tokens: 200
    });
    
    return completion.choices[0].message.content;
    
  } catch (error) {
    console.error('Error getting document summary:', error);
    throw error;
  }
}

// Search documents by tags
async function searchByTags(tags, limit = 10) {
  try {
    const documents = await Document.find({
      tags: { $in: tags }
    })
    .sort({ updatedAt: -1 })
    .limit(limit)
    .select('title formNumber year tags category');
    
    return documents;
    
  } catch (error) {
    console.error('Error searching by tags:', error);
    throw error;
  }
}

// Get popular tags
async function getPopularTags(limit = 20) {
  try {
    const documents = await Document.find({}, 'tags');
    const tagCounts = {};
    
    documents.forEach(doc => {
      doc.tags.forEach(tag => {
        tagCounts[tag] = (tagCounts[tag] || 0) + 1;
      });
    });
    
    const popularTags = Object.entries(tagCounts)
      .sort(([,a], [,b]) => b - a)
      .slice(0, limit)
      .map(([tag, count]) => ({ tag, count }));
    
    return popularTags;
    
  } catch (error) {
    console.error('Error getting popular tags:', error);
    throw error;
  }
} 