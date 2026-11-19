// New task dialog (§9.2 v1.6): prefilled from the current page; opens the new task afterwards.
import type { CreateTaskInput, TaskPriority, TaskStatus } from '@tracker/shared';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
  type ReactNode,
} from 'react';
import { useLocation, useNavigate } from 'react-router';
import { useCreateTask } from '@/api/tasks.ts';
import { Button } from '@/components/ui/button.tsx';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog.tsx';
import { Input } from '@/components/ui/input.tsx';
import { Textarea } from '@/components/ui/textarea.tsx';
import {
  AssigneePicker,
  EstimateField,
  PriorityPicker,
  ProductPicker,
  StatusPicker,
  TagsPicker,
} from './pickers.tsx';

export interface NewTaskDefaults {
  status?: TaskStatus;
  assignee?: string | null;
  product?: string | null;
}

interface Ctx {
  openNewTask: () => void;
  /** Pages register the defaults for tasks created while they are shown. */
  setPageDefaults: (defaults: NewTaskDefaults) => void;
}

const NewTaskContext = createContext<Ctx | null>(null);

export function useNewTask() {
  const ctx = useContext(NewTaskContext);
  if (!ctx) throw new Error('useNewTask must be used inside <NewTaskProvider>');
  return ctx;
}

/** Registers this page's defaults for the New task dialog while the page is mounted. */
export function usePageTaskDefaults(defaults: NewTaskDefaults) {
  const { setPageDefaults } = useNewTask();
  const key = JSON.stringify(defaults);
  useEffect(() => {
    setPageDefaults(JSON.parse(key) as NewTaskDefaults);
    return () => setPageDefaults({});
  }, [key, setPageDefaults]);
}

export function NewTaskProvider({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const pageDefaults = useRef<NewTaskDefaults>({});
  const [defaults, setDefaults] = useState<NewTaskDefaults>({});

  const ctx = useMemo<Ctx>(
    () => ({
      openNewTask: () => {
        setDefaults(pageDefaults.current);
        setOpen(true);
      },
      setPageDefaults: (d) => {
        pageDefaults.current = d;
      },
    }),
    [],
  );

  return (
    <NewTaskContext.Provider value={ctx}>
      {children}
      <Dialog open={open} onOpenChange={setOpen}>
        {open && <NewTaskForm defaults={defaults} onDone={() => setOpen(false)} />}
      </Dialog>
    </NewTaskContext.Provider>
  );
}

function NewTaskForm({ defaults, onDone }: { defaults: NewTaskDefaults; onDone: () => void }) {
  const create = useCreateTask();
  const navigate = useNavigate();
  const location = useLocation();

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [status, setStatus] = useState<TaskStatus>(defaults.status ?? 'backlog');
  const [priority, setPriority] = useState<TaskPriority>('none');
  const [assignee, setAssignee] = useState<string | null>(defaults.assignee ?? null);
  const [product, setProduct] = useState<string | null>(defaults.product ?? null);
  const [estimateHours, setEstimateHours] = useState<number | null>(null);
  const [tags, setTags] = useState<string[]>([]);
  const [titleError, setTitleError] = useState<string | null>(null);

  const submit = useCallback(
    (e?: FormEvent) => {
      e?.preventDefault();
      if (create.isPending) return;
      if (!title.trim()) {
        setTitleError('Title is required');
        return;
      }
      const input: CreateTaskInput = {
        title: title.trim(),
        description,
        status,
        priority,
        assignee,
        product,
        tags,
        estimateHours,
      };
      create.mutate(input, {
        onSuccess: (task) => {
          onDone();
          const params = new URLSearchParams(location.search);
          params.set('task', task.id);
          void navigate({ pathname: location.pathname, search: params.toString() });
        },
      });
    },
    [
      assignee,
      create,
      description,
      estimateHours,
      location,
      navigate,
      onDone,
      priority,
      product,
      status,
      tags,
      title,
    ],
  );

  return (
    <DialogContent className="gap-4 sm:max-w-xl">
      <DialogHeader>
        <DialogTitle className="text-[15px]">New task</DialogTitle>
        <DialogDescription className="text-xs">⌘/Ctrl+Enter to create.</DialogDescription>
      </DialogHeader>
      <form
        onSubmit={submit}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) submit(e);
        }}
        className="flex flex-col gap-3"
      >
        <div className="flex flex-col gap-1">
          <Input
            autoFocus
            aria-label="Title"
            placeholder="Task title"
            value={title}
            maxLength={200}
            aria-invalid={!!titleError}
            aria-describedby={titleError ? 'new-task-title-error' : undefined}
            onChange={(e) => {
              setTitle(e.target.value);
              setTitleError(null);
            }}
            className="h-9 text-[15px] font-medium"
          />
          {titleError && (
            <p id="new-task-title-error" role="alert" className="m-0 text-[11px] text-destructive">
              {titleError}
            </p>
          )}
        </div>
        <Textarea
          aria-label="Description"
          placeholder="Add a description…"
          value={description}
          maxLength={10_000}
          onChange={(e) => setDescription(e.target.value)}
          className="min-h-24 text-[13px]"
        />
        <div className="flex flex-wrap gap-1.5" role="group" aria-label="Properties">
          <StatusPicker variant="chip" value={status} onChange={setStatus} />
          <PriorityPicker variant="chip" value={priority} onChange={setPriority} />
          <AssigneePicker variant="chip" value={assignee} onChange={setAssignee} />
          <ProductPicker variant="chip" value={product} onChange={setProduct} />
          <EstimateField variant="chip" value={estimateHours} onChange={setEstimateHours} />
          <TagsPicker variant="chip" value={tags} onChange={setTags} />
        </div>
        {create.isError && (
          <p role="alert" className="m-0 text-xs text-destructive">
            Couldn't create the task: {create.error.message}
          </p>
        )}
        <DialogFooter>
          <Button type="button" variant="outline" onClick={onDone}>
            Cancel
          </Button>
          <Button type="submit" disabled={create.isPending}>
            {create.isPending ? 'Creating…' : 'Create task'}
          </Button>
        </DialogFooter>
      </form>
    </DialogContent>
  );
}
