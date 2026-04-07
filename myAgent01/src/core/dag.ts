/**
 * DAG (Directed Acyclic Graph) implementation for task scheduling
 * @module core/dag
 */

import type {
  DAG,
  DAGNode,
  DAGEdge,
  Task,
  DAGValidationResult,
} from '../types/index.js';

/**
 * DAG Builder for constructing task dependency graphs
 */
export class DAGBuilder {
  private nodes: Map<string, DAGNode> = new Map();
  private taskMap: Map<string, Task> = new Map();
  private edges: DAGEdge[] = [];

  /**
   * Add a node to the DAG
   */
  addNode(id: string, dependencies: string[], parallelGroup: number = 0): DAGBuilder {
    this.nodes.set(id, {
      id,
      taskId: id,
      dependencies,
      parallelGroup,
    });
    return this;
  }

  /**
   * Add a task to the DAG (stores task for lookup)
   */
  addTask(task: Task): DAGBuilder {
    this.taskMap.set(task.id, task);
    this.addNode(task.id, task.depends ?? []);
    return this;
  }

  /**
   * Add an edge to the DAG
   */
  addEdge(from: string, to: string): DAGBuilder {
    this.edges.push({ from, to });

    // Update target node's dependencies if it exists
    const targetNode = this.nodes.get(to);
    if (targetNode && !targetNode.dependencies.includes(from)) {
      targetNode.dependencies.push(from);
    }

    return this;
  }

  /**
   * Build the final DAG
   */
  build(): DAG {
    const nodes = Array.from(this.nodes.values());
    const executionOrder = this.getExecutionOrder();

    return new DAGImpl(nodes, this.edges, executionOrder, this.taskMap);
  }

  /**
   * Get execution order with parallelizable tasks grouped together
   */
  getExecutionOrder(): string[][] {
    const inDegree = new Map<string, number>();
    const adjacencyList = new Map<string, string[]>();

    // Initialize
    for (const node of this.nodes.values()) {
      inDegree.set(node.taskId, node.dependencies.length);
      adjacencyList.set(node.taskId, []);
    }

    // Build adjacency list from edges
    for (const edge of this.edges) {
      const neighbors = adjacencyList.get(edge.from);
      if (neighbors) {
        neighbors.push(edge.to);
      }
    }

    // Topological sort with level grouping
    const result: string[][] = [];
    const visited = new Set<string>();

    while (visited.size < this.nodes.size) {
      // Find all nodes with no remaining dependencies
      const currentLevel: string[] = [];

      for (const [taskId, degree] of inDegree) {
        if (degree === 0 && !visited.has(taskId)) {
          currentLevel.push(taskId);
        }
      }

      if (currentLevel.length === 0 && visited.size < this.nodes.size) {
        // Cycle detected or error
        break;
      }

      // Sort current level for deterministic output
      currentLevel.sort();
      result.push(currentLevel);

      // Mark these as visited and reduce dependencies of their neighbors
      for (const taskId of currentLevel) {
        visited.add(taskId);

        const neighbors = adjacencyList.get(taskId);
        if (neighbors) {
          for (const neighbor of neighbors) {
            const currentDegree = inDegree.get(neighbor);
            if (currentDegree !== undefined) {
              inDegree.set(neighbor, currentDegree - 1);
            }
          }
        }
      }
    }

    return result;
  }

  /**
   * Validate the DAG
   */
  validate(): DAGValidationResult {
    const errors: string[] = [];
    const orphanNodes: string[] = [];
    const nodeIds = new Set(this.nodes.keys());

    // Check for orphan edges (edges pointing to non-existent nodes)
    for (const edge of this.edges) {
      if (!nodeIds.has(edge.from)) {
        errors.push(`Edge from unknown node: ${edge.from}`);
      }
      if (!nodeIds.has(edge.to)) {
        errors.push(`Edge to unknown node: ${edge.to}`);
        orphanNodes.push(edge.to);
      }
    }

    // Check for cycles using DFS
    const hasCycles = !this.validateNoCycles();

    if (hasCycles) {
      errors.push('Cycle detected in DAG');
    }

    // Check all dependencies exist
    for (const node of this.nodes.values()) {
      for (const dep of node.dependencies) {
        if (!nodeIds.has(dep)) {
          errors.push(`Node ${node.taskId} has unknown dependency: ${dep}`);
        }
      }
    }

    return {
      valid: errors.length === 0,
      hasCycles,
      orphanNodes,
      errors,
    };
  }

  /**
   * Check if the graph has no cycles
   */
  private validateNoCycles(): boolean {
    const WHITE = 0; // Not visited
    const GRAY = 1;   // In current path
    const BLACK = 2;  // Fully processed

    const color = new Map<string, number>();
    for (const node of this.nodes.keys()) {
      color.set(node, WHITE);
    }

    const adjacencyList = new Map<string, string[]>();
    for (const node of this.nodes.values()) {
      adjacencyList.set(node.taskId, []);
    }
    for (const edge of this.edges) {
      const neighbors = adjacencyList.get(edge.from);
      if (neighbors) {
        neighbors.push(edge.to);
      }
    }

    const hasCycleFrom = (nodeId: string): boolean => {
      color.set(nodeId, GRAY);

      const neighbors = adjacencyList.get(nodeId) ?? [];
      for (const neighbor of neighbors) {
        if (color.get(neighbor) === GRAY) {
          return true; // Back edge found = cycle
        }
        if (color.get(neighbor) === WHITE && hasCycleFrom(neighbor)) {
          return true;
        }
      }

      color.set(nodeId, BLACK);
      return false;
    };

    for (const nodeId of this.nodes.keys()) {
      if (color.get(nodeId) === WHITE && hasCycleFrom(nodeId)) {
        return false;
      }
    }

    return true;
  }
}

