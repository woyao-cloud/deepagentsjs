/**
 * Long-Term Memory - persistent knowledge base
 * @module memory/long-term-memory
 */

import type {
  LongTermMemory as LongTermMemoryType,
  SkillEntry,
  AgentNote,
  ProjectKnowledge,
  SuccessPattern,
} from '../types/index.js';
import { generateId } from '../utils/id-generator.js';
import { createLogger } from '../utils/logger.js';

const logger = createLogger({ component: 'long-term-memory' });

/**
 * Long-Term Memory manages persistent knowledge across sessions
 */
export class LongTermMemory {
  private skills: Map<string, SkillEntry> = new Map();
  private agentNotes: Map<string, AgentNote> = new Map();
  private projectKnowledge: Map<string, ProjectKnowledge> = new Map();
  private patterns: Map<string, SuccessPattern> = new Map();

  constructor() {
    logger.debug('LongTermMemory initialized');
  }

  // ==================== Skills ====================

  /**
   * Add or update a skill
   */
  addSkill(
    skillId: string,
    name: string,
    description: string,
    sourcePath: string,
    content: string,
    tags: string[] = []
  ): void {
    const existing = this.skills.get(skillId);
    const skill: SkillEntry = {
      skillId,
      name,
      description,
      sourcePath,
      content,
      embedding: existing?.embedding ?? [], // Embedding would be computed externally
      usageCount: existing ? existing.usageCount + 1 : 1,
      successRate: existing?.successRate ?? 0,
      lastUsedAt: new Date(),
      tags,
    };
    this.skills.set(skillId, skill);
    logger.debug({ skillId, name }, 'Skill added/updated');
  }

  /**
   * Get a skill by ID
   */
  getSkill(skillId: string): SkillEntry | undefined {
    const skill = this.skills.get(skillId);
    if (skill) {
      skill.lastUsedAt = new Date();
      skill.usageCount++;
    }
    return skill;
  }

  /**
   * Search skills by name or tags
   */
  searchSkills(query: string, limit = 10): SkillEntry[] {
    const lowerQuery = query.toLowerCase();
    return Array.from(this.skills.values())
      .filter(
        skill =>
          skill.name.toLowerCase().includes(lowerQuery) ||
          skill.description.toLowerCase().includes(lowerQuery) ||
          skill.tags.some(tag => tag.toLowerCase().includes(lowerQuery))
      )
      .sort((a, b) => b.usageCount - a.usageCount)
      .slice(0, limit);
  }

  /**
   * Get all skills
   */
  getAllSkills(): SkillEntry[] {
    return Array.from(this.skills.values());
  }

  /**
   * Update skill success rate
   */
  updateSkillSuccessRate(skillId: string, success: boolean): void {
    const skill = this.skills.get(skillId);
    if (skill) {
      const newCount = skill.usageCount;
      const currentSuccessCount = skill.successRate * (newCount - 1);
      skill.successRate = success
        ? (currentSuccessCount + 1) / newCount
        : currentSuccessCount / newCount;
    }
  }

  /**
   * Delete a skill
   */
  deleteSkill(skillId: string): boolean {
    return this.skills.delete(skillId);
  }

  // ==================== Agent Notes ====================

  /**
   * Add an agent note
   */
  addAgentNote(
    agentType: string,
    content: string,
    context: { project: string; taskType: string }
  ): string {
    const noteId = generateId();
    const note: AgentNote = {
      noteId,
      agentType,
      content,
      context,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    this.agentNotes.set(noteId, note);
    logger.debug({ noteId, agentType }, 'Agent note added');
    return noteId;
  }

  /**
   * Update an agent note
   */
  updateAgentNote(noteId: string, content: string): boolean {
    const note = this.agentNotes.get(noteId);
    if (note) {
      note.content = content;
      note.updatedAt = new Date();
      return true;
    }
    return false;
  }

  /**
   * Get agent notes by type
   */
  getAgentNotesByType(agentType: string): AgentNote[] {
    return Array.from(this.agentNotes.values()).filter(
      note => note.agentType === agentType
    );
  }

  /**
   * Search agent notes
   */
  searchAgentNotes(query: string, limit = 10): AgentNote[] {
    const lowerQuery = query.toLowerCase();
    return Array.from(this.agentNotes.values())
      .filter(
        note =>
          note.content.toLowerCase().includes(lowerQuery) ||
          note.agentType.toLowerCase().includes(lowerQuery)
      )
      .sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime())
      .slice(0, limit);
  }

  /**
   * Get notes by project
   */
  getNotesByProject(project: string): AgentNote[] {
    return Array.from(this.agentNotes.values()).filter(
      note => note.context.project === project
    );
  }

  /**
   * Delete an agent note
   */
  deleteAgentNote(noteId: string): boolean {
    return this.agentNotes.delete(noteId);
  }

  // ==================== Project Knowledge ====================

