const { BaseAgent } = require('../../models/AgentEngine');
const { generateAIResponse } = require('../aiService');

/**
 * Validator Agent - Performs sanity checks and validation on outputs
 */
class ValidatorAgent extends BaseAgent {
  constructor(config = {}) {
    super('validator', 'validator', {
      model: config.model || 'gpt-4o-mini',
      modelType: config.modelType || 'chatgpt',
      temperature: config.temperature || 0.2, // Lower temperature for consistency
      strictMode: config.strictMode || false,
      ...config
    });
    
    this.validationRules = new Map();
    this.initializeDefaultRules();
  }

  async execute(input, context) {
    const startTime = Date.now();
    this.status = 'running';

    try {
      const { task, result, originalRequest, sessionId } = input;
      
      console.log(`🔍 [ValidatorAgent] Validating task result: ${task.description.substring(0, 50)}...`);

      // Perform validation checks
      const validationResult = await this.validateResult(task, result, originalRequest, context, sessionId);
      
      const executionTime = Date.now() - startTime;
      this.updateMetrics(validationResult.isValid, executionTime);
      this.status = 'idle';

      console.log(`✅ [ValidatorAgent] Validation ${validationResult.isValid ? 'passed' : 'failed'} in ${executionTime}ms`);

      return {
        success: true,
        validation: validationResult,
        metadata: {
          executionTime,
          rulesApplied: validationResult.rulesApplied,
          strictMode: this.config.strictMode
        }
      };

    } catch (error) {
      const executionTime = Date.now() - startTime;
      this.updateMetrics(false, executionTime);
      this.status = 'error';
      
      console.error(`❌ [ValidatorAgent] Validation failed:`, error);
      
      return {
        success: false,
        error: error.message,
        executionTime
      };
    }
  }

  async validateResult(task, result, originalRequest, context, sessionId) {
    const validationChecks = [];
    const rulesApplied = [];
    
    // Basic structural validation
    const structuralCheck = this.validateStructure(result);
    validationChecks.push(structuralCheck);
    rulesApplied.push('structural');
    
    // Content quality validation
    const qualityCheck = this.validateQuality(result, task);
    validationChecks.push(qualityCheck);
    rulesApplied.push('quality');
    
    // Task-specific validation
    const taskSpecificCheck = this.validateTaskSpecific(task, result);
    validationChecks.push(taskSpecificCheck);
    rulesApplied.push('task-specific');
    
    // LLM-based semantic validation
    const semanticCheck = await this.validateSemantic(task, result, originalRequest, sessionId);
    validationChecks.push(semanticCheck);
    rulesApplied.push('semantic');
    
    // Consistency validation
    const consistencyCheck = this.validateConsistency(result, context);
    validationChecks.push(consistencyCheck);
    rulesApplied.push('consistency');
    
    // Calculate overall validation result
    const passedChecks = validationChecks.filter(check => check.passed).length;
    const totalChecks = validationChecks.length;
    const successRate = passedChecks / totalChecks;
    
    // Determine if validation passes
    const threshold = this.config.strictMode ? 0.9 : 0.7;
    const isValid = successRate >= threshold;
    
    // Generate overall confidence score
    const confidence = Math.round(successRate * 100);
    
    // Collect all issues
    const issues = validationChecks
      .filter(check => !check.passed)
      .flatMap(check => check.issues || []);
    
    // Generate recommendations
    const recommendations = this.generateRecommendations(validationChecks, task, result);
    
    return {
      isValid,
      confidence,
      successRate,
      passedChecks,
      totalChecks,
      checks: validationChecks,
      issues,
      recommendations,
      rulesApplied,
      summary: this.generateValidationSummary(isValid, confidence, issues)
    };
  }

