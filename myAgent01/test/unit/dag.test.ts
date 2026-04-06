/**
 * Unit tests for DAG implementation
 */

import { describe, it, expect } from 'vitest';
import {
  DAGBuilder,
  detectParallelTasks,
  topologicalSort,
  validateNoCycles,
} from '../../src/core/dag.js';
import type { Task, DAGNode, DAGEdge } from '../../src/types/index.js';

describe('DAG', () => {
  describe('DAGBuilder', () => {
    it('should build a simple DAG', () => {
      const dag = new DAGBuilder()
        .addNode('task-1', [])
        .addNode('task-2', ['task-1'])
        .addNode('task-3', ['task-1'])
        .build();

      expect(dag.nodes).toHaveLength(3);
      expect(dag.edges).toHaveLength(2);
    });

    it('should detect execution order correctly', () => {
      const dag = new DAGBuilder()
        .addNode('task-1', [])
        .addNode('task-2', ['task-1'])
        .addNode('task-3', ['task-1'])
        .addNode('task-4', ['task-2', 'task-3'])
        .build();

      const order = dag.getExecutionOrder();
      expect(order).toHaveLength(2);
      expect(order[0]).toEqual(['task-1']);
      expect(order[1]).toContain('task-2');
      expect(order[1]).toContain('task-3');
    });

    it('should detect parallelizable tasks', () => {
      const dag = new DAGBuilder()
        .addNode('task-1', [])
        .addNode('task-2', ['task-1'])
        .addNode('task-3', ['task-1'])
        .addNode('task-4', ['task-2'])
        .addNode('task-5', ['task-3'])
        .build();

      const order = dag.getExecutionOrder();

      // First group: task-1 alone
      expect(order[0]).toEqual(['task-1']);

      // Second group: task-2 and task-3 (parallel)
      expect(order[1].sort()).toEqual(['task-2', 'task-3']);

      // Third group: task-4 and task-5 (parallel)
      expect(order[2].sort()).toEqual(['task-4', 'task-5']);
    });

    it('should validate DAG structure', () => {
      const result = new DAGBuilder()
        .addNode('task-1', [])
        .addNode('task-2', ['task-1'])
        .validate();

      expect(result.valid).toBe(true);
      expect(result.hasCycles).toBe(false);
    });

    it('should report orphan nodes', () => {
      const dag = new DAGBuilder()
        .addNode('task-1', [])
        .addNode('task-2', [])
        .addEdge('task-1', 'task-3') // task-3 doesn't exist
        .build();

      const result = dag.validate();
      expect(result.valid).toBe(false);
      expect(result.orphanNodes).toContain('task-3');
    });
  });

  describe('detectParallelTasks', () => {
    it('should identify tasks with no dependencies as parallel', () => {
      const tasks: Task[] = [
        { id: 't1', name: 'Task 1', parallel: false, owners: [], status: 'pending' },
        { id: 't2', name: 'Task 2', parallel: false, owners: [], status: 'pending' },
        { id: 't3', name: 'Task 3', depends: ['t1', 't2'], parallel: false, owners: [], status: 'pending' },
      ];

      const groups = detectParallelTasks(tasks);
      expect(groups).toHaveLength(2);
      expect(groups[0].sort()).toEqual(['t1', 't2']);
      expect(groups[1]).toEqual(['t3']);
    });

    it('should return single task if no parallelization possible', () => {
      const tasks: Task[] = [
        { id: 't1', name: 'Task 1', depends: [], parallel: false, owners: [], status: 'pending' },
        { id: 't2', name: 'Task 2', depends: ['t1'], parallel: false, owners: [], status: 'pending' },
      ];

      const groups = detectParallelTasks(tasks);
      expect(groups).toHaveLength(2);
    });
  });

  describe('topologicalSort', () => {
    it('should sort nodes in dependency order', () => {
      const nodes: DAGNode[] = [
        { id: 'n1', taskId: 't1', dependencies: [], parallelGroup: 0 },
        { id: 'n2', taskId: 't2', dependencies: ['t1'], parallelGroup: 1 },
        { id: 'n3', taskId: 't3', dependencies: ['t1'], parallelGroup: 1 },
        { id: 'n4', taskId: 't4', dependencies: ['t2', 't3'], parallelGroup: 2 },
      ];

      const edges: DAGEdge[] = [
        { from: 't1', to: 't2' },
        { from: 't1', to: 't3' },
        { from: 't2', to: 't4' },
        { from: 't3', to: 't4' },
      ];

      const sorted = topologicalSort(nodes, edges);
      expect(sorted[0]).toBe('t1');
      expect(sorted[3]).toBe('t4');
      expect(sorted.indexOf('t2')).toBeLessThan(sorted.indexOf('t4'));
      expect(sorted.indexOf('t3')).toBeLessThan(sorted.indexOf('t4'));
    });
  });

  describe('validateNoCycles', () => {
    it('should return true for acyclic graph', () => {
      const nodes: DAGNode[] = [
        { id: 'n1', taskId: 't1', dependencies: [], parallelGroup: 0 },
        { id: 'n2', taskId: 't2', dependencies: ['t1'], parallelGroup: 1 },
      ];

      const edges: DAGEdge[] = [{ from: 't1', to: 't2' }];

      expect(validateNoCycles(nodes, edges)).toBe(true);
    });

    it('should return false for cyclic graph', () => {
      const nodes: DAGNode[] = [
        { id: 'n1', taskId: 't1', dependencies: ['t2'], parallelGroup: 0 },
        { id: 'n2', taskId: 't2', dependencies: ['t1'], parallelGroup: 0 },
      ];

      const edges: DAGEdge[] = [
        { from: 't1', to: 't2' },
        { from: 't2', to: 't1' },
      ];

      expect(validateNoCycles(nodes, edges)).toBe(false);
    });
  });
});