/**
 * Detect parallel tasks from task list
 */
export function detectParallelTasks(tasks: Task[]): string[][] {
  if (tasks.length === 0) {
    return [];
  }

  const taskMap = new Map<string, Task>();
  const taskIds = new Set<string>();

  for (const task of tasks) {
    taskMap.set(task.id, task);
    taskIds.add(task.id);
  }

  // Build DAG
  const builder = new DAGBuilder();

  for (const task of tasks) {
    const depends = task.depends ?? [];
    builder.addNode(task.id, depends);
  }

  // Add edges based on dependencies
  for (const task of tasks) {
    for (const dep of task.depends ?? []) {
      builder.addEdge(dep, task.id);
    }
  }

  return builder.build().executionOrder;
}

/**
 * Topological sort of nodes
 */
export function topologicalSort(nodes: DAGNode[], edges: DAGEdge[]): string[] {
  const inDegree = new Map<string, number>();
  const adjacencyList = new Map<string, string[]>();

  // Initialize
  for (const node of nodes) {
    inDegree.set(node.taskId, node.dependencies.length);
    adjacencyList.set(node.taskId, []);
  }

  // Build adjacency list
  for (const edge of edges) {
    const neighbors = adjacencyList.get(edge.from);
    if (neighbors) {
      neighbors.push(edge.to);
    }
  }

  // Queue for BFS
  const queue: string[] = [];
  const result: string[] = [];

  // Start with nodes that have no dependencies
  for (const [taskId, degree] of inDegree) {
    if (degree === 0) {
      queue.push(taskId);
    }
  }

  while (queue.length > 0) {
    const current = queue.shift()!;
    result.push(current);

    const neighbors = adjacencyList.get(current) ?? [];
    for (const neighbor of neighbors) {
      const degree = inDegree.get(neighbor);
      if (degree !== undefined) {
        const newDegree = degree - 1;
        inDegree.set(neighbor, newDegree);
        if (newDegree === 0) {
          queue.push(neighbor);
        }
      }
    }
  }

  return result;
}

/**
 * Validate that graph has no cycles
 */
export function validateNoCycles(nodes: DAGNode[], edges: DAGEdge[]): boolean {
  const builder = new DAGBuilder();

  for (const node of nodes) {
    builder.addNode(node.id, node.dependencies, node.parallelGroup);
  }

  for (const edge of edges) {
    builder.addEdge(edge.from, edge.to);
  }

  return builder.validate().valid;
}

/**
 * Find all paths between two nodes
 */
export function findAllPaths(nodes: DAGNode[], edges: DAGEdge[], start: string, end: string): string[][] {
  const adjacencyList = new Map<string, string[]>();

  for (const node of nodes) {
    adjacencyList.set(node.taskId, []);
  }

  for (const edge of edges) {
    const neighbors = adjacencyList.get(edge.from);
    if (neighbors) {
      neighbors.push(edge.to);
    }
  }

  const paths: string[][] = [];
  const currentPath: string[] = [];

  const dfs = (current: string): void => {
    currentPath.push(current);

    if (current === end) {
      paths.push([...currentPath]);
    } else {
      const neighbors = adjacencyList.get(current) ?? [];
      for (const neighbor of neighbors) {
        if (!currentPath.includes(neighbor)) {
          dfs(neighbor);
        }
      }
    }

    currentPath.pop();
  };

  dfs(start);
  return paths;
}

/**
 * Find the critical path (longest path) through the DAG
 */
export function findCriticalPath(nodes: DAGNode[], edges: DAGEdge[], taskDurations: Map<string, number>): string[] {
  const adjacencyList = new Map<string, string[]>();

  for (const node of nodes) {
    adjacencyList.set(node.taskId, []);
  }

  for (const edge of edges) {
    const neighbors = adjacencyList.get(edge.from);
    if (neighbors) {
      neighbors.push(edge.to);
    }
  }

  // Calculate earliest start times
  const earliestStart = new Map<string, number>();
  for (const node of nodes) {
    earliestStart.set(node.taskId, 0);
  }

  const sorted = topologicalSort(nodes, edges);

  for (const taskId of sorted) {
    const node = nodes.find(n => n.taskId === taskId);
    const duration = taskDurations.get(taskId) ?? 0;
    const neighbors = adjacencyList.get(taskId) ?? [];

    for (const neighbor of neighbors) {
      const currentStart = earliestStart.get(neighbor) ?? 0;
      const newStart = (earliestStart.get(taskId) ?? 0) + duration;
      if (newStart > currentStart) {
        earliestStart.set(neighbor, newStart);
      }
    }
  }

  // Find the task with the latest completion time
  let maxTime = 0;
  let criticalTask = '';

  for (const [taskId, start] of earliestStart) {
    const duration = taskDurations.get(taskId) ?? 0;
    const total = start + duration;
    if (total > maxTime) {
      maxTime = total;
      criticalTask = taskId;
    }
  }

  // Reconstruct path (simplified - returns just the last task on critical path)
  return [criticalTask];
}

/**
 * DAG Implementation class that implements the DAG interface
 */
class DAGImpl implements DAG {
  constructor(
    private nodes: DAGNode[],
    private edges: DAGEdge[],
    private executionOrder: string[][],
    private taskMap: Map<string, Task>
  ) {}

  getNode(id: string): DAGNode | undefined {
    return this.nodes.find(n => n.id === id);
  }

  getTasks(): Map<string, Task> {
    return new Map(this.taskMap);
  }
}
