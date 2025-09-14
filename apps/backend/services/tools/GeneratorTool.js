const { Tool } = require('../../models/AgentEngine');
const { generateAIResponse } = require('../aiService');

/**
 * Generator Tool - Creates content, code, or other outputs
 */
class GeneratorTool extends Tool {
  constructor() {
    super(
      'generator',
      'Generates content, code, documents, or other structured outputs',
      {
        type: { type: 'string', description: 'Type of content to generate', required: true },
        prompt: { type: 'string', description: 'Generation prompt or requirements', required: true },
        format: { type: 'string', description: 'Output format (text, json, code, markdown)', default: 'text' },
        length: { type: 'string', description: 'Content length (short, medium, long)', default: 'medium' },
        style: { type: 'string', description: 'Writing style or tone', default: 'professional' }
      },
      'generation'
    );
    
    this.supportedTypes = [
      'text', 'code', 'documentation', 'email', 'report', 
      'summary', 'plan', 'script', 'json', 'template'
    ];
    
    this.supportedFormats = ['text', 'json', 'code', 'markdown', 'html'];
    
    this.templates = new Map();
    this.initializeTemplates();
  }

  async execute(params, context) {
    const startTime = Date.now();
    
    try {
      console.log(`✨ [GeneratorTool] Starting generation: ${params.type}`);
      
      const { type, prompt, format = 'text', length = 'medium', style = 'professional' } = params;
      const { task } = context;
      
      // Validate parameters
      if (!this.validateParams(params)) {
        throw new Error('Invalid parameters for generator tool');
      }
      
      if (!this.supportedTypes.includes(type)) {
        throw new Error(`Unsupported generation type: ${type}. Supported types: ${this.supportedTypes.join(', ')}`);
      }
      
      let generatedContent;
      
      // Check if we have a template for this type
      if (this.templates.has(type)) {
        generatedContent = await this.generateFromTemplate(type, params, context);
      } else {
        generatedContent = await this.generateWithLLM(params, context);
      }
      
      // Post-process based on format
      const formattedContent = this.formatOutput(generatedContent, format);
      
      // Validate generated content
      const validation = this.validateGeneration(formattedContent, params);
      
      const executionTime = Date.now() - startTime;
      this.updateUsage();
      
      console.log(`✅ [GeneratorTool] Generation completed in ${executionTime}ms`);
      
      return {
        success: true,
        content: formattedContent,
        metadata: {
          type,
          format,
          length,
          style,
          wordCount: this.countWords(formattedContent),
          characterCount: formattedContent.length,
          executionTime,
          validation,
          generatedBy: 'GeneratorTool'
        }
      };
      
    } catch (error) {
      console.error(`❌ [GeneratorTool] Generation failed:`, error);
      
      return {
        success: false,
        error: error.message,
        executionTime: Date.now() - startTime
      };
    }
  }

  async generateFromTemplate(type, params, context) {
    console.log(`📋 [GeneratorTool] Using template for type: ${type}`);
    
    const template = this.templates.get(type);
    const { prompt, length, style } = params;
    
    // Replace template placeholders
    let content = template.content;
    
    // Basic placeholder replacement
    content = content.replace(/\{prompt\}/g, prompt);
    content = content.replace(/\{style\}/g, style);
    content = content.replace(/\{length\}/g, length);
    content = content.replace(/\{timestamp\}/g, new Date().toISOString());
    
    // If template requires LLM enhancement, use it
    if (template.enhanceWithLLM) {
      content = await this.enhanceWithLLM(content, params, context);
    }
    
    return content;
  }

  async generateWithLLM(params, context) {
    console.log(`🤖 [GeneratorTool] Using LLM for generation`);
    
    const { type, prompt, format, length, style } = params;
    const { task } = context;
    
    const generationPrompt = this.buildGenerationPrompt(params, context);
    
    const llmResponse = await generateAIResponse(
      [{ role: 'user', content: generationPrompt }],
      {
        modelType: 'chatgpt',
        model: 'gpt-4o-mini',
        temperature: 0.7,
        maxTokens: this.getMaxTokensForLength(length),
        messageId: `generator-${Date.now()}`,
        stream: false
      }
    );

    return llmResponse.response || llmResponse.content;
  }

  async enhanceWithLLM(content, params, context) {
    const enhancementPrompt = `Please enhance and expand the following content based on these requirements:

Content Type: ${params.type}
Style: ${params.style}
Length: ${params.length}
Format: ${params.format}

Current Content:
${content}

Requirements:
${params.prompt}

Please improve the content while maintaining its core structure and purpose. Make it more detailed, engaging, and appropriate for the specified style and format.`;

    const llmResponse = await generateAIResponse(
      [{ role: 'user', content: enhancementPrompt }],
      {
        modelType: 'chatgpt',
        model: 'gpt-4o-mini',
        temperature: 0.6,
        maxTokens: this.getMaxTokensForLength(params.length),
        messageId: `generator-enhance-${Date.now()}`,
        stream: false
      }
    );

    return llmResponse.response || llmResponse.content;
  }

  buildGenerationPrompt(params, context) {
    const { type, prompt, format, length, style } = params;
    const { task } = context;
    
    return `You are a professional content generator. Create ${type} content based on the following requirements:

CONTENT TYPE: ${type}
FORMAT: ${format}
LENGTH: ${length}
STYLE: ${style}

REQUIREMENTS:
${prompt}

${task ? `CONTEXT: This is for the task: ${task.description}` : ''}

INSTRUCTIONS:
1. Create high-quality, relevant content that meets the specified requirements
2. Follow the requested format and style guidelines
3. Ensure the content is appropriate for the specified length
4. Make it engaging, informative, and well-structured
5. If generating code, include comments and follow best practices
6. If generating documentation, include clear sections and examples

Generate the content now:`;
  }

