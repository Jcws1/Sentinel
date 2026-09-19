import type {
  BoundaryDefinition,
  BoundaryMutation,
  WorldFrame,
} from '../contracts/generated';
import type { DeepReadonly } from '../contracts/types';
import type { InteractiveState } from './interactiveClient';
import type { BoundaryEdit, ScenarioState } from './scenarioClient';
import {
  boundaryContains,
  metricVertex,
  validateBoundary,
} from '../world/boundaryGeometry';
import { immutableCopy } from '../world/immutable';
import {
  geometryFor,
  sameGeometry,
  validateLocalGeometry,
} from '../world/localGeometry';

export interface LiveBoundaryState {
  localGeometry?: ReturnType<typeof geometryFor>;
  runId?: string;
  missionId?: string;
  expectedRevision: number;
  edit?: BoundaryEdit;
  provisional: BoundaryDefinition[];
  menu?: ScenarioState['boundaryMenu'];
  requestId?: string;
  submittedId?: string;
  error?: string;
  message?: string;
  visibleView?: string;
}
const storageKey = 'sentinel.live-boundary-editor.v1';
/** UI draft only. The shared interactive client owns every request and receipt. */
export function createLiveBoundaryEditor(options: {
  publish: () => void;
  submit: (mutation: BoundaryMutation) => Promise<void>;
}) {
  let value: LiveBoundaryState = { expectedRevision: 0, provisional: [] },
    frame: DeepReadonly<WorldFrame> | undefined,
    interactive: DeepReadonly<InteractiveState> | undefined;
  let fault: string | undefined;
  try {
    const raw = globalThis.sessionStorage?.getItem(storageKey);
    if (raw) {
      const parsed = JSON.parse(raw) as LiveBoundaryState;
      if (
        !Number.isInteger(parsed.expectedRevision) ||
        parsed.expectedRevision < 0 ||
        !Array.isArray(parsed.provisional) ||
        parsed.provisional.length > 16
      )
        throw Error();
      if (parsed.localGeometry) validateLocalGeometry(parsed.localGeometry);
      parsed.provisional.forEach((b) => validateBoundary(b, parsed));
      if (
        parsed.edit &&
        (!Array.isArray(parsed.edit.vertices) ||
          parsed.edit.vertices.length > 32 ||
          parsed.edit.vertices.some(
            (v) =>
              !Array.isArray(v) ||
              v.length !== 2 ||
              v.some((x) => typeof x !== 'string' || x.length > 64),
          ))
      )
        throw Error();
      value = {
        ...parsed,
        edit: parsed.edit ? { ...parsed.edit, viewId: undefined } : undefined,
        visibleView: undefined,
        menu: undefined,
      };
    }
  } catch {
    fault =
      'Recovered boundary edit could not be read. No live boundary command will be sent.';
  }
  function persist() {
    try {
      globalThis.sessionStorage.setItem(storageKey, JSON.stringify(value));
    } catch {
      fault =
        'Session storage unavailable. Live edits are retained in memory; commands are blocked.';
    }
  }
  function emit(update: Partial<LiveBoundaryState>) {
    value = { ...value, ...update };
    persist();
    options.publish();
  }
  function effective(): BoundaryDefinition[] {
    return Object.entries(frame?.boundaryRules?.zones ?? {}).map(
      ([id, type]) => ({
        id: id.slice(`${frame!.interactive!.runId}:boundary:`.length),
        name: frame!.zones[id].label,
        type,
        vertices: frame!.zones[id].geometry.coordinates[0]
          .slice(0, -1)
          .map((v) => [v[0], v[1]]) as BoundaryDefinition['vertices'],
      }),
    );
  }
  function boundaries() {
    return [
      ...effective().filter(
        (b) => !value.provisional.some((p) => p.id === b.id),
      ),
      ...value.provisional,
    ];
  }
  function reason() {
    const run = frame?.interactive;
    if (fault) return fault;
    if (
      !run ||
      !['ready', 'running', 'paused'].includes(run.state) ||
      interactive?.current?.run.runId !== run.runId
    )
      return 'Open an active local demo. Recordings are read-only.';
    if (
      value.runId &&
      value.runId !== run.runId &&
      (value.edit || value.provisional.length || value.requestId)
    )
      return 'Return to the demo with the unfinished boundary edit, or cancel that edit first.';
    if (
      !interactive.current.ownsControl ||
      !run.capabilities.includes('boundary-edit')
    )
      return 'Acquire the active demo control lease to edit live boundaries.';
    if (value.runId === run.runId && !sameGeometry(value, run))
      return 'Recovered boundary geometry differs from its frozen run. No command will be sent.';
    if (interactive.busy || interactive.pending || value.requestId)
      return 'Reconcile the pending boundary or control request first.';
    return undefined;
  }
  async function submit(
    definition: BoundaryDefinition | undefined,
    id: string,
  ) {
    const blocked = reason();
    if (blocked) {
      emit({ error: blocked });
      return;
    }
    if (definition) {
      try {
        validateBoundary(definition, frame);
        if (definition.type === 'untyped')
          throw Error('Choose a type or annotation-only before activation.');
      } catch (e) {
        emit({ error: (e as Error).message });
        return;
      }
    }
    persist();
    if (fault) {
      emit({ error: fault });
      return;
    }
    emit({ error: undefined, message: 'Submitting live boundary change…' });
    await options.submit({
      expectedRevision: value.expectedRevision,
      operation: definition ? 'upsert' : 'delete',
      boundaryId: `${value.runId}:boundary:${id}`,
      ...(definition ? { definition } : {}),
    });
    if (interactive?.error && !value.requestId)
      emit({ error: interactive.error });
  }
  const editor = {
    get: () => immutableCopy(value),
    view: () => ({ boundaries: boundaries(), reason: reason() }),
    sync(
      next: DeepReadonly<WorldFrame> | undefined,
      command: DeepReadonly<InteractiveState>,
    ) {
      frame = next;
      interactive = command;
      const pending = command.pending;
      if (
        pending &&
        'intent' in pending.body &&
        pending.body.intent.action === 'boundary-edit' &&
        pending.body.intent.runId === value.runId
      ) {
        if (value.requestId !== pending.body.commandId) {
          value = {
            ...value,
            requestId: pending.body.commandId,
            submittedId: pending.body.intent.boundary?.boundaryId.slice(
              `${pending.body.intent.runId}:boundary:`.length,
            ),
          };
          persist();
        }
      }
      const receipt = command.receipt;
      if (value.requestId && receipt?.requestId === value.requestId) {
        if (!receipt.accepted) {
          value = {
            ...value,
            requestId: undefined,
            error: `${receipt.code}: ${receipt.message}`,
            message: undefined,
          };
          persist();
        } else if (
          (receipt.schemaVersion === '1.4' ||
            receipt.schemaVersion === '1.5' ||
            receipt.schemaVersion === '1.6') &&
          frame &&
          frame.interactive?.runId === value.runId &&
          (frame.liveBoundaries?.revision ?? 0) >=
            (receipt.boundaryRevision ?? Infinity)
        ) {
          value = {
            ...value,
            requestId: undefined,
            edit: undefined,
            provisional: value.provisional.filter(
              (p) => p.id !== value.submittedId,
            ),
            expectedRevision: frame.liveBoundaries!.revision,
            error: undefined,
            message: `Accepted · effective boundary revision ${receipt.boundaryRevision}`,
          };
          persist();
        }
      }
    },
    open(viewId: string) {
      if (!frame?.interactive) return;
      if (
        value.runId !== frame.interactive.runId &&
        (value.edit || value.provisional.length || value.requestId)
      ) {
        emit({ error: reason() });
        return;
      }
      emit({
        visibleView: viewId,
        runId: frame.interactive.runId,
        missionId: frame.mission.id,
        localGeometry: geometryFor(frame),
        ...(!value.edit && !value.provisional.length && !value.requestId
          ? { expectedRevision: frame.liveBoundaries?.revision ?? 0 }
          : {}),
      });
    },
    close() {
      editor.disarmBoundary();
      emit({ visibleView: undefined });
    },
    beginBoundary(viewId: string, id?: string) {
      editor.open(viewId);
      const blocked = reason();
      if (blocked) {
        emit({ error: blocked });
        return;
      }
      if (value.edit) return;
      const source = boundaries().find((b) => b.id === id);
      if (!source && boundaries().length >= 16) {
        emit({ error: 'At most 16 boundaries are supported.' });
        return;
      }
      emit({
        expectedRevision: frame?.liveBoundaries?.revision ?? 0,
        menu: undefined,
        error: undefined,
        edit: {
          id: source?.id ?? crypto.randomUUID(),
          originalId: source?.id,
          name: source?.name ?? `Live boundary ${boundaries().length + 1}`,
          type: source?.type ?? 'untyped',
          vertices:
            source?.vertices.map((v) => [String(v[0]), String(v[1])]) ?? [],
          viewId,
        },
      });
    },
    editBoundary(update: Partial<BoundaryEdit>) {
      if (value.edit && !value.requestId && !interactive?.pending)
        emit({ edit: { ...value.edit, ...update }, error: undefined });
    },
    disarmBoundary(viewId?: string) {
      if (value.edit && (!viewId || value.edit.viewId === viewId))
        emit({ edit: { ...value.edit, viewId: undefined }, menu: undefined });
      else if (value.menu && (!viewId || value.menu.viewId === viewId))
        emit({ menu: undefined });
    },
    cancelBoundary() {
      if (value.requestId || interactive?.pending) {
        emit({
          error:
            'The command outcome is unresolved. Reconcile before discarding its editor.',
        });
        return;
      }
      emit({ edit: undefined, menu: undefined, error: undefined });
    },
    boundaryPoint(longitude: number, latitude: number, index?: number) {
      const edit = value.edit;
      if (!edit?.viewId || value.requestId) return false;
      const vertices = edit.vertices.map((v) => [...v] as [string, string]);
      if (index != null && index >= 0 && index < vertices.length)
        vertices[index] = [String(longitude), String(latitude)];
      else {
        const last = vertices.at(-1),
          a = last
            ? metricVertex([Number(last[0]), Number(last[1])], frame)
            : undefined,
          b = metricVertex([longitude, latitude], frame);
        if (a && Math.hypot(a[0] - b[0], a[1] - b[1]) <= 0.001) return true;
        if (vertices.length >= 32) {
          emit({ error: 'At most 32 vertices are supported.' });
          return false;
        }
        vertices.push([String(longitude), String(latitude)]);
      }
      emit({ edit: { ...edit, vertices }, error: undefined });
      return true;
    },
    removeBoundaryVertex(index = value.edit?.selectedVertex) {
      const edit = value.edit;
      if (
        !edit ||
        index == null ||
        index < 0 ||
        index >= edit.vertices.length ||
        value.requestId ||
        (edit.originalId && edit.vertices.length <= 3)
      )
        return false;
      emit({
        edit: {
          ...edit,
          vertices: edit.vertices.filter((_, i) => i !== index),
          selectedVertex: undefined,
        },
      });
      return true;
    },
    applyBoundary() {
      const edit = value.edit;
      if (!edit || value.requestId) return false;
      try {
        if (edit.vertices.some((v) => v.some((s) => !s.trim())))
          throw Error('Enter longitude and latitude for every vertex.');
        const b: BoundaryDefinition = {
          id: edit.id,
          name: edit.name.trim(),
          type: edit.type,
          vertices: edit.vertices.map((v) => [
            Number(v[0]),
            Number(v[1]),
          ]) as BoundaryDefinition['vertices'],
        };
        validateBoundary(b, frame);
        if (
          !edit.originalId ||
          value.provisional.some((p) => p.id === edit.id)
        ) {
          emit({
            provisional: [...value.provisional.filter((p) => p.id !== b.id), b],
            edit: undefined,
            error: undefined,
            message:
              'Provisional geometry · choose a type to activate in this run.',
          });
          return true;
        }
        void submit(b, b.id);
        return true;
      } catch (e) {
        emit({ error: (e as Error).message });
        return false;
      }
    },
    setBoundaryType(id: string, type: BoundaryDefinition['type']) {
      const b = boundaries().find((b) => b.id === id);
      if (!b) return;
      if (type === 'untyped') {
        emit({
          error:
            'Use annotation-only to remove enforcement from an active boundary.',
        });
        return;
      }
      if (!value.provisional.some((p) => p.id === id) && !value.edit)
        value.expectedRevision = frame?.liveBoundaries?.revision ?? 0;
      void submit({ ...b, type }, id);
    },
    deleteBoundary(id: string) {
      if (value.requestId || interactive?.pending) return;
      if (value.provisional.some((p) => p.id === id)) {
        emit({
          provisional: value.provisional.filter((p) => p.id !== id),
          error: undefined,
        });
        return;
      }
      if (!value.edit)
        value.expectedRevision = frame?.liveBoundaries?.revision ?? 0;
      void submit(undefined, id);
    },
    boundaryContext(
      longitude: number,
      latitude: number,
      viewId: string,
      x: number,
      y: number,
    ) {
      if (value.visibleView !== viewId) return;
      emit({
        menu: {
          viewId,
          x,
          y,
          ids: boundaries()
            .filter((b) =>
              boundaryContains([longitude, latitude], b.vertices, frame),
            )
            .map((b) => b.id)
            .sort(),
        },
      });
    },
    closeBoundaryMenu: () => emit({ menu: undefined }),
    refreshRevision() {
      if (value.requestId || interactive?.pending) return;
      emit({
        expectedRevision: frame?.liveBoundaries?.revision ?? 0,
        error: undefined,
        message:
          'Editor rebased to the current boundary revision. Review geometry before Apply.',
      });
    },
  };
  return editor;
}
