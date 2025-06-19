# COPILOT EDITS OPERATIONAL GUIDELINES
                
## PRIME DIRECTIVE
	Avoid working on more than one file at a time.
	Multiple simultaneous edits to a file will cause corruption.
	Be chatting and teach about what you are doing while coding.

## LARGE FILE & COMPLEX CHANGE PROTOCOL

### MANDATORY PLANNING PHASE
	When working with large files (>300 lines) or complex changes:
		1. ALWAYS start by creating a detailed plan BEFORE making any edits
            2. Your plan MUST include:
                   - All functions/sections that need modification
                   - The order in which changes should be applied
                   - Dependencies between changes
                   - Estimated number of separate edits required
                
            3. Format your plan as:
## PROPOSED EDIT PLAN
	Working with: [filename]
	Total planned edits: [number]

### MAKING EDITS
	- Focus on one conceptual change at a time
	- Show clear "before" and "after" snippets when proposing changes
	- Include concise explanations of what changed and why
	- Always check if the edit maintains the project's coding style

### Edit sequence:
	1. [First specific change] - Purpose: [why]
	2. [Second specific change] - Purpose: [why]
	3. Do you approve this plan? I'll proceed with Edit [number] after your confirmation.
	4. WAIT for explicit user confirmation before making ANY edits when user ok edit [number]
            
### EXECUTION PHASE
	- After each individual edit, clearly indicate progress:
		"✅ Completed edit [#] of [total]. Ready for next edit?"
	- If you discover additional needed changes during editing:
	- STOP and update the plan
	- Get approval before continuing
                
### REFACTORING GUIDANCE
	When refactoring large files:
	- Break work into logical, independently functional chunks
	- Ensure each intermediate state maintains functionality
	- Consider temporary duplication as a valid interim step
	- Always indicate the refactoring pattern being applied
                
### RATE LIMIT AVOIDANCE
	- For very large files, suggest splitting changes across multiple sessions
	- Prioritize changes that are logically complete units
	- Always provide clear stopping points
            
## General Requirements
	Use modern technologies as described below for all code suggestions. Prioritize clean, maintainable code with appropriate comments.
            
## AWS CDK
    - Use AWS CDK v2 for all infrastructure code
    - Follow best practices for CDK constructs and stacks
    - Ensure all resources are properly defined and documented
    - Use TypeScript for CDK code
    - Ensure all CDK code is modular and reusable
    - Include unit tests for all CDK constructs
    - Use environment variables for sensitive information
    - Ensure all CDK code is compatible with the latest AWS services
    - Use AWS CDK CLI commands for deployment and management
    - Ensure all CDK code is version controlled
    - Use AWS CDK best practices for security and compliance
    - Ensure all CDK code is well-documented
	- Organize code for large-scale projects
	- Use consistent naming conventions
	- Structure code into modules and packages
	- Use reusable patterns such as Abstract Factory and Chain of Responsibility
	- Extend L2 constructs for custom resources
	- Follow TypeScript best practices
	- Use a test-driven development approach with unit tests and integration tests

## TypeScript
	- Use TypeScript 4.0 or later
	- Follow TypeScript best practices for type safety and maintainability
	- Use interfaces and types to define data structures
	- Use async/await for asynchronous code
	- Ensure all TypeScript code is properly linted and formatted
	- Use modern ES6+ features where appropriate
	- Ensure all TypeScript code is compatible with the latest Node.js versions
	- Use TypeScript decorators for metadata and configuration
	- Ensure all TypeScript code is well-documented