  validateStructure(result) {
    const issues = [];
    
    // Check if result exists and has content
    if (!result) {
      issues.push('Result is null or undefined');
    } else if (!result.content && !result.toolResults) {
      issues.push('Result has no content or tool results');
    }
    
    // Check content length
    if (result.content && typeof result.content === 'string') {
      if (result.content.trim().length < 10) {
        issues.push('Content is too short (less than 10 characters)');
      }
      if (result.content.length > 50000) {
        issues.push('Content is excessively long (over 50,000 characters)');
      }
    }
    
    // Check for required fields based on result type
    if (result.type === 'analysis' && !result.summary) {
      issues.push('Analysis result missing summary');
    }
    
    if (result.type === 'generation' && !result.content) {
      issues.push('Generation result missing content');
    }
    
    return {
      name: 'Structural Validation',
      passed: issues.length === 0,
      issues,
      score: issues.length === 0 ? 100 : Math.max(0, 100 - (issues.length * 25))
    };
  }

  validateQuality(result, task) {
    const issues = [];
    let qualityScore = 100;
    
    if (result.content && typeof result.content === 'string') {
      const content = result.content.trim();
      
      // Check for repetitive content
      const words = content.toLowerCase().split(/\s+/);
      const uniqueWords = new Set(words);
      const repetitionRatio = uniqueWords.size / words.length;
      
      if (repetitionRatio < 0.3) {
        issues.push('Content appears highly repetitive');
        qualityScore -= 30;
      }
      
      // Check for placeholder text
      const placeholders = ['lorem ipsum', 'placeholder', 'todo', 'tbd', 'xxx'];
      for (const placeholder of placeholders) {
        if (content.toLowerCase().includes(placeholder)) {
          issues.push(`Contains placeholder text: ${placeholder}`);
          qualityScore -= 20;
        }
      }
      
      // Check for grammatical structure (basic)
      if (!/[.!?]/.test(content)) {
        issues.push('Content lacks proper sentence structure');
        qualityScore -= 15;
      }
      
      // Check for coherence (basic)
      const sentences = content.split(/[.!?]+/).filter(s => s.trim().length > 0);
      if (sentences.length > 1) {
        const avgSentenceLength = content.length / sentences.length;
        if (avgSentenceLength < 10 || avgSentenceLength > 300) {
          issues.push('Unusual sentence length distribution');
          qualityScore -= 10;
        }
      }
    }
    
    return {
      name: 'Quality Validation',
      passed: issues.length === 0,
      issues,
      score: Math.max(0, qualityScore)
    };
  }

  validateTaskSpecific(task, result) {
    const issues = [];
    let score = 100;
    
    // Get validation rules for this task type
    const rules = this.validationRules.get(task.type) || this.validationRules.get('default');
    
    for (const rule of rules) {
      try {
        const ruleResult = rule.validate(task, result);
        if (!ruleResult.passed) {
          issues.push(...ruleResult.issues);
          score -= ruleResult.penalty || 20;
        }
      } catch (error) {
        console.warn(`⚠️ [ValidatorAgent] Rule validation failed: ${error.message}`);
      }
    }
    
    return {
      name: 'Task-Specific Validation',
      passed: issues.length === 0,
      issues,
      score: Math.max(0, score)
    };
  }

  async validateSemantic(task, result, originalRequest, sessionId) {
    try {
      const prompt = this.buildSemanticValidationPrompt(task, result, originalRequest);
      
      const llmResponse = await generateAIResponse(
        [{ role: 'user', content: prompt }],
        {
          modelType: this.config.modelType,
          model: this.config.model,
          temperature: this.config.temperature,
          maxTokens: 1000,
          messageId: `validator-semantic-${sessionId}`,
          stream: false
        }
      );

      const validation = this.parseSemanticValidation(llmResponse.response || llmResponse.content);
      
      return {
        name: 'Semantic Validation',
        passed: validation.isValid,
        issues: validation.issues,
        score: validation.confidence,
        reasoning: validation.reasoning
      };
      
    } catch (error) {
      console.error(`❌ [ValidatorAgent] Semantic validation failed:`, error);
      
      return {
        name: 'Semantic Validation',
        passed: false,
        issues: ['Semantic validation could not be performed'],
        score: 0,
        reasoning: `Validation failed: ${error.message}`
      };
    }
  }

  validateConsistency(result, context) {
    const issues = [];
    let score = 100;
    
    // Check consistency with previous results if available
    if (context.previousResults && context.previousResults.length > 0) {
      const previousResult = context.previousResults[context.previousResults.length - 1];
      
      // Basic consistency checks
      if (result.type !== previousResult.type) {
        // This might be expected, so just note it
      }
      
      // Check for contradictory information (basic)
      if (result.content && previousResult.content) {
        // This would need more sophisticated logic in a real implementation
      }
    }
    
    return {
      name: 'Consistency Validation',
      passed: issues.length === 0,
      issues,
      score: Math.max(0, score)
    };
  }

