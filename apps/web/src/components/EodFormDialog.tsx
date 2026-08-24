import { useState } from 'react';
import { ClipboardCheck, Plus, X } from 'lucide-react';
import { useAttendancePunch } from '@/hooks/useAttendance';
import { ApiRequestError } from '@/lib/api';

/**
 * End-of-day summary form shown when punching out. Completed Tasks required
 * (at least one item), Tomorrow's Plan required, Blockers optional.
 */
export function EodFormDialog({ onClose }: { onClose: () => void }) {
  const { punchOut } = useAttendancePunch();
  const [taskDraft, setTaskDraft] = useState('');
  const [tasks, setTasks] = useState<string[]>([]);
  const [tomorrowsPlan, setTomorrowsPlan] = useState('');
  const [blockers, setBlockers] = useState('');
  const [error, setError] = useState<string | null>(null);

  function addTask() {
    const t = taskDraft.trim();
    if (!t) return;
    setTasks((prev) => [...prev, t]);
    setTaskDraft('');
  }

  const canSubmit = tasks.length > 0 && tomorrowsPlan.trim().length > 0;

  async function submit() {
    setError(null);
    try {
      await punchOut.mutateAsync({
        completedTasks: tasks,
        tomorrowsPlan: tomorrowsPlan.trim(),
        blockers: blockers.trim() || undefined,
      });
      onClose();
    } catch (e) {
      setError(e instanceof ApiRequestError ? e.message : 'Could not punch out.');
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} aria-hidden />
      <div className="relative w-full max-w-lg rounded-card border border-line/10 bg-elevated p-5 shadow-card">
        <button
          onClick={onClose}
          className="absolute right-3 top-3 rounded-lg p-1 text-muted hover:bg-line/5"
          aria-label="Close"
        >
          <X className="h-4 w-4" />
        </button>
        <h3 className="flex items-center gap-2 text-sm font-semibold text-content">
          <ClipboardCheck className="h-4 w-4 text-accent-bright" /> End-of-day summary
        </h3>

        <div className="mt-4">
          <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-muted">
            Completed tasks
          </span>
          <div className="flex items-center gap-2">
            <input
              value={taskDraft}
              onChange={(e) => setTaskDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  addTask();
                }
              }}
              placeholder="Add a completed task…"
              className="ft-input flex-1"
            />
            <button type="button" className="ft-btn-ghost shrink-0" onClick={addTask} disabled={!taskDraft.trim()}>
              <Plus className="h-4 w-4" /> Add
            </button>
          </div>
          {tasks.length > 0 && (
            <ul className="mt-2 space-y-1.5">
              {tasks.map((t, i) => (
                <li
                  key={i}
                  className="flex items-center justify-between gap-2 rounded-lg bg-surface-deep px-3 py-1.5 text-sm text-content"
                >
                  <span className="truncate">{t}</span>
                  <button
                    type="button"
                    onClick={() => setTasks((prev) => prev.filter((_, j) => j !== i))}
                    className="shrink-0 text-muted hover:text-danger"
                    aria-label={`Remove ${t}`}
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        <label className="mt-4 block">
          <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-muted">
            Tomorrow's plan
          </span>
          <textarea
            value={tomorrowsPlan}
            onChange={(e) => setTomorrowsPlan(e.target.value)}
            rows={2}
            placeholder="What's next?"
            className="ft-input w-full resize-none"
          />
        </label>

        <label className="mt-4 block">
          <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-muted">
            Blockers <span className="normal-case text-subtle">(optional)</span>
          </span>
          <textarea
            value={blockers}
            onChange={(e) => setBlockers(e.target.value)}
            rows={2}
            placeholder="Anything blocking you?"
            className="ft-input w-full resize-none"
          />
        </label>

        {error && <p className="mt-3 rounded-lg bg-danger/10 px-3 py-2 text-xs text-danger">{error}</p>}

        <button
          className="ft-btn-primary mt-4 w-full"
          onClick={submit}
          disabled={!canSubmit || punchOut.isPending}
          title={!canSubmit ? 'Add at least one completed task and tomorrow\'s plan' : undefined}
        >
          {punchOut.isPending ? 'Punching out…' : 'Punch out'}
        </button>
      </div>
    </div>
  );
}
