import {
  buildActionEdits,
  draftWithActions,
  batchAnchor,
} from '../world/scriptAuthoring';
import { actionTime, scriptPlan } from '../world/scriptPlan';
import type {
  ScenarioContent,
  ScenarioRevision,
  ScenarioWrite,
  UnitPlacement,
  ScenarioReview,
  BoundaryDefinition,
  ScheduledAction,
} from '../contracts/generated';
import {
  validateBoundary,
  boundaryContains,
  metricVertex,
} from '../world/boundaryGeometry';
import type { Fetcher } from './api';
import {
  decodeScenarioList,
  decodeScenarioReceipt,
  decodeScenarioRevision,
  decodeScenarioWrite,
  decodeScenarioReview,
  MAX_SCENARIO_UNITS,
} from '../contracts/scenarios';
import { immutableCopy } from '../world/immutable';
import {
  legacyOrigin,
  originFor,
  locationGeometry,
  locationConflicts,
} from '../world/localGeometry';
import type { LocalGeometry } from '../contracts/generated';

export interface LocationEdit {
  longitude: string;
  latitude: string;
  viewId?: string;
}
export function locationPreview(draft: ScenarioContent, edit: LocationEdit) {
  if (!edit.longitude.trim() || !edit.latitude.trim())
    throw new Error('Enter both origin coordinates.');
  const geometry = locationGeometry(
    Number(edit.longitude),
    Number(edit.latitude),
  );
  return { geometry, conflicts: locationConflicts(draft, geometry) };
}