  formatOutput(content, format) {
    switch (format) {
      case 'json':
        return this.formatAsJSON(content);
      case 'code':
        return this.formatAsCode(content);
      case 'markdown':
        return this.formatAsMarkdown(content);
      case 'html':
        return this.formatAsHTML(content);
      case 'text':
      default:
        return content.trim();
    }
  }

  formatAsJSON(content) {
    try {
      // Try to parse if it's already JSON
      JSON.parse(content);
      return content;
    } catch {
      // If not valid JSON, wrap it in a JSON structure
      return JSON.stringify({
        content: content,
        generated: new Date().toISOString(),
        format: 'json'
      }, null, 2);
    }
  }

  formatAsCode(content) {
    // Basic code formatting
    if (!content.includes('```')) {
      return `\`\`\`\n${content}\n\`\`\``;
    }
    return content;
  }

  formatAsMarkdown(content) {
    // Basic markdown formatting
    if (!content.includes('#') && !content.includes('**')) {
      const lines = content.split('\n');
      const title = lines[0];
      const body = lines.slice(1).join('\n');
      
      return `# ${title}\n\n${body}`;
    }
    return content;
  }

  formatAsHTML(content) {
    // Basic HTML formatting
    if (!content.includes('<')) {
      const lines = content.split('\n\n');
      return lines.map(paragraph => `<p>${paragraph.trim()}</p>`).join('\n');
    }
    return content;
  }

  validateGeneration(content, params) {
    const validation = {
      isValid: true,
      issues: [],
      score: 100,
      checks: []
    };
    
    // Check minimum length
    const minLength = this.getMinLengthForType(params.type, params.length);
    if (content.length < minLength) {
      validation.issues.push(`Content too short (${content.length} chars, minimum ${minLength})`);
      validation.score -= 20;
    }
    
    // Check for placeholder text
    const placeholders = ['[placeholder]', 'TODO', 'TBD', 'lorem ipsum'];
    for (const placeholder of placeholders) {
      if (content.toLowerCase().includes(placeholder.toLowerCase())) {
        validation.issues.push(`Contains placeholder text: ${placeholder}`);
        validation.score -= 15;
      }
    }
    
    // Check format compliance
    if (params.format === 'json') {
      try {
        JSON.parse(content);
        validation.checks.push('Valid JSON format');
      } catch {
        validation.issues.push('Invalid JSON format');
        validation.score -= 25;
      }
    }
    
    // Check for repetitive content
    const words = content.split(/\s+/);
    const uniqueWords = new Set(words);
    const repetitionRatio = uniqueWords.size / words.length;
    
    if (repetitionRatio < 0.3) {
      validation.issues.push('Content appears highly repetitive');
      validation.score -= 20;
    }
    
    validation.isValid = validation.issues.length === 0;
    validation.score = Math.max(0, validation.score);
    
    return validation;
  }

  initializeTemplates() {
    // Email template
    this.templates.set('email', {
      content: `Subject: {prompt}

Dear Recipient,

{prompt}

Best regards,
[Your Name]`,
      enhanceWithLLM: true
    });
    
    // Report template
    this.templates.set('report', {
      content: `# Report: {prompt}

## Executive Summary
[Summary will be generated based on requirements]

## Key Findings
[Findings will be detailed here]

## Recommendations
[Recommendations will be provided]

## Conclusion
[Conclusion will summarize the report]

Generated on: {timestamp}`,
      enhanceWithLLM: true
    });
    
    // Plan template
    this.templates.set('plan', {
      content: `# Plan: {prompt}

## Objective
[Objective will be defined]

## Steps
1. [Step 1]
2. [Step 2]
3. [Step 3]

## Timeline
[Timeline will be provided]

## Resources Required
[Resources will be listed]

## Success Criteria
[Success criteria will be defined]

Created: {timestamp}`,
      enhanceWithLLM: true
    });
    
    // Documentation template
    this.templates.set('documentation', {
      content: `# Documentation: {prompt}

## Overview
[Overview will be provided]

## Getting Started
[Getting started guide]

## Usage
[Usage instructions]

## Examples
[Examples will be provided]

## API Reference
[API reference if applicable]

## Troubleshooting
[Common issues and solutions]

Last updated: {timestamp}`,
      enhanceWithLLM: true
    });
    
    // Summary template
    this.templates.set('summary', {
      content: `# Summary: {prompt}

## Key Points
- [Key point 1]
- [Key point 2]
- [Key point 3]

## Details
[Detailed summary content]

## Conclusion
[Brief conclusion]

Summary generated: {timestamp}`,
      enhanceWithLLM: true
    });
  }

  getMaxTokensForLength(length) {
    switch (length) {
      case 'short': return 500;
      case 'medium': return 1500;
      case 'long': return 3000;
      default: return 1500;
    }
  }

  getMinLengthForType(type, length) {
    const baseLengths = {
      'short': 50,
      'medium': 200,
      'long': 500
    };
    
    const typeMultipliers = {
      'email': 1,
      'report': 2,
      'documentation': 3,
      'summary': 0.5,
      'code': 1.5
    };
    
    const baseLength = baseLengths[length] || baseLengths.medium;
    const multiplier = typeMultipliers[type] || 1;
    
    return Math.round(baseLength * multiplier);
  }

  countWords(text) {
    return text.trim().split(/\s+/).length;
  }

  validateParams(params) {
    const { type, prompt } = params;
    
    if (!type || typeof type !== 'string') {
      return false;
    }
    
    if (!prompt || typeof prompt !== 'string' || prompt.trim().length === 0) {
      return false;
    }
    
    return true;
  }
}

module.exports = GeneratorTool;