  /**
   * Add or update project knowledge
   */
  addProjectKnowledge(
    projectId: string,
    projectName: string,
    architecture: string,
    techStack: string[],
    keyFiles: string[]
  ): void {
    const project: ProjectKnowledge = {
      projectId,
      projectName,
      architecture,
      techStack,
      keyFiles,
      lastUpdated: new Date(),
    };
    this.projectKnowledge.set(projectId, project);
    logger.debug({ projectId, projectName }, 'Project knowledge added/updated');
  }

  /**
   * Get project knowledge by ID
   */
  getProjectKnowledge(projectId: string): ProjectKnowledge | undefined {
    const project = this.projectKnowledge.get(projectId);
    if (project) {
      project.lastUpdated = new Date();
    }
    return project;
  }

  /**
   * Get all projects
   */
  getAllProjects(): ProjectKnowledge[] {
    return Array.from(this.projectKnowledge.values());
  }

  /**
   * Search projects by name or tech stack
   */
  searchProjects(query: string, limit = 10): ProjectKnowledge[] {
    const lowerQuery = query.toLowerCase();
    return Array.from(this.projectKnowledge.values())
      .filter(
        project =>
          project.projectName.toLowerCase().includes(lowerQuery) ||
          project.techStack.some(tech => tech.toLowerCase().includes(lowerQuery))
      )
      .sort((a, b) => b.lastUpdated.getTime() - a.lastUpdated.getTime())
      .slice(0, limit);
  }

  /**
   * Delete project knowledge
   */
  deleteProjectKnowledge(projectId: string): boolean {
    return this.projectKnowledge.delete(projectId);
  }

  // ==================== Success Patterns ====================

  /**
   * Add a success pattern
   */
  addSuccessPattern(
    name: string,
    description: string,
    context: string,
    exampleCode: string,
    applicableProjects: string[],
    metrics?: { readability: number; maintainability: number; performance: number }
  ): string {
    const patternId = generateId();
    const pattern: SuccessPattern = {
      patternId,
      name,
      description,
      context,
      exampleCode,
      successMetrics: metrics ?? { readability: 0.8, maintainability: 0.8, performance: 0.8 },
      applicableProjects,
    };
    this.patterns.set(patternId, pattern);
    logger.debug({ patternId, name }, 'Success pattern added');
    return patternId;
  }

  /**
   * Get a success pattern by ID
   */
  getSuccessPattern(patternId: string): SuccessPattern | undefined {
    return this.patterns.get(patternId);
  }

  /**
   * Search success patterns
   */
  searchPatterns(query: string, limit = 10): SuccessPattern[] {
    const lowerQuery = query.toLowerCase();
    return Array.from(this.patterns.values())
      .filter(
        pattern =>
          pattern.name.toLowerCase().includes(lowerQuery) ||
          pattern.description.toLowerCase().includes(lowerQuery) ||
          pattern.context.toLowerCase().includes(lowerQuery)
      )
      .slice(0, limit);
  }

  /**
   * Get patterns by project
   */
  getPatternsByProject(project: string): SuccessPattern[] {
    return Array.from(this.patterns.values()).filter(pattern =>
      pattern.applicableProjects.includes(project)
    );
  }

  /**
   * Delete a success pattern
   */
  deleteSuccessPattern(patternId: string): boolean {
    return this.patterns.delete(patternId);
  }

  // ==================== Serialization ====================

  /**
   * Export all memory for persistence
   */
  export(): LongTermMemoryType {
    return {
      skills: Array.from(this.skills.values()),
      agentNotes: Array.from(this.agentNotes.values()),
      projectKnowledge: Array.from(this.projectKnowledge.values()),
      patterns: Array.from(this.patterns.values()),
    };
  }

  /**
   * Import memory from persistence
   */
  import(data: LongTermMemoryType): void {
    this.skills.clear();
    this.agentNotes.clear();
    this.projectKnowledge.clear();
    this.patterns.clear();

    for (const skill of data.skills) {
      this.skills.set(skill.skillId, skill);
    }
    for (const note of data.agentNotes) {
      this.agentNotes.set(note.noteId, note);
    }
    for (const project of data.projectKnowledge) {
      this.projectKnowledge.set(project.projectId, project);
    }
    for (const pattern of data.patterns) {
      this.patterns.set(pattern.patternId, pattern);
    }

    logger.info({
      skills: this.skills.size,
      notes: this.agentNotes.size,
      projects: this.projectKnowledge.size,
      patterns: this.patterns.size,
    }, 'Long-term memory imported');
  }

  /**
   * Clear all memory
   */
  clear(): void {
    this.skills.clear();
    this.agentNotes.clear();
    this.projectKnowledge.clear();
    this.patterns.clear();
    logger.debug('Long-term memory cleared');
  }

  /**
   * Get memory statistics
   */
  getStats(): {
    skillsCount: number;
    notesCount: number;
    projectsCount: number;
    patternsCount: number;
  } {
    return {
      skillsCount: this.skills.size,
      notesCount: this.agentNotes.size,
      projectsCount: this.projectKnowledge.size,
      patternsCount: this.patterns.size,
    };
  }
}