interface Pending {
  definitionId?: string;
  body: ScenarioWrite;
}
export interface ScenarioUnitEdit {
  id: string;
  label: string;
  commandRole: UnitPlacement['commandRole'];
  longitude: string;
  latitude: string;
  altitude: string;
  heading: string;
}
export function unitEditFields(unit: UnitPlacement): ScenarioUnitEdit {
  return {
    id: unit.id,
    label: unit.label,
    commandRole: unit.commandRole,
    longitude: String(unit.position.longitudeDeg),
    latitude: String(unit.position.latitudeDeg),
    altitude: String(unit.position.altitude.metres),
    heading: String(unit.headingTrueDeg),
  };
}
function readEdit(value: unknown, content: ScenarioContent): ScenarioUnitEdit {
  if (!value || typeof value !== 'object')
    throw new Error('Invalid saved editor.');
  const edit = value as ScenarioUnitEdit;
  const keys = [
    'id',
    'label',
    'commandRole',
    'longitude',
    'latitude',
    'altitude',
    'heading',
  ];
  if (
    Object.keys(edit).length !== keys.length ||
    !keys.every(
      (k) =>
        typeof Reflect.get(edit, k) === 'string' &&
        Reflect.get(edit, k).length <= 64,
    ) ||
    !['sentinel', 'observation'].includes(edit.commandRole) ||
    !content.units.some((u) => u.id === edit.id)
  )
    throw new Error('Invalid saved editor.');
  return { ...edit };
}
export interface BoundaryEdit {
  id: string;
  originalId?: string;
  name: string;
  type: BoundaryDefinition['type'];
  vertices: readonly (readonly string[])[];
  viewId?: string;
  selectedVertex?: number;
}
export interface ActionEdit {
  timingMode?: 'absolute' | 'after' | 'keep';
  predecessorId?: string;
  delaySeconds?: string;
  batch?: { id: string; unitId: string; originalId?: string }[];
  id: string;
  originalId?: string;
  unitId: string;
  seconds: string;
  longitude: string;
  latitude: string;
  ordinal: number;
  viewId?: string;
}
export interface ScenarioState {
  locationEdit?: LocationEdit;
  locationCamera?: {
    viewId: string;
    serial: number;
    geometry?: LocalGeometry | null;
  };
  actionEdit?: ActionEdit;
  selectedActionId?: string;
  selectedActionIds?: string[];
  planFilter?: 'all' | 'selected';
  planLabels?: 'all' | 'selected';
  boundaryEdit?: BoundaryEdit;
  boundaryMenu?: { ids: string[]; viewId: string; x: number; y: number };
  active: boolean;
  draft: ScenarioContent;
  saved?: ScenarioRevision;
  dirty: boolean;
  busy: boolean;
  blocked?: boolean;
  edit?: ScenarioUnitEdit;
  pending?: Pending;
  error?: string;
  message?: string;
  catalog: ScenarioRevision[];
  review?: ScenarioReview;
  reviewing: boolean;
  locate?: { id: string; viewId: string; serial: number };
  placement?: {
    profileId?: UnitPlacement['profileId'];
    category: UnitPlacement['category'];
    replaceId?: string;
    duplicateId?: string;
    viewId?: string;
  };
}
const key = 'sentinel.scenario.draft.v1';
const pendingKey = 'sentinel.scenario.pending.v1';
function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value && typeof value === 'object')
    return `{${Object.entries(value)
      .filter(([, v]) => v !== undefined)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([k, v]) => `${JSON.stringify(k)}:${canonical(v)}`)
      .join(',')}}`;
  return JSON.stringify(value);
}
function readBoundaryEdit(value: BoundaryEdit): BoundaryEdit {
  if (
    !value ||
    typeof value.id !== 'string' ||
    typeof value.name !== 'string' ||
    !['untyped', 'annotation', 'friendly', 'patrol', 'restricted'].includes(
      value.type,
    ) ||
    !Array.isArray(value.vertices) ||
    value.vertices.length > 32 ||
    value.vertices.some(
      (v) =>
        !Array.isArray(v) ||
        v.length !== 2 ||
        v.some((s) => typeof s !== 'string' || s.length > 64),
    )
  )
    throw new Error('Invalid recovered boundary edit.');
  return { ...value, viewId: undefined };
}
function readActionEdit(
  value: ActionEdit,
  content: ScenarioContent,
): ActionEdit {
  if (
    !value ||
    !['id', 'unitId', 'seconds', 'longitude', 'latitude'].every(
      (k) =>
        typeof Reflect.get(value, k) === 'string' &&
        Reflect.get(value, k).length <= 64,
    ) ||
    !Number.isInteger(value.ordinal) ||
    value.ordinal < 0 ||
    value.ordinal > 127 ||
    !content.units.some(
      (u) => u.id === value.unitId && u.category !== 'unknown',
    ) ||
    (value.originalId &&
      !content.actions?.some((a) => a.id === value.originalId)) ||
    (value.timingMode &&
      !['absolute', 'after', 'keep'].includes(value.timingMode)) ||
    (value.delaySeconds != null &&
      (typeof value.delaySeconds !== 'string' ||
        value.delaySeconds.length > 64)) ||
    (value.predecessorId != null &&
      (typeof value.predecessorId !== 'string' ||
        value.predecessorId.length > 64)) ||
    (value.batch &&
      (!Array.isArray(value.batch) ||
        value.batch.length < 1 ||
        value.batch.length > MAX_SCENARIO_UNITS ||
        new Set(value.batch.map((m) => m.id)).size !== value.batch.length ||
        new Set(value.batch.map((m) => m.unitId)).size !== value.batch.length ||
        value.batch.some(
          (m) =>
            typeof m.id !== 'string' ||
            m.id.length > 64 ||
            !content.units.some(
              (u) => u.id === m.unitId && u.category !== 'unknown',
            ) ||
            (m.originalId &&
              !content.actions?.some(
                (a) => a.id === m.originalId && a.unitId === m.unitId,
              )),
        )))
  )
    throw new Error('Invalid recovered action editor.');
  return { ...value, viewId: undefined };
}
/** Raw name entry may be empty between keystrokes; saved content may not. */
function readDraft(value: ScenarioContent): ScenarioContent {
  if (!value || typeof value.name !== 'string' || value.name.length > 80)
    throw new Error('Enter an arrangement name of at most 80 characters.');
  const content = decodeScenarioWrite({
    requestId: 'validate-draft',
    expectedRevision: 0,
    content: {
      ...value,
      name: value.name.trim() ? value.name : 'Untitled draft',
    },
  }).content;
  return { ...content, name: value.name };
}
// Python dispatch compares Unicode code points, independent of browser locale.
function compareActionIds(a: string, b: string) {
  const left = [...a],
    right = [...b];
  for (let i = 0; i < Math.min(left.length, right.length); i++) {
    const difference = left[i].codePointAt(0)! - right[i].codePointAt(0)!;
    if (difference) return difference;
  }
  return left.length - right.length;
}
export function orderedActions(actions: readonly ScheduledAction[]) {
  return [...actions].sort(
    (a, b) =>
      (a.offsetMs ?? Infinity) - (b.offsetMs ?? Infinity) ||
      a.ordinal - b.ordinal ||
      compareActionIds(a.id, b.id),
  );
}
export function createScenarioClient(options: {
  base: string;
  fetcher: Fetcher;
  publish: () => void;
  timeoutMs?: number;
  storage?: Storage;
}) {
  let storage: Storage | undefined;
  let disposed = false;
  let reviewGeneration = 0;
  let locateSerial = 0;
  let state: ScenarioState = {
    active: false,
    draft: {
      name: 'Untitled scenario',
      units: [],
      localGeometry: locationGeometry(
        legacyOrigin.longitudeDeg,
        legacyOrigin.latitudeDeg,
      ),
    },
    dirty: false,
    busy: false,
    catalog: [],
    reviewing: false,
  };
  try {
    storage = options.storage ?? globalThis.sessionStorage;
    const draft = storage?.getItem(key);
    if (draft) {
      const value = JSON.parse(draft) as {
        content: ScenarioContent;
        saved?: ScenarioRevision;
        edit?: ScenarioUnitEdit;
        boundaryEdit?: BoundaryEdit;
        actionEdit?: ActionEdit;
        locationEdit?: LocationEdit;
      };
      const content = readDraft(value.content);
      if (
        value.locationEdit &&
        ![value.locationEdit.longitude, value.locationEdit.latitude].every(
          (v) => typeof v === 'string' && v.length <= 64,
        )
      )
        throw new Error('Invalid recovered location edit.');
      const saved = value.saved
        ? decodeScenarioRevision(value.saved)
        : undefined;
      state = {
        ...state,
        draft: content,
        locationEdit: value.locationEdit
          ? {
              longitude: value.locationEdit.longitude,
              latitude: value.locationEdit.latitude,
            }
          : undefined,
        saved,
        dirty: !saved || canonical(content) !== canonical(saved.content),
        edit: value.edit ? readEdit(value.edit, content) : undefined,
        actionEdit: value.actionEdit
          ? readActionEdit(value.actionEdit, content)
          : undefined,
        boundaryEdit: value.boundaryEdit
          ? readBoundaryEdit(value.boundaryEdit)
          : undefined,
      };
    }
    const savedPending = storage?.getItem(pendingKey);
    if (savedPending) {
      const parsed = JSON.parse(savedPending) as Pending;
      state.pending = {
        definitionId: parsed.definitionId,
        body: decodeScenarioWrite(parsed.body),
      };
      state.active = true;
      state.error =
        'Save outcome unknown. Reconcile the saved request before editing.';
    }
  } catch {
    state.blocked = true;
    state.error =
      'Saved authoring data could not be read. Session storage is required.';
  }
  let snapshot = immutableCopy(state);
  function emit(update: Partial<ScenarioState>, persist = false) {
    if (
      'draft' in update ||
      'saved' in update ||
      'edit' in update ||
      'boundaryEdit' in update ||
      'actionEdit' in update ||
      'locationEdit' in update ||
      update.active === false ||
      update.placement
    ) {
      reviewGeneration++;
      update = {
        ...update,
        review: undefined,
        reviewing: false,
        locate: undefined,
      };
    }
    state = { ...state, ...update };
    if (persist) {
      try {
        storage?.setItem(
          key,
          JSON.stringify({
            content: state.draft,
            saved: state.saved,
            edit: state.edit,
            boundaryEdit: state.boundaryEdit,
            actionEdit: state.actionEdit,
            locationEdit: state.locationEdit,
          }),
        );
      } catch {
        state.error =
          'Draft could not be stored in this session. Save is unavailable until storage works.';
      }
    }
    snapshot = immutableCopy(state);
    if (!disposed) options.publish();
  }
  async function request(path: string, body?: unknown) {
    const controller = new AbortController();
    const timer = setTimeout(
      () => controller.abort(),
      options.timeoutMs ?? 10000,
    );
    try {
      const response = await options.fetcher(
        `${options.base}/scenarios${path}`,
        {
          method: body ? 'POST' : 'GET',
          headers: { 'Content-Type': 'application/json' },
          body: body ? JSON.stringify(body) : undefined,
          signal: controller.signal,
        },
      );
      const value: unknown = await response.json();
      if (!response.ok)
        throw Object.assign(
          new Error(
            (value as { message?: string }).message ??
              (response.status === 422
                ? 'Check the arrangement: labels, finite coordinates within the local area, altitude 0–5000 m and heading 0–360°.'
                : 'Scenario service unavailable.'),
          ),
          { status: response.status },
        );
      return value;
    } finally {
      clearTimeout(timer);
    }
  }
  async function refresh() {
    try {
      const value = decodeScenarioList(await request(''));
      if (!disposed) emit({ catalog: value.scenarios });
    } catch (error) {
      if (!disposed)
        emit({
          error:
            error instanceof Error ? error.message : 'Scenarios unavailable.',
        });
    }
  }
  async function send(pending: Pending, lookup: boolean) {
    emit({ busy: true, error: undefined, placement: undefined });
    try {
      const path = pending.definitionId
        ? `/${encodeURIComponent(pending.definitionId)}`
        : '';
      const value = decodeScenarioReceipt(
        await request(
          lookup
            ? `${path}/${pending.definitionId ? 'receipts' : 'creations'}?identity=${encodeURIComponent(pending.body.requestId)}`
            : `${path}${pending.definitionId ? '/revisions' : ''}`,
          lookup ? undefined : pending.body,
        ),
      );
      if (
        value.requestId !== pending.body.requestId ||
        value.accepted !== (value.code === 'OK' && !!value.result)
      )
        throw new Error('Scenario receipt mismatch.');
      if (
        value.result &&
        (canonical(value.result.content) !== canonical(pending.body.content) ||
          value.result.revision !== pending.body.expectedRevision + 1 ||
          (pending.definitionId &&
            value.result.definitionId !== pending.definitionId))
      )
        throw new Error('Scenario revision mismatch.');
      if (disposed) return;
      // Retain the exact pending identity until the accepted revision is durable
      // locally. A quota/security failure here must remain reconcilable on reload.
      storage!.setItem(
        key,
        JSON.stringify({
          content: value.result?.content ?? state.draft,
          saved: value.result ?? state.saved,
        }),
      );
      storage!.removeItem(pendingKey);
      emit({
        pending: undefined,
        saved: value.result ?? state.saved,
        draft: value.result?.content ?? state.draft,
        dirty: !value.accepted,
        error: value.accepted ? undefined : value.message,
        message: value.accepted
          ? `Revision ${value.result!.revision} saved`
          : undefined,
      });
      await refresh();
    } catch (error) {
      const status = (error as { status?: number }).status;
      if (status === 422 || status === 400) {
        storage!.removeItem(pendingKey);
        if (!disposed)
          emit({
            pending: undefined,
            error:
              error instanceof Error ? error.message : 'Invalid arrangement.',
          });
      } else if (!disposed)
        emit({
          error:
            status === 403
              ? 'Demo mode is disabled on this backend. Enable SENTINEL_DEMO=1 and retry this same saved request; your draft is retained.'
              : status === 404
                ? 'No saved receipt yet. Retry the same saved request.'
                : 'Save outcome unknown. Reconcile or retry the exact saved request.',
        });
    } finally {
      if (!disposed) emit({ busy: false });
    }
  }
  return {
    get: () => snapshot,
    beginLocation(viewId?: string) {
      if (
        !state.active ||
        state.edit ||
        state.boundaryEdit ||
        state.actionEdit ||
        state.pending ||
        state.busy ||
        state.blocked
      )
        return false;
      const origin = originFor(state.draft);
      emit(
        {
          locationEdit: {
            longitude:
              state.locationEdit?.longitude ?? String(origin.longitudeDeg),
            latitude:
              state.locationEdit?.latitude ?? String(origin.latitudeDeg),
            viewId,
          },
          placement: undefined,
          boundaryMenu: undefined,
          error: undefined,
        },
        true,
      );
      return true;
    },
    editLocation(
      update: Partial<Pick<LocationEdit, 'longitude' | 'latitude'>>,
    ) {
      if (state.locationEdit && !state.pending && !state.busy)
        emit(
          {
            locationEdit: {
              ...state.locationEdit,
              ...update,
              viewId: undefined,
            },
            error: undefined,
          },
          true,
        );
    },
    pickLocation(longitude: number, latitude: number, viewId: string) {
      if (
        !state.active ||
        state.locationEdit?.viewId !== viewId ||
        state.pending ||
        state.busy
      )
        return false;
      emit(
        {
          locationEdit: {
            longitude: String(longitude),
            latitude: String(latitude),
          },
          error: undefined,
        },
        true,
      );
      return true;
    },
    disarmLocation(viewId?: string) {
      if (
        state.locationEdit &&
        (!viewId || state.locationEdit.viewId === viewId)
      )
        emit(
          { locationEdit: { ...state.locationEdit, viewId: undefined } },
          true,
        );
    },
    cancelLocation() {
      if (!state.pending && !state.busy)
        emit({ locationEdit: undefined, error: undefined }, true);
    },
    applyLocation() {
      if (
        !state.active ||
        !state.locationEdit ||
        state.pending ||
        state.busy ||
        state.blocked
      )
        return false;
      try {
        const { geometry, conflicts } = locationPreview(
          state.draft,
          state.locationEdit,
        );
        if (conflicts.length)
          throw new Error(
            `Origin cannot be applied: ${conflicts.join('; ')} fall outside the proposed square. Existing content is unchanged.`,
          );
        const draft = readDraft({ ...state.draft, localGeometry: geometry });
        emit(
          {
            draft,
            dirty: true,
            locationEdit: undefined,
            error: undefined,
            message:
              'Scenario origin changed. Geographic positions and heights are unchanged. Save a new revision.',
          },
          true,
        );
        return true;
      } catch (error) {
        emit({ error: (error as Error).message });
        return false;
      }
    },
    showLocationArea(viewId: string) {
      if (!state.active) return;
      try {
        const geometry = state.locationEdit
          ? locationPreview(state.draft, state.locationEdit).geometry
          : state.draft.localGeometry;
        emit({ locationCamera: { viewId, serial: ++locateSerial, geometry } });
      } catch (error) {
        emit({ error: (error as Error).message });
      }
    },
    completeLocationCamera(serial: number) {
      if (state.locationCamera?.serial === serial)
        emit({ locationCamera: undefined });
    },
    report: (error: string) => emit({ error }),
    locate(id: string, viewId: string) {
      if (state.active && state.draft.units.some((u) => u.id === id))
        emit({ locate: { id, viewId, serial: ++locateSerial } });
    },
    completeLocate(serial: number) {
      // Pane components can be recreated while the session and camera survive.
      // Consume the presentation action in the shared owner, once applied.
      if (state.locate?.serial === serial) emit({ locate: undefined });
    },
    editUnit(edit: ScenarioUnitEdit) {
      if (
        !state.active ||
        state.locationEdit ||
        state.actionEdit ||
        state.boundaryEdit ||
        state.blocked ||
        state.pending ||
        state.busy ||
        (state.edit && state.edit.id !== edit.id)
      )
        return;
      emit(
        {
          edit: readEdit(edit, state.draft),
          placement: undefined,
          selectedActionId: undefined,
          selectedActionIds: [],
          error: undefined,
          message: undefined,
        },
        true,
      );
    },
    discardEdit() {
      if (!state.pending && !state.busy)
        emit({ edit: undefined, error: undefined }, true);
    },
    applyEdit() {
      if (
        !state.edit ||
        state.actionEdit ||
        state.boundaryEdit ||
        state.blocked ||
        state.pending ||
        state.busy
      )
        return;
      const edit = state.edit;
      try {
        if (
          ![edit.longitude, edit.latitude, edit.altitude, edit.heading].every(
            (v) => v.trim() && Number.isFinite(Number(v)),
          )
        )
          throw new Error('Enter finite coordinates, height and heading.');
        const draft = structuredClone(state.draft);
        draft.units = draft.units.map((u) =>
          u.id !== edit.id
            ? u
            : {
                ...u,
                label: edit.label.trim(),
                commandRole: edit.commandRole,
                position: {
                  longitudeDeg: Number(edit.longitude),
                  latitudeDeg: Number(edit.latitude),
                  altitude: {
                    metres: Number(edit.altitude),
                    reference: 'ELLIPSOID',
                    datumId: 'WGS84',
                  },
                },
                headingTrueDeg: Number(edit.heading),
              },
        );
        readDraft(draft);
        emit(
          {
            draft,
            dirty: true,
            edit: undefined,
            error: undefined,
            message: undefined,
          },
          true,
        );
      } catch {
        emit({
          error:
            'Check selected unit edits: label required, coordinates within ±5 km east/west and north/south, height 0–5000 m and heading 0–359.999°. Only friendly drones may have Sentinel control.',
        });
      }
    },
    enter: () => {
      emit({ active: true });
      void refresh();
    },
    leave: () =>
      emit(
        {
          active: false,
          locationEdit: state.locationEdit
            ? { ...state.locationEdit, viewId: undefined }
            : undefined,
          locationCamera: undefined,
          actionEdit: state.actionEdit
            ? { ...state.actionEdit, viewId: undefined }
            : undefined,
          placement: undefined,
          boundaryMenu: undefined,
          boundaryEdit: state.boundaryEdit
            ? { ...state.boundaryEdit, viewId: undefined }
            : undefined,
        },
        true,
      ),
    newDraft() {
      if (
        !state.locationEdit &&
        !state.edit &&
        !state.actionEdit &&
        !state.boundaryEdit &&
        !state.blocked &&
        !state.pending &&
        !state.busy
      )
        emit(
          {
            active: true,
            draft: {
              name: 'Untitled scenario',
              units: [],
              localGeometry: locationGeometry(
                legacyOrigin.longitudeDeg,
                legacyOrigin.latitudeDeg,
              ),
            },
            saved: undefined,
            dirty: true,
            placement: undefined,
            selectedActionId: undefined,
            selectedActionIds: [],
            error: undefined,
            message: undefined,
          },
          true,
        );
    },
    update(draft: ScenarioContent) {
      if (
        state.active &&
        !state.locationEdit &&
        !state.edit &&
        !state.actionEdit &&
        !state.boundaryEdit &&
        !state.blocked &&
        !state.pending &&
        !state.busy
      ) {
        try {
          readDraft(draft);
          emit(
            { draft, dirty: true, message: undefined, error: undefined },
            true,
          );
        } catch (error) {
          emit({
            error:
              error instanceof Error
                ? error.message
                : 'Invalid arrangement. Remove referencing actions in Conductor before deleting this unit.',
          });
        }
      }
    },
    arm(placement?: ScenarioState['placement']) {
      if (
        !placement ||
        (!state.locationEdit &&
          !state.edit &&
          !state.actionEdit &&
          !state.boundaryEdit &&
          !state.blocked &&
          !state.pending &&
          !state.busy)
      )
        emit({
          placement,
          error: placement || state.placement ? undefined : state.error,
        });
    },
    async load(id: string) {
      if (
        state.locationEdit ||
        state.edit ||
        state.actionEdit ||
        state.boundaryEdit ||
        state.blocked ||
        state.pending ||
        state.busy
      )
        return;
      emit({ busy: true, placement: undefined });
      try {
        const saved = decodeScenarioRevision(
          await request(`/${encodeURIComponent(id)}`),
        );
        if (!disposed)
          emit(
            {
              saved,
              draft: saved.content,
              dirty: false,
              selectedActionId: undefined,
              selectedActionIds: [],
              error: undefined,
              message: `Loaded revision ${saved.revision}`,
            },
            true,
          );
      } catch (error) {
        if (!disposed)
          emit({
            error: error instanceof Error ? error.message : 'Load failed.',
          });
      } finally {
        if (!disposed) emit({ busy: false });
      }
    },
    async save(asNew = false) {
      if (
        state.locationEdit ||
        state.edit ||
        state.actionEdit ||
        state.boundaryEdit ||
        state.blocked ||
        state.pending ||
        state.busy
      )
        return;
      try {
        if (!storage) throw new Error('Session storage unavailable.');
        if (!state.draft.name.trim())
          throw new Error('Enter an arrangement name before saving.');
        const content = structuredClone(state.draft);
        if (asNew && content.boundaries)
          content.boundaries = content.boundaries.map((b) => ({
            ...b,
            id: crypto.randomUUID(),
          })) as ScenarioContent['boundaries'];
        if (asNew) {
          const mapping = new Map(
            content.units.map((u) => [u.id, crypto.randomUUID()]),
          );
          content.units = content.units.map((u) => ({
            ...u,
            id: mapping.get(u.id)!,
          }));
          if (content.actions) {
            const actionIds = new Map(
              content.actions.map((a) => [a.id, crypto.randomUUID()]),
            );
            content.actions = content.actions.map((a) => ({
              ...a,
              id: actionIds.get(a.id)!,
              unitId: mapping.get(a.unitId)!,
              ...(a.afterActionId
                ? { afterActionId: actionIds.get(a.afterActionId)! }
                : {}),
            }));
          }
        }
        const pending: Pending = {
          definitionId: asNew ? undefined : state.saved?.definitionId,
          body: {
            requestId: crypto.randomUUID(),
            expectedRevision: asNew ? 0 : (state.saved?.revision ?? 0),
            content,
          },
        };
        decodeScenarioWrite(pending.body);
        storage.setItem(pendingKey, JSON.stringify(pending));
        emit({ pending });
        await send(pending, false);
      } catch (error) {
        emit({
          error:
            error instanceof Error
              ? error.message
              : 'Cannot save this arrangement.',
        });
      }
    },
    reconcile: async (retry = false) => {
      if (state.pending && !state.busy) await send(state.pending, !retry);
    },
    async validate() {
      if (
        !state.active ||
        !state.saved ||
        state.dirty ||
        state.locationEdit ||
        state.edit ||
        state.actionEdit ||
        state.boundaryEdit ||
        state.pending ||
        state.busy ||
        state.blocked ||
        state.reviewing ||
        state.placement
      )
        return;
      const { definitionId, revision, contentHash } = state.saved;
      const reference = { definitionId, revision, contentHash };
      const generation = ++reviewGeneration;
      emit({ reviewing: true, review: undefined, error: undefined });
      try {
        const review = decodeScenarioReview(
          await request('/validate', reference),
        );
        if (canonical(review.reference) !== canonical(reference))
          throw new Error('Review does not match this saved revision.');
        if (!disposed && generation === reviewGeneration) emit({ review });
      } catch (error) {
        if (!disposed && generation === reviewGeneration)
          emit({
            error:
              error instanceof Error
                ? error.message
                : 'Validation unavailable. Try again.',
          });
      } finally {
        if (!disposed && generation === reviewGeneration)
          emit({ reviewing: false });
      }
    },
    setPlanPresentation(
      update: Pick<ScenarioState, 'planFilter' | 'planLabels'>,
    ) {
      emit(update);
    },
    selectAction(id?: string, additive = false) {
      if (
        !state.actionEdit &&
        (!state.active || !id || state.draft.actions?.some((a) => a.id === id))
      )
        emit({
          selectedActionId: id,
          selectedActionIds: id
            ? additive
              ? (state.selectedActionIds ?? []).includes(id)
                ? (state.selectedActionIds ?? []).filter((x) => x !== id)
                : [...(state.selectedActionIds ?? []), id]
              : [id]
            : [],
        });
    },
    beginAction(id?: string, duplicate = false) {
      if (
        !state.active ||
        state.locationEdit ||
        state.edit ||
        state.boundaryEdit ||
        state.actionEdit ||
        state.pending ||
        state.busy ||
        state.blocked
      )
        return;
      const source = state.draft.actions?.find((a) => a.id === id);
      if ((!source || duplicate) && (state.draft.actions?.length ?? 0) >= 128) {
        emit({ error: 'At most 128 actions are supported.' });
        return;
      }
      const unit =
        state.draft.units.find((u) => u.id === source?.unitId) ??
        state.draft.units.find((u) => u.category !== 'unknown');
      if (!unit) {
        emit({
          error:
            'Place a friendly or hostile actor in Units first. Unknown entities remain stationary.',
        });
        return;
      }
      const identity = source && !duplicate ? source.id : crypto.randomUUID();
      emit(
        {
          placement: undefined,
          boundaryMenu: undefined,
          error: undefined,
          review: undefined,
          selectedActionId: source?.id,
          actionEdit: {
            id: identity,
            originalId: source && !duplicate ? source.id : undefined,
            unitId: unit.id,
            timingMode: source?.afterActionId ? 'after' : 'absolute',
            predecessorId: source?.afterActionId ?? undefined,
            delaySeconds: String((source?.delayMs ?? 0) / 1000),
            seconds: String(
              (source?.offsetMs ?? 0) / 1000 + (duplicate ? 0.2 : 0),
            ),
            longitude: String(
              source?.destination.longitudeDeg ?? unit.position.longitudeDeg,
            ),
            latitude: String(
              source?.destination.latitudeDeg ?? unit.position.latitudeDeg,
            ),
            ordinal:
              source && !duplicate
                ? source.ordinal
                : Math.min(127, state.draft.actions?.length ?? 0),
          },
        },
        true,
      );
    },
    beginBatch(unitIds: string[], actionIds: string[] = []) {
      if (
        !state.active ||
        state.locationEdit ||
        state.edit ||
        state.boundaryEdit ||
        state.actionEdit ||
        state.pending ||
        state.busy ||
        state.blocked
      )
        return;
      const units = [...new Set(unitIds)].map((id) =>
        state.draft.units.find((u) => u.id === id),
      );
      if (
        !units.length ||
        units.some((u) => !u || u.category === 'unknown') ||
        new Set(units.map((u) => u?.category)).size !== 1
      ) {
        emit({
          error:
            'Select friendly or hostile actors from one category. Unknown entities cannot be scripted.',
        });
        return;
      }
      const sources = (state.draft.actions ?? []).filter((a) =>
        actionIds.includes(a.id),
      );
      if (
        sources.length &&
        new Set(sources.map((a) => a.unitId)).size !== sources.length
      ) {
        emit({
          error:
            'Batch edits support one selected action per actor. Revise the selection.',
        });
        return;
      }
      if (
        (state.draft.actions?.length ?? 0) +
          (sources.length ? 0 : units.length) >
        128
      ) {
        emit({
          error:
            'This complete batch would exceed 128 actions. No actions were added.',
        });
        return;
      }
      const batch = units.map((u) => {
        const a = sources.find((a) => a.unitId === u!.id);
        return {
          id: a?.id ?? crypto.randomUUID(),
          unitId: u!.id,
          originalId: a?.id,
        };
      });
      emit(
        {
          actionEdit: {
            ...batch[0],
            batch,
            timingMode: sources.length ? 'keep' : 'absolute',
            seconds: '0',
            delaySeconds: '0',
            ordinal: Math.min(127, state.draft.actions?.length ?? 0),
            ...batchAnchor(state.draft, unitIds, actionIds),
          },
          placement: undefined,
          boundaryMenu: undefined,
          error: undefined,
        },
        true,
      );
    },
    editAction(update: Partial<ActionEdit>) {
      if (state.actionEdit && !state.pending && !state.busy)
        emit(
          { actionEdit: { ...state.actionEdit, ...update }, error: undefined },
          true,
        );
    },
    snapActionTime() {
      const edit = state.actionEdit;
      const field = edit?.timingMode === 'after' ? 'delaySeconds' : 'seconds';
      if (!edit || !(edit[field] ?? '').trim()) return;
      const seconds = Number(edit[field]);
      if (Number.isFinite(seconds) && seconds >= 0 && seconds <= 600)
        emit(
          {
            actionEdit: {
              ...edit,
              [field]: String(Math.round(seconds * 5) / 5),
            },
          },
          true,
        );
    },
    armAction(viewId?: string) {
      if (state.actionEdit && state.active && !state.pending && !state.busy)
        emit(
          {
            actionEdit: { ...state.actionEdit, viewId },
            placement: undefined,
            boundaryMenu: undefined,
          },
          true,
        );
    },
    disarmAction(viewId?: string) {
      if (state.actionEdit && (!viewId || state.actionEdit.viewId === viewId))
        emit({ actionEdit: { ...state.actionEdit, viewId: undefined } }, true);
    },
    actionDestination(longitude: number, latitude: number, viewId: string) {
      if (
        !state.actionEdit ||
        state.actionEdit.viewId !== viewId ||
        !state.active ||
        state.pending ||
        state.busy
      )
        return false;
      emit(
        {
          actionEdit: {
            ...state.actionEdit,
            longitude: String(longitude),
            latitude: String(latitude),
            viewId: undefined,
          },
          error: undefined,
        },
        true,
      );
      return true;
    },
    cancelAction() {
      if (!state.pending && !state.busy)
        emit({ actionEdit: undefined, error: undefined }, true);
    },
    applyAction() {
      const edit = state.actionEdit;
      if (!edit || state.pending || state.busy || state.blocked) return false;
      try {
        const proposed = draftWithActions(state.draft, edit);
        const draft = readDraft(proposed);
        const edited = buildActionEdits(state.draft, edit);
        const action = edited[0];
        if (edit.batch) {
          const failures = scriptPlan(draft).filter((l) =>
            ['Failed', 'Skipped', 'Pending'].includes(l.state),
          );
          if (failures.length)
            throw new Error(
              failures
                .map(
                  (l) =>
                    `${draft.units.find((u) => u.id === l.action.unitId)?.label}: ${l.reason ?? 'Unresolved movement'}`,
                )
                .join(' '),
            );
        }
        emit(
          {
            draft,
            dirty: true,
            actionEdit: undefined,
            selectedActionId: action.id,
            selectedActionIds: edited.map((a) => a.id),
            error: undefined,
            message: `${edited.length > 1 ? `${edited.length} actions applied together` : `Action applied: ${actionTime(action)}`}. Save the new revision.`,
          },
          true,
        );
        return true;
      } catch (error) {
        emit({
          error: error instanceof Error ? error.message : 'Invalid action.',
        });
        return false;
      }
    },
    deleteAction(id: string) {
      if (
        state.actionEdit ||
        state.locationEdit ||
        state.edit ||
        state.boundaryEdit ||
        state.pending ||
        state.busy ||
        state.blocked ||
        !state.active
      )
        return;
      if (state.draft.actions?.some((a) => a.afterActionId === id)) {
        emit({
          error:
            'Change or delete the dependent movement before deleting its predecessor.',
        });
        return;
      }
      emit(
        {
          draft: {
            ...state.draft,
            actions: (state.draft.actions ?? []).filter((a) => a.id !== id),
            scheduleRuleVersion:
              state.draft.scheduleRuleVersion ?? 'local-schedule-v1',
          },
          dirty: true,
          selectedActionId: undefined,
          error: undefined,
        },
        true,
      );
    },
    reorderAction(id: string, direction: -1 | 1) {
      if (
        state.actionEdit ||
        state.locationEdit ||
        state.edit ||
        state.boundaryEdit ||
        state.pending ||
        state.busy ||
        state.blocked ||
        !state.active
      )
        return;
      const actions = orderedActions(state.draft.actions ?? []),
        i = actions.findIndex((a) => a.id === id),
        next = actions[i + direction];
      if (
        i < 0 ||
        !next ||
        actions[i].offsetMs == null ||
        next.offsetMs !== actions[i].offsetMs
      )
        return;
      [actions[i], actions[i + direction]] = [
        actions[i + direction],
        actions[i],
      ];
      emit(
        {
          draft: {
            ...state.draft,
            actions: actions.map((a, ordinal) => ({ ...a, ordinal })),
            scheduleRuleVersion:
              state.draft.scheduleRuleVersion ?? 'local-schedule-v1',
          },
          dirty: true,
          error: undefined,
        },
        true,
      );
    },
    beginBoundary(viewId: string, id?: string) {
      if (
        !state.active ||
        state.locationEdit ||
        state.edit ||
        state.pending ||
        state.busy ||
        state.blocked ||
        state.boundaryEdit ||
        state.actionEdit
      )
        return;
      const source = state.draft.boundaries?.find((b) => b.id === id);
      if (!source && (state.draft.boundaries?.length ?? 0) >= 16) {
        emit({ error: 'At most 16 boundaries are supported.' });
        return;
      }
      emit(
        {
          placement: undefined,
          boundaryMenu: undefined,
          error: undefined,
          boundaryEdit: {
            id: source?.id ?? crypto.randomUUID(),
            originalId: source?.id,
            name:
              source?.name ??
              `Boundary ${(state.draft.boundaries?.length ?? 0) + 1}`,
            type: source?.type ?? 'untyped',
            vertices:
              source?.vertices.map((v) => [String(v[0]), String(v[1])]) ?? [],
            viewId,
          },
        },
        true,
      );
    },
    editBoundary(update: Partial<BoundaryEdit>) {
      if (state.boundaryEdit && !state.pending && !state.busy)
        emit(
          {
            boundaryEdit: { ...state.boundaryEdit, ...update },
            error: undefined,
          },
          true,
        );
    },
    disarmBoundary(viewId?: string) {
      if (
        state.boundaryEdit &&
        (!viewId || state.boundaryEdit.viewId === viewId)
      )
        emit(
          {
            boundaryEdit: { ...state.boundaryEdit, viewId: undefined },
            boundaryMenu: undefined,
          },
          true,
        );
      else if (
        state.boundaryMenu &&
        (!viewId || state.boundaryMenu.viewId === viewId)
      )
        emit({ boundaryMenu: undefined });
    },
    cancelBoundary() {
      emit(
        { boundaryEdit: undefined, boundaryMenu: undefined, error: undefined },
        true,
      );
    },
    boundaryPoint(longitude: number, latitude: number, index?: number) {
      const edit = state.boundaryEdit;
      if (!edit || !edit.viewId || state.pending || state.busy) return false;
      const vertices = edit.vertices.map((v) => [...v] as [string, string]);
      const value: [string, string] = [String(longitude), String(latitude)];
      if (index !== undefined && index >= 0 && index < vertices.length)
        vertices[index] = value;
      else {
        const last = vertices.at(-1),
          a =
            last &&
            metricVertex([Number(last[0]), Number(last[1])], state.draft),
          b = metricVertex([longitude, latitude], state.draft);
        if (a && Math.hypot(a[0] - b[0], a[1] - b[1]) <= 0.001) return true;
        if (vertices.length >= 32) {
          emit({ error: 'At most 32 vertices are supported.' });
          return false;
        }
        vertices.push(value);
      }
      emit({ boundaryEdit: { ...edit, vertices }, error: undefined }, true);
      return true;
    },
    removeBoundaryVertex(index = state.boundaryEdit?.selectedVertex) {
      const edit = state.boundaryEdit;
      if (
        !state.active ||
        !edit ||
        state.pending ||
        state.busy ||
        index === undefined ||
        !Number.isInteger(index) ||
        index < 0 ||
        index >= edit.vertices.length ||
        (edit.originalId && edit.vertices.length <= 3)
      )
        return false;
      const vertices = edit.vertices.filter((_, i) => i !== index);
      emit(
        {
          boundaryEdit: {
            ...edit,
            vertices,
            selectedVertex: vertices.length
              ? Math.min(index, vertices.length - 1)
              : undefined,
          },
          error: undefined,
        },
        true,
      );
      return true;
    },
    applyBoundary() {
      const edit = state.boundaryEdit;
      if (!edit || state.pending || state.busy) return false;
      try {
        if (edit.vertices.some((v) => v.some((s) => !s.trim())))
          throw new Error('Enter longitude and latitude for every vertex.');
        const boundary: BoundaryDefinition = {
          id: edit.id,
          name: edit.name.trim(),
          type: edit.type,
          vertices: edit.vertices.map((v) => [
            Number(v[0]),
            Number(v[1]),
          ]) as BoundaryDefinition['vertices'],
        };
        validateBoundary(boundary, state.draft);
        const boundaries = [...(state.draft.boundaries ?? [])];
        const index = boundaries.findIndex((b) => b.id === edit.originalId);
        if (index >= 0) boundaries[index] = boundary;
        else boundaries.push(boundary);
        const draft = {
          ...state.draft,
          boundaries,
          boundaryRuleVersion: 'local-boundary-v1',
        } as ScenarioContent;
        readDraft(draft);
        emit(
          {
            draft,
            dirty: true,
            boundaryEdit: undefined,
            boundaryMenu: undefined,
            error: undefined,
            message: 'Boundary applied to draft.',
          },
          true,
        );
        return true;
      } catch (error) {
        emit({
          error:
            error instanceof Error ? error.message : 'Check boundary geometry.',
        });
        return false;
      }
    },
    setBoundaryType(id: string, type: BoundaryDefinition['type']) {
      if (
        state.locationEdit ||
        state.edit ||
        state.actionEdit ||
        state.boundaryEdit ||
        state.pending ||
        state.busy ||
        state.blocked
      )
        return;
      const boundaries = structuredClone(state.draft.boundaries ?? []),
        boundary = boundaries.find((b) => b.id === id);
      if (!boundary) return;
      try {
        boundary.type = type;
        validateBoundary(boundary, state.draft);
        emit(
          {
            draft: {
              ...state.draft,
              boundaries,
              boundaryRuleVersion: 'local-boundary-v1',
            } as ScenarioContent,
            dirty: true,
            boundaryMenu: undefined,
            error: undefined,
          },
          true,
        );
      } catch (error) {
        emit({
          error:
            error instanceof Error ? error.message : 'Invalid boundary type.',
        });
      }
    },
    deleteBoundary(id: string) {
      if (
        state.locationEdit ||
        state.edit ||
        state.actionEdit ||
        state.boundaryEdit ||
        state.pending ||
        state.busy ||
        state.blocked
      )
        return;
      emit(
        {
          draft: {
            ...state.draft,
            boundaries: (state.draft.boundaries ?? []).filter(
              (b) => b.id !== id,
            ),
            boundaryRuleVersion: 'local-boundary-v1',
          } as ScenarioContent,
          dirty: true,
          boundaryMenu: undefined,
          error: undefined,
        },
        true,
      );
    },
    boundaryContext(
      longitude: number,
      latitude: number,
      viewId: string,
      x: number,
      y: number,
    ) {
      if (!state.active) return;
      if (state.actionEdit) {
        emit({ actionEdit: { ...state.actionEdit, viewId: undefined } }, true);
        return;
      }
      if (state.placement) {
        emit({ placement: undefined });
        return;
      }
      const ids = (state.draft.boundaries ?? [])
        .filter((b) =>
          boundaryContains([longitude, latitude], b.vertices, state.draft),
        )
        .map((b) => b.id)
        .sort();
      emit({ boundaryMenu: { ids, viewId, x, y } });
    },
    closeBoundaryMenu: () => emit({ boundaryMenu: undefined }),
    refresh,
    dispose: () => {
      disposed = true;
    },
  };
}
