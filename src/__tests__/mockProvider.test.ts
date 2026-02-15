import { describe, expect, it } from 'vitest';
import { mockProvider } from '@/services/mockProvider';

describe('mockProvider execution and QA', () => {
  it('generates executions matched to selected task set', async () => {
    const result = await mockProvider.getExecutions({
      selectedTaskIds: [14],
      categorySelections: [{ categoryId: 'cat-speed', count: 3 }],
      maxCases: 40,
    });

    expect(result.length).toBeGreaterThan(0);
    expect(result.every((execution) => execution.taskId === 14)).toBe(true);
    expect(result.every((execution) => execution.caseId)).toBe(true);
  });

  it('creates run snapshot with case refs', async () => {
    const snapshot = await mockProvider.createRunSnapshot({
      selectedTaskIds: [3, 6, 9],
      categorySelections: [{ categoryId: 'cat-speed', count: 3 }],
      maxCases: 40,
    });

    expect(snapshot.runId).toContain('run-');
    expect(snapshot.executions.length).toBeGreaterThan(0);
    expect(snapshot.caseRefs.length).toBe(snapshot.executions.length);
    expect(snapshot.caseRefs.every((item) => item.caseId.length > 0)).toBe(true);
  });

  it('answers case question with evidence references', async () => {
    const snapshot = await mockProvider.createRunSnapshot({
      selectedTaskIds: [3, 6, 9],
      categorySelections: [{ categoryId: 'cat-speed', count: 3 }],
      maxCases: 40,
    });

    const caseId = snapshot.caseRefs[0]?.caseId;
    expect(caseId).toBeTruthy();

    const response = await mockProvider.askQuestion(
      {
        runId: snapshot.runId,
        question: '这个案例的关键问题是什么？',
        scope: 'case',
        caseId,
      },
      snapshot,
    );

    expect(response.answer.length).toBeGreaterThan(0);
    expect(response.evidence.length).toBeGreaterThan(0);
    expect(response.evidence[0].caseId).toBe(caseId);
  });

  it('returns fallback when no direct evidence is found', async () => {
    const snapshot = await mockProvider.createRunSnapshot({
      selectedTaskIds: [3, 6],
      categorySelections: [{ categoryId: 'cat-speed', count: 2 }],
      maxCases: 40,
    });

    const response = await mockProvider.askQuestion(
      {
        runId: snapshot.runId,
        question: '请分析不存在的案例',
        scope: 'case',
        caseId: 'missing-case-id',
      },
      snapshot,
    );

    expect(response.answer).toContain('未找到直接证据');
  });

  it('applies global task filter for QA', async () => {
    const snapshot = await mockProvider.createRunSnapshot({
      selectedTaskIds: [3, 6, 9],
      categorySelections: [
        { categoryId: 'cat-speed', count: 3 },
        { categoryId: 'cat-business', count: 3 },
      ],
      maxCases: 40,
    });

    const filteredTaskId = 6;
    const response = await mockProvider.askQuestion(
      {
        runId: snapshot.runId,
        question: '这个任务的失败情况如何？',
        scope: 'global',
        filters: { taskId: filteredTaskId },
      },
      snapshot,
    );

    expect(response.answer.length).toBeGreaterThan(0);
    expect(response.evidence.length).toBeGreaterThan(0);
    expect(response.evidence.every((item) => item.taskId === filteredTaskId)).toBe(true);
  });
});
