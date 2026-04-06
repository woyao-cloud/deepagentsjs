/**
 * Planning templates for generating PLANNING.md
 * @module core/planning-templates
 */

/**
 * Generate markdown content for PLANNING.md
 */
export function generatePlanningMarkdown(plan: {
  phase: string;
  taskTree: Array<{
    id: string;
    name: string;
    description: string;
    children: Array<{ id: string; name: string }>;
    estimatedTokens: number;
    dependencies: string[];
  }>;
  techStack: {
    overall: {
      backend: string;
      frontend: string;
      database: string;
      testing: string;
    };
    recommendations: Array<{
      category: string;
      technology: string;
      reason: string;
      alternatives: string[];
    }>;
  };
  fileStructure: {
    directories: Array<{ path: string; description: string }>;
    files: Array<{ path: string; description: string; language?: string }>;
  };
  apiContracts: Array<{
    endpoint: string;
    method: string;
    request: { query?: Array<{ name: string; type: string }> };
    response: { status: number; body: unknown };
  }>;
  risks: Array<{
    id: string;
    description: string;
    severity: string;
    likelihood: string;
    mitigation?: string;
  }>;
  deliverables: Array<{
    id: string;
    name: string;
    description: string;
    owner: string;
    acceptanceCriteria: string[];
  }>;
}): string {
  const lines: string[] = [];

  lines.push(`# PLANNING.md - ${plan.phase}`);
  lines.push('');
  lines.push(`> Generated: ${new Date().toISOString()}`);
  lines.push('');

  // Task Decomposition
  lines.push('## Task Decomposition');
  lines.push('');
  lines.push(`### ${plan.phase}`);
  lines.push('');

  for (const task of plan.taskTree) {
    lines.push(`#### ${task.id} ${task.name}`);
    if (task.description) {
      lines.push(`- ${task.description}`);
    }
    lines.push(`- Estimated Tokens: ~${task.estimatedTokens.toLocaleString()}`);
    if (task.dependencies.length > 0) {
      lines.push(`- Dependencies: ${task.dependencies.join(', ')}`);
    }
    lines.push('');

    if (task.children.length > 0) {
      lines.push('**Subtasks:**');
      for (const child of task.children) {
        lines.push(`- [ ] ${child.id} ${child.name}`);
      }
      lines.push('');
    }
  }

  // Tech Stack
  lines.push('## Tech Stack');
  lines.push('');
  lines.push('| Category | Technology | Reason | Alternatives |');
  lines.push('|----------|------------|--------|-------------|');

  for (const rec of plan.techStack.recommendations) {
    lines.push(`| ${rec.category} | ${rec.technology} | ${rec.reason} | ${rec.alternatives.join(', ')} |`);
  }
  lines.push('');

  lines.push('**Overall Stack:**');
  lines.push(`- Backend: ${plan.techStack.overall.backend}`);
  lines.push(`- Frontend: ${plan.techStack.overall.frontend}`);
  lines.push(`- Database: ${plan.techStack.overall.database}`);
  lines.push(`- Testing: ${plan.techStack.overall.testing}`);
  lines.push('');

  // File Structure
  lines.push('## File Structure');
  lines.push('');

  if (plan.fileStructure.directories.length > 0) {
    lines.push('**Directories:**');
    for (const dir of plan.fileStructure.directories) {
      lines.push(`- \`${dir.path}/\` - ${dir.description}`);
    }
    lines.push('');
  }

  if (plan.fileStructure.files.length > 0) {
    lines.push('**Files:**');
    for (const file of plan.fileStructure.files) {
      const lang = file.language ? ` (${file.language})` : '';
      lines.push(`- \`${file.path}\`${lang} - ${file.description}`);
    }
    lines.push('');
  }

  // API Contracts
  if (plan.apiContracts.length > 0) {
    lines.push('## API Contracts');
    lines.push('');

    for (const api of plan.apiContracts) {
      lines.push(`### ${api.method} ${api.endpoint}`);
      lines.push('');
      lines.push('**Request:**');
      if (api.request.query && api.request.query.length > 0) {
        lines.push('- Query Parameters:');
        for (const param of api.request.query) {
          lines.push(`  - \`${param.name}\` (${param.type})`);
        }
      }
      lines.push(`- Response: ${api.response.status}`);
      if (typeof api.response.body === 'object') {
        lines.push('```json');
        lines.push(JSON.stringify(api.response.body, null, 2));
        lines.push('```');
      }
      lines.push('');
    }
  }

  // Risks
  if (plan.risks.length > 0) {
    lines.push('## Risk Assessment');
    lines.push('');

    lines.push('| ID | Risk | Severity | Likelihood | Mitigation |');
    lines.push('|----|------|----------|------------|------------|');

    for (const risk of plan.risks) {
      const mitigation = risk.mitigation ?? '-';
      lines.push(`| ${risk.id} | ${risk.description} | ${risk.severity} | ${risk.likelihood} | ${mitigation} |`);
    }
    lines.push('');
  }

  // Deliverables
  if (plan.deliverables.length > 0) {
    lines.push('## Deliverables');
    lines.push('');

    for (const deliverable of plan.deliverables) {
      lines.push(`### ${deliverable.id} ${deliverable.name}`);
      lines.push(`- **Owner:** ${deliverable.owner}`);
      if (deliverable.description) {
        lines.push(`- **Description:** ${deliverable.description}`);
      }
      lines.push('- **Acceptance Criteria:**');
      for (const criteria of deliverable.acceptanceCriteria) {
        lines.push(`  - [ ] ${criteria}`);
      }
      lines.push('');
    }
  }

  // Confirmation
  lines.push('## Confirmation');
  lines.push('');
  lines.push('- [ ] Reviewed and approved');
  lines.push('- [ ] Tech stack confirmed');
  lines.push('- [ ] Timeline accepted');
  lines.push('');
  lines.push('---');
  lines.push(`*Confirm by running: \`deepagents confirm --file PLANNING.md\`*`);

  return lines.join('\n');
}

/**
 * Generate markdown for STATUS.md
 */
export function generateStatusMarkdown(status: {
  phase: string;
  progress: number;
  completedTasks: string[];
  pendingTasks: string[];
  failedTasks: string[];
  agentStatus: Array<{ name: string; status: string; lastUpdate: string }>;
}): string {
  const lines: string[] = [];

  lines.push('# STATUS.md');
  lines.push('');
  lines.push(`> Last Updated: ${new Date().toISOString()}`);
  lines.push('');

  lines.push('## Current Phase');
  lines.push(`**${status.phase}** - ${status.progress}% Complete`);
  lines.push('');

  lines.push('## Task Status');
  lines.push('');

  if (status.completedTasks.length > 0) {
    lines.push('### Completed');
    for (const task of status.completedTasks) {
      lines.push(`- [x] ${task}`);
    }
    lines.push('');
  }

  if (status.pendingTasks.length > 0) {
    lines.push('### Pending');
    for (const task of status.pendingTasks) {
      lines.push(`- [ ] ${task}`);
    }
    lines.push('');
  }

  if (status.failedTasks.length > 0) {
    lines.push('### Failed');
    for (const task of status.failedTasks) {
      lines.push(`- [ ] ${task}`);
    }
    lines.push('');
  }

  if (status.agentStatus.length > 0) {
    lines.push('## Agent Status');
    lines.push('');
    lines.push('| Agent | Status | Last Update |');
    lines.push('|-------|--------|-------------|');

    for (const agent of status.agentStatus) {
      lines.push(`| ${agent.name} | ${agent.status} | ${agent.lastUpdate} |`);
    }
    lines.push('');
  }

  return lines.join('\n');
}
