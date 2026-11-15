import {
  err,
  ok,
  type AtomicTask,
  type HarnessError,
  type LinePatch,
  type Result,
  type WriteLockZone,
} from '../types';

export function validateDag(
  tasks: AtomicTask[],
): Result<AtomicTask[], HarnessError> {
  const byId = new Map<string, AtomicTask>();
  for (const task of tasks) {
    byId.set(task.id, task);
  }

  for (const task of tasks) {
    for (const dep of task.dependsOn) {
      if (!byId.has(dep)) {
        return err({
          code: 'DAG_MISSING_DEPENDENCY',
          message: `Task ${task.id} depends on missing task ${dep}`,
        });
      }
    }
  }

  const visited = new Set<string>();
  const visiting = new Set<string>();
  const sorted: AtomicTask[] = [];

  const dfs = (id: string): Result<void, HarnessError> => {
    if (visited.has(id)) return ok(undefined);
    if (visiting.has(id)) {
      return err({
        code: 'DAG_CYCLE_DETECTED',
        message: `Cyclic dependency detected in task DAG involving ${id}`,
      });
    }
    visiting.add(id);
    const task = byId.get(id)!;
    for (const dep of task.dependsOn) {
      const res = dfs(dep);
      if (!res.ok) return res;
    }
    visiting.delete(id);
    visited.add(id);
    sorted.push(task);
    return ok(undefined);
  };

  for (const task of tasks) {
    const res = dfs(task.id);
    if (!res.ok) return res;
  }

  return ok(sorted);
}

export function getNextRunnableTask(tasks: AtomicTask[]): AtomicTask | null {
  const passedIds = new Set(
    tasks.filter((t) => t.status === 'passed').map((t) => t.id),
  );

  const active = tasks.find(
    (t) =>
      t.status === 'in_progress' &&
      t.dependsOn.every((dep) => passedIds.has(dep)),
  );
  if (active) return active;

  return (
    tasks.find(
      (t) =>
        t.status === 'pending' &&
        t.dependsOn.every((dep) => passedIds.has(dep)),
    ) ?? null
  );
}

export function checkWriteLock(
  patch: LinePatch,
  lockZone: WriteLockZone,
): Result<void, HarnessError> {
  const normalizedTarget = patch.file.replace(/^\.\//, '');
  const normalizedEditable = lockZone.editableRange.file.replace(/^\.\//, '');

  for (const lockedFile of lockZone.readOnlyFiles) {
    if (lockedFile.replace(/^\.\//, '') === normalizedTarget) {
      return err({
        code: 'WRITE_LOCK_VIOLATION',
        message: `Write-lock blocked edit to read-only contract or test file: ${patch.file}`,
        details: `Writable range is strictly ${lockZone.editableRange.file}:${lockZone.editableRange.startLine}-${lockZone.editableRange.endLine}`,
      });
    }
  }

  if (normalizedTarget !== normalizedEditable) {
    return err({
      code: 'WRITE_LOCK_VIOLATION',
      message: `Write-lock blocked edit outside target file: ${patch.file}`,
      details: `Only ${lockZone.editableRange.file} is writable for this task.`,
    });
  }

  if (
    patch.startLine < lockZone.editableRange.startLine ||
    patch.endLine > lockZone.editableRange.endLine ||
    patch.startLine > patch.endLine
  ) {
    return err({
      code: 'WRITE_LOCK_VIOLATION',
      message: `Write-lock blocked out-of-range edit [${patch.startLine}-${patch.endLine}] outside [${lockZone.editableRange.startLine}-${lockZone.editableRange.endLine}]`,
      details: 'Tampering with function signatures or locked interfaces is prohibited.',
    });
  }

  return ok(undefined);
}
