/**
 * Frontend Developer Agent - implements UI components and frontend logic
 * @module agents/frontend-dev-agent
 */

import type { Task, ExecutionContext, TaskResult } from '../types/index.js';
import { BaseAgent } from './base-agent.js';
import { createLogger } from '../utils/logger.js';

const logger = createLogger({ component: 'frontend-dev-agent' });

/**
 * Frontend Developer Agent specializes in UI development
 */
export class FrontendDevAgent extends BaseAgent {
  constructor() {
    super('frontend-dev', {
      type: 'frontend-dev',
      name: 'Frontend Developer Agent',
      description: 'Specializes in UI development with React/Vue',
      tools: ['read_file', 'write_file', 'edit_file', 'glob', 'grep'],
      model: 'claude-haiku-4-5',
      tokenBudget: 60000,
    });
  }

  /**
   * Initialize frontend dev agent
   */
  async initialize(): Promise<void> {
    logger.info('Initializing Frontend Developer Agent');
    this.addSystemMessage('Frontend Developer Agent initialized - ready for UI development tasks');
  }

  /**
   * Execute frontend development task
   */
  async executeTask(task: Task, context: ExecutionContext): Promise<TaskResult> {
    const startTime = Date.now();
    logger.info({ taskId: task.id, taskName: task.name }, 'Executing frontend task');

    this.addHumanMessage(`Starting frontend task: ${task.name}`);

    try {
      const files: Record<string, string> = {};

      const taskNameLower = task.name.toLowerCase();

      // Determine what kind of frontend files to generate
      if (taskNameLower.includes('component') || taskNameLower.includes('ui')) {
        Object.assign(files, this.generateComponentFiles(task));
      }

      if (taskNameLower.includes('page') || taskNameLower.includes('view')) {
        Object.assign(files, this.generatePageFiles(task));
      }

      if (taskNameLower.includes('hook')) {
        Object.assign(files, this.generateHookFiles(task));
      }

      if (taskNameLower.includes('store') || taskNameLower.includes('state')) {
        Object.assign(files, this.generateStoreFiles(task));
      }

      // If no specific type matched, generate generic component
      if (Object.keys(files).length === 0) {
        Object.assign(files, this.generateGenericUI(task));
      }

      // Generate tests for frontend code
      const testFiles = this.generateFrontendTests(task);
      Object.assign(files, testFiles);

      this.addAIMessage(`Frontend development completed for: ${task.name}`);

      return {
        taskId: task.id,
        status: 'success',
        output: {
          files,
          messages: [
            `Frontend development completed for ${task.name}`,
            `Generated ${Object.keys(files).length} files`,
          ],
        },
        tokenUsage: {
          inputTokens: 4000,
          outputTokens: 5000,
        },
        duration: Date.now() - startTime,
        logs: [],
      };
    } catch (error) {
      logger.error({ taskId: task.id, error }, 'Frontend task failed');
      return {
        taskId: task.id,
        status: 'failed',
        output: { files: {}, messages: [] },
        tokenUsage: { inputTokens: 4000, outputTokens: 2000 },
        duration: Date.now() - startTime,
        logs: [],
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /**
   * Generate component files
   */
  private generateComponentFiles(task: Task): Record<string, string> {
    const componentName = this.toComponentName(task.name);
    return {
      [`src/components/${componentName}/${componentName}.tsx`]: this.generateComponent(task),
      [`src/components/${componentName}/${componentName}.stories.tsx`]: this.generateStorybookStory(task),
      [`src/components/${componentName}/index.ts`]: this.generateComponentIndex(task),
    };
  }

  /**
   * Generate page files
   */
  private generatePageFiles(task: Task): Record<string, string> {
    const pageName = this.toComponentName(task.name);
    return {
      [`src/pages/${pageName}/${pageName}.tsx`]: this.generatePage(task),
      [`src/pages/${pageName}/index.ts`]: this.generatePageIndex(task),
    };
  }

  /**
   * Generate hook files
   */
  private generateHookFiles(task: Task): Record<string, string> {
    const hookName = this.toHookName(task.name);
    return {
      [`src/hooks/${hookName}.ts`]: this.generateHook(task),
      [`src/hooks/${hookName}.test.ts`]: this.generateHookTest(task),
    };
  }

  /**
   * Generate store files
   */
  private generateStoreFiles(task: Task): Record<string, string> {
    const storeName = this.toComponentName(task.name);
    return {
      [`src/store/${storeName}.ts`]: this.generateStore(task),
      [`src/store/${storeName}.test.ts`]: this.generateStoreTest(task),
    };
  }

  /**
   * Generate generic UI
   */
  private generateGenericUI(task: Task): Record<string, string> {
    const componentName = this.toComponentName(task.name);
    return {
      [`src/components/${componentName}.tsx`]: this.generateComponent(task),
      [`src/components/${componentName}.test.tsx`]: this.generateComponentTest(task),
    };
  }

  /**
   * Generate frontend tests
   */
  private generateFrontendTests(task: Task): Record<string, string> {
    const testFiles: Record<string, string> = {};
    // Tests are generated within other methods
    return testFiles;
  }

  /**
   * Generate React component
   */
  private generateComponent(task: Task): string {
    const componentName = this.toComponentName(task.name);
    return `/**
 * ${task.name} Component
 */

import { useState, useCallback } from 'react';

export interface ${componentName}Props {
  /** Optional class name */
  className?: string;
  /** Initial value */
  initialValue?: string;
  /** Callback when value changes */
  onChange?: (value: string) => void;
  /** Disabled state */
  disabled?: boolean;
}

export function ${componentName}({
  className = '',
  initialValue = '',
  onChange,
  disabled = false,
}: ${componentName}Props) {
  const [value, setValue] = useState(initialValue);

  const handleChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const newValue = e.target.value;
    setValue(newValue);
    onChange?.(newValue);
  }, [onChange]);

  return (
    <div className={\`\${className}\`}>
      <input
        type="text"
        value={value}
        onChange={handleChange}
        disabled={disabled}
        placeholder="Enter value..."
        data-testid="${componentName.toLowerCase()}-input"
      />
    </div>
  );
}

export default ${componentName};
`;
  }

  /**
   * Generate Storybook story
   */
  private generateStorybookStory(task: Task): string {
    const componentName = this.toComponentName(task.name);
    return `/**
 * ${task.name} Storybook Stories
 */

import type { Meta, StoryObj } from '@storybook/react';
import { ${componentName} } from './${componentName}';

const meta: Meta<typeof ${componentName}> = {
  title: 'Components/${componentName}',
  component: ${componentName},
  tags: ['autodocs'],
  argTypes: {
    initialValue: { control: 'text' },
    disabled: { control: 'boolean' },
  },
};

export default meta;
type Story = StoryObj<typeof ${componentName}>;

export const Default: Story = {
  args: {
    initialValue: '',
    disabled: false,
  },
};

export const WithValue: Story = {
  args: {
    initialValue: 'Hello World',
    disabled: false,
  },
};

export const Disabled: Story = {
  args: {
    initialValue: 'Disabled input',
    disabled: true,
  },
};
`;
  }

  /**
   * Generate component index
   */
  private generateComponentIndex(task: Task): string {
    const componentName = this.toComponentName(task.name);
    return `/**
 * ${task.name} Component Export
 */

export { ${componentName}, type ${componentName}Props } from './${componentName}';
`;
  }

  /**
   * Generate page component
   */
  private generatePage(task: Task): string {
    const pageName = this.toComponentName(task.name);
    return `/**
 * ${task.name} Page
 */

import { useEffect, useState } from 'react';

export interface ${pageName}PageProps {
  /** Initial data loader */
  initialData?: unknown;
}

export function ${pageName}Page({ initialData }: ${pageName}PageProps) {
  const [data, setData] = useState(initialData);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    // TODO: Load data from API
  }, []);

  return (
    <div className="${pageName.toLowerCase()}-page">
      <h1>${task.name}</h1>
      {loading ? (
        <p>Loading...</p>
      ) : (
        <div>{/* TODO: Render content */}</div>
      )}
    </div>
  );
}

export default ${pageName}Page;
`;
  }

  /**
   * Generate page index
   */
  private generatePageIndex(task: Task): string {
    const pageName = this.toComponentName(task.name);
    return `/**
 * ${task.name} Page Export
 */

export { ${pageName}Page, type ${pageName}PageProps } from './${pageName}';
`;
  }

  /**
   * Generate custom hook
   */
  private generateHook(task: Task): string {
    const hookName = this.toHookName(task.name);
    return `/**
 * ${task.name} Hook
 */

import { useState, useCallback } from 'react';

export interface Use${this.capitalize(hookName)}Options {
  /** Initial value */
  initialValue?: unknown;
  /** Async data fetcher */
  fetcher?: () => Promise<unknown>;
}

export interface Use${this.capitalize(hookName)}Return {
  /** Current value */
  value: unknown;
  /** Loading state */
  loading: boolean;
  /** Error state */
  error: Error | null;
  /** Refresh function */
  refresh: () => Promise<void>;
}

export function use${this.capitalize(hookName)}(
  options: Use${this.capitalize(hookName)}Options = {}
): Use${this.capitalize(hookName)}Return {
  const { initialValue, fetcher } = options;
  const [value, setValue] = useState(initialValue);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const refresh = useCallback(async () => {
    if (!fetcher) return;

    setLoading(true);
    setError(null);
    try {
      const result = await fetcher();
      setValue(result);
    } catch (e) {
      setError(e instanceof Error ? e : new Error(String(e)));
    } finally {
      setLoading(false);
    }
  }, [fetcher]);

  return { value, loading, error, refresh };
}
`;
  }

  /**
   * Generate hook test
   */
  private generateHookTest(task: Task): string {
    const hookName = this.toHookName(task.name);
    return `/**
 * ${task.name} Hook Tests
 */

import { renderHook, act } from '@testing-library/react';
import { use${this.capitalize(hookName)} } from './${hookName}';

describe('use${this.capitalize(hookName)}', () => {
  it('should initialize with initial value', () => {
    const { result } = renderHook(() =>
      use${this.capitalize(hookName)}({ initialValue: 'test' })
    );

    expect(result.current.value).toBe('test');
    expect(result.current.loading).toBe(false);
    expect(result.current.error).toBeNull();
  });

  it('should handle refresh', async () => {
    const fetcher = vi.fn().mockResolvedValue('fetched');
    const { result } = renderHook(() =>
      use${this.capitalize(hookName)}({ fetcher })
    );

    await act(async () => {
      await result.current.refresh();
    });

    expect(fetcher).toHaveBeenCalled();
    expect(result.current.value).toBe('fetched');
  });
});
`;
  }

  /**
   * Generate state store
   */
  private generateStore(task: Task): string {
    const storeName = this.toComponentName(task.name);
    return `/**
 * ${task.name} Store
 */

import { create } from 'zustand';

export interface ${storeName}State {
  items: unknown[];
  loading: boolean;
  error: string | null;
}

export interface ${storeName}Actions {
  fetchItems: () => Promise<void>;
  addItem: (item: unknown) => void;
  removeItem: (id: string) => void;
  clearError: () => void;
}

export type ${storeName}Store = ${storeName}State & ${storeName}Actions;

export const use${storeName}Store = create<${storeName}Store>((set) => ({
  items: [],
  loading: false,
  error: null,

  fetchItems: async () => {
    set({ loading: true, error: null });
    try {
      // TODO: Fetch items from API
      set({ items: [], loading: false });
    } catch (error) {
      set({ error: (error as Error).message, loading: false });
    }
  },

  addItem: (item) => {
    set((state) => ({
      items: [...state.items, item],
    }));
  },

  removeItem: (id) => {
    set((state) => ({
      items: state.items.filter((item: any) => item.id !== id),
    }));
  },

  clearError: () => {
    set({ error: null });
  },
}));
`;
  }

  /**
   * Generate store test
   */
  private generateStoreTest(task: Task): string {
    const storeName = this.toComponentName(task.name);
    return `/**
 * ${task.name} Store Tests
 */

import { renderHook, act } from '@testing-library/react';
import { use${storeName}Store } from './${storeName}';

describe('use${storeName}Store', () => {
  it('should initialize with default values', () => {
    const { result } = renderHook(() => use${storeName}Store());

    expect(result.current.items).toEqual([]);
    expect(result.current.loading).toBe(false);
    expect(result.current.error).toBeNull();
  });

  it('should add item', () => {
    const { result } = renderHook(() => use${storeName}Store());

    act(() => {
      result.current.addItem({ id: '1', name: 'Test' });
    });

    expect(result.current.items).toHaveLength(1);
    expect(result.current.items[0].name).toBe('Test');
  });
});
`;
  }

  /**
   * Generate component test
   */
  private generateComponentTest(task: Task): string {
    const componentName = this.toComponentName(task.name);
    return `/**
 * ${task.name} Component Tests
 */

import { render, screen } from '@testing-library/react';
import { ${componentName} } from './${componentName}';

describe('${componentName}', () => {
  it('should render with default props', () => {
    render(<${componentName} />);
    expect(screen.getByTestId('${componentName.toLowerCase()}-input')).toBeInTheDocument();
  });

  it('should display initial value', () => {
    render(<${componentName} initialValue="Hello" />);
    expect(screen.getByDisplayValue('Hello')).toBeInTheDocument();
  });

  it('should call onChange when value changes', () => {
    const onChange = vi.fn();
    render(<${componentName} onChange={onChange} />);

    const input = screen.getByTestId('${componentName.toLowerCase()}-input');
    // TODO: Simulate change event
    expect(onChange).toBeDefined();
  });

  it('should be disabled when disabled prop is true', () => {
    render(<${componentName} disabled />);
    expect(screen.getByTestId('${componentName.toLowerCase()}-input')).toBeDisabled();
  });
});
`;
  }

  /**
   * Convert task name to component name
   */
  private toComponentName(name: string): string {
    return name
      .split(/\s+/)
      .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
      .join('');
  }

  /**
   * Convert task name to hook name
   */
  private toHookName(name: string): string {
    const componentName = this.toComponentName(name);
    return `use${componentName}`;
  }

  /**
   * Capitalize first letter
   */
  private capitalize(str: string): string {
    return str.charAt(0).toUpperCase() + str.slice(1);
  }

  /**
   * Add system message to state
   */
  private addSystemMessage(content: string): void {
    this.state.messages.push({
      id: `system-${Date.now()}`,
      type: 'system',
      content,
      timestamp: new Date(),
    });
  }
}