  buildSemanticValidationPrompt(task, result, originalRequest) {
    return `You are a validation expert. Evaluate if the task result properly addresses the original request.

ORIGINAL REQUEST: "${originalRequest}"

TASK: ${task.description}
TASK TYPE: ${task.type}

RESULT TO VALIDATE:
${JSON.stringify(result, null, 2)}

Please evaluate:
1. Does the result address the original request?
2. Is the result relevant and appropriate?
3. Are there any logical inconsistencies?
4. Is the quality acceptable?
5. Are there any obvious errors or omissions?

Respond in JSON format:
{
  "isValid": true/false,
  "confidence": 0-100,
  "issues": ["list", "of", "issues"],
  "reasoning": "explanation of your assessment"
}

Return only the JSON response.`;
  }

  parseSemanticValidation(llmResponse) {
    try {
      let cleanResponse = llmResponse.trim();
      if (cleanResponse.startsWith('```json')) {
        cleanResponse = cleanResponse.replace(/```json\s*/, '').replace(/```\s*$/, '');
      }
      
      const validation = JSON.parse(cleanResponse);
      
      return {
        isValid: validation.isValid || false,
        confidence: validation.confidence || 0,
        issues: validation.issues || [],
        reasoning: validation.reasoning || 'No reasoning provided'
      };
      
    } catch (error) {
      console.error('❌ [ValidatorAgent] Failed to parse semantic validation:', error);
      
      return {
        isValid: false,
        confidence: 0,
        issues: ['Failed to parse validation response'],
        reasoning: 'Could not parse LLM validation response'
      };
    }
  }

  generateRecommendations(validationChecks, task, result) {
    const recommendations = [];
    
    for (const check of validationChecks) {
      if (!check.passed && check.issues) {
        for (const issue of check.issues) {
          if (issue.includes('too short')) {
            recommendations.push('Expand the content with more detail and examples');
          } else if (issue.includes('repetitive')) {
            recommendations.push('Reduce repetition and add more varied content');
          } else if (issue.includes('placeholder')) {
            recommendations.push('Replace placeholder text with actual content');
          } else if (issue.includes('structure')) {
            recommendations.push('Improve content structure and formatting');
          } else {
            recommendations.push(`Address issue: ${issue}`);
          }
        }
      }
    }
    
    // Remove duplicates
    return [...new Set(recommendations)].slice(0, 5);
  }

  generateValidationSummary(isValid, confidence, issues) {
    if (isValid) {
      return `Validation passed with ${confidence}% confidence`;
    } else {
      const issueCount = issues.length;
      return `Validation failed with ${issueCount} issue${issueCount !== 1 ? 's' : ''} (${confidence}% confidence)`;
    }
  }

  initializeDefaultRules() {
    // Default validation rules
    const defaultRules = [
      {
        name: 'content-exists',
        validate: (task, result) => ({
          passed: !!(result.content || result.toolResults),
          issues: result.content || result.toolResults ? [] : ['No content or results found']
        })
      },
      {
        name: 'minimum-length',
        validate: (task, result) => {
          const content = result.content || '';
          const minLength = task.type === 'analysis' ? 100 : 50;
          return {
            passed: content.length >= minLength,
            issues: content.length >= minLength ? [] : [`Content too short (${content.length} chars, minimum ${minLength})`]
          };
        }
      }
    ];
    
    this.validationRules.set('default', defaultRules);
    this.validationRules.set('analysis', [...defaultRules]);
    this.validationRules.set('generation', [...defaultRules]);
    this.validationRules.set('execution', [...defaultRules]);
  }

  validateInput(input) {
    const { task, result, sessionId } = input;
    
    if (!task || !task.description) {
      return false;
    }
    
    if (!result) {
      return false;
    }
    
    if (!sessionId) {
      return false;
    }
    
    return true;
  }
}

module.exports = ValidatorAgent;
