import { useMemo, useRef, useState } from 'react';
import {
  flexRender,
  getCoreRowModel,
  getSortedRowModel,
  useReactTable,
  type ColumnDef,
  type SortingState,
} from '@tanstack/react-table';
import { ArrowDown, ArrowUp, Search, X } from 'lucide-react';
import {
  useOperationalRuntime,
  useOperationalSnapshot,
} from '../../app/OperationalContext';
import { entityRows, type EntityRow } from '../../world/entityRows';
import type { WorkspaceBridge } from '../workspace/workspaceBridge';
import { EntityFilters, filtersActive } from './EntityFilters';
import { selectForDetails } from './selectionActions';
import { formatSgt } from '../../world/time';
import { altitudeText, observationText, speedText } from './values';
import './entities.css';
import { MovementToolbar } from '../movement/MovementPane';

const columns: ColumnDef<EntityRow>[] = [
  {
    id: 'identifier',
    header: 'Identifier',
    accessorFn: (r) => r.entity.label || 'Unnamed entity',
    cell: ({ row }) => (
      <span className="entity-value" title={row.original.entity.id}>
        {row.original.entity.label || 'Unnamed entity'}
      </span>
    ),
  },
  {
    id: 'affiliation',
    header: 'Affiliation',
    accessorFn: (r) => r.entity.affiliation,
    cell: ({ getValue }) => String(getValue()).toUpperCase(),
  },
  {
    id: 'classification',
    header: 'Classification',
    accessorFn: (r) =>
      r.entity.classification?.label ?? r.entity.classification?.code,
    cell: ({ getValue }) => getValue<string>() ?? 'Unknown',
    sortUndefined: 'last',
  },
  { id: 'observation', header: 'Observation', accessorFn: observationText },
  {
    id: 'altitude',
    header: 'Altitude / ref',
    accessorFn: (r) => r.track?.latest.position.altitude.metres,
    // Different vertical references are not directly comparable measurements.
    sortingFn: (a, b) => {
      const left = a.original.track?.latest.position.altitude;
      const right = b.original.track?.latest.position.altitude;
      if (!left || !right) return 0;
      const group = (v: typeof left) => `${v.reference}/${v.datumId ?? ''}`;
      return (
        group(left).localeCompare(group(right)) || left.metres - right.metres
      );
    },
    cell: ({ row }) => altitudeText(row.original),
    sortUndefined: 'last',
  },
  {
    id: 'speed',
    header: 'Speed',
    accessorFn: (r) => r.track?.latest.velocity?.speedMps,
    cell: ({ row }) => speedText(row.original),
    sortUndefined: 'last',
  },
  {
    id: 'observed',
    header: 'Observed / SGT',
    accessorFn: (r) => r.track?.latest.timestamp,
    cell: ({ getValue }) => (
      <time
        className="entity-value"
        dateTime={getValue<string>()}
        title={getValue<string>()}
      >
        {formatSgt(getValue<string>(), { date: true })}
      </time>
    ),
    sortUndefined: 'last',
  },
];

export function TracksBrowser({ bridge }: { bridge: WorkspaceBridge }) {
  const runtime = useOperationalRuntime()!;
  const state = useOperationalSnapshot(runtime);
  const frame = state.presentation.frame;
  const rows = useMemo(
    () => (frame ? entityRows(frame, state.session.filters) : []),
    [frame, state.session.filters],
  );
  const scoped = rows;
  const data = useMemo(() => rows.filter((r) => r.visible), [rows]);
  const [sorting, setSorting] = useState<SortingState>([
    { id: 'identifier', desc: false },
  ]);
  const [focused, setFocused] = useState<string>();
  const body = useRef<HTMLTableSectionElement>(null);
  const selected = state.session.selection.primary?.id;
  const selectedIds = new Set(state.session.selection.items.map((i) => i.id));
  const table = useReactTable({
    data,
    columns,
    getRowId: (r) => r.entity.id,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    state: {
      sorting,
      rowSelection: Object.fromEntries(
        [...selectedIds].map((id) => [id, true]),
      ),
    },
    onSortingChange: setSorting,
    enableMultiRowSelection: true,
  });
  const ordered = table.getRowModel().rows;
  const focusId = ordered.some((r) => r.id === focused)
    ? focused
    : (ordered.find((r) => r.id === selected)?.id ?? ordered[0]?.id);
  const filtered = filtersActive(state.session.filters);
  return (
    <div
      className="tracks-browser"
      data-frame-id={frame?.frameId}
      data-selection={selected}
    >
      <div className="entity-toolbar">
        <strong className="quiet-label">All entities</strong>
        <button
          className="text-control"
          onClick={() => bridge.setSidebar('fleet')}
        >
          Open Fleet sidebar
        </button>
        <label className="entity-search">
          <Search size={14} />
          <input
            type="search"
            aria-label="Search entities in all views"
            placeholder="Find identifier, class or source"
            value={state.session.filters.search ?? ''}
            onChange={(e) => runtime.setFilters({ search: e.target.value })}
          />
        </label>
        <EntityFilters runtime={runtime} state={state} />
        {filtered && (
          <button
            className="text-control"
            aria-label="Reset all filters"
            onClick={() => runtime.resetFilters()}
          >
            <X size={12} />
            Reset
          </button>
        )}
      </div>
      <div className="entity-scope" role="status">
        <span>
          <b data-field="filtered-entities">{data.length}</b> /{' '}
          <b data-field="total-entities">{scoped.length}</b> entities
          {filtered ? ' · filtered' : ''}
        </span>
        <span>
          {data.filter((r) => r.track).length} positioned ·{' '}
          {data.filter((r) => !r.track).length} without position
        </span>
        <span>
          {Object.keys(frame?.tracks ?? {}).length} source tracks total
        </span>
        {state.presentation.status === 'stale' && (
          <span className="constraint-tag">STALE FRAME</span>
        )}
      </div>
      <MovementToolbar state={state} runtime={runtime} bridge={bridge} />
      {!frame ? (
        <div className="entity-empty">Load a mission to browse entities.</div>
      ) : (
        <>
          <div
            className="entity-table-scroll"
            tabIndex={0}
            aria-label="Tracks table scroll area"
          >
            <table
              className="tracks-table"
              role="grid"
              aria-label="Entities and displayed tracks"
              aria-rowcount={ordered.length + 1}
            >
              <caption className="sr-only">
                One row per Entity. Filters affect all maps. Asset roles do not
                add rows. Arrow keys move focus; Enter or Space selects;
                double-click opens details. Checkboxes and Shift or Ctrl
                selection toggle members of a group.
              </caption>
              <thead>
                {table.getHeaderGroups().map((group) => (
                  <tr key={group.id}>
                    <th className="selection-column" scope="col">
                      <span className="sr-only">Select members</span>
                    </th>
                    {group.headers.map((header) => (
                      <th
                        key={header.id}
                        scope="col"
                        aria-sort={
                          header.column.getIsSorted() === 'asc'
                            ? 'ascending'
                            : header.column.getIsSorted() === 'desc'
                              ? 'descending'
                              : 'none'
                        }
                      >
                        <button
                          onClick={header.column.getToggleSortingHandler()}
                        >
                          {flexRender(
                            header.column.columnDef.header,
                            header.getContext(),
                          )}
                          {header.column.getIsSorted() === 'asc' ? (
                            <ArrowUp size={11} />
                          ) : header.column.getIsSorted() === 'desc' ? (
                            <ArrowDown size={11} />
                          ) : null}
                        </button>
                      </th>
                    ))}
                  </tr>
                ))}
              </thead>
              <tbody ref={body}>
                {ordered.map((row, index) => (
                  <tr
                    key={row.id}
                    data-entity-id={row.id}
                    aria-selected={selectedIds.has(row.id)}
                    tabIndex={row.id === focusId ? 0 : -1}
                    onFocus={() => setFocused(row.id)}
                    onClick={(event) =>
                      selectForDetails(
                        runtime,
                        bridge,
                        row.id,
                        event.shiftKey || event.ctrlKey || event.metaKey,
                      )
                    }
                    onDoubleClick={() => bridge.revealDetails(true)}
                    onKeyDown={(event) => {
                      if (event.target !== event.currentTarget) return;
                      if (event.key === 'Enter' || event.key === ' ') {
                        event.preventDefault();
                        selectForDetails(
                          runtime,
                          bridge,
                          row.id,
                          event.shiftKey || event.ctrlKey || event.metaKey,
                        );
                        return;
                      }
                      if (
                        !['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(
                          event.key,
                        )
                      )
                        return;
                      event.preventDefault();
                      const next =
                        event.key === 'Home'
                          ? 0
                          : event.key === 'End'
                            ? ordered.length - 1
                            : Math.max(
                                0,
                                Math.min(
                                  ordered.length - 1,
                                  index + (event.key === 'ArrowDown' ? 1 : -1),
                                ),
                              );
                      const targetRow =
                        body.current?.querySelectorAll<HTMLTableRowElement>(
                          'tr',
                        )[next];
                      targetRow?.focus();
                    }}
                  >
                    <td className="selection-column">
                      <input
                        type="checkbox"
                        aria-label={`Select ${row.original.entity.label || 'unnamed entity'}`}
                        checked={selectedIds.has(row.id)}
                        onClick={(e) => e.stopPropagation()}
                        onDoubleClick={(e) => e.stopPropagation()}
                        onChange={() =>
                          selectForDetails(runtime, bridge, row.id, true)
                        }
                      />
                    </td>
                    {row.getVisibleCells().map((cell) => (
                      <td
                        key={cell.id}
                        className={
                          [
                            'identifier',
                            'altitude',
                            'speed',
                            'observed',
                          ].includes(cell.column.id)
                            ? 'entity-value'
                            : ''
                        }
                      >
                        {flexRender(
                          cell.column.columnDef.cell,
                          cell.getContext(),
                        )}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
            {!ordered.length && (
              <div className="entity-empty">
                {scoped.length
                  ? 'No entities match the shared filters.'
                  : 'No entities in this frame.'}
              </div>
            )}
          </div>
          <div className="browser-bottom">
            <div className="entity-footnote">
              <span>↑ ↓ focus · Enter selects and opens Details</span>
              <time
                className="entity-value"
                title="Presented observation time, Singapore"
              >
                {formatSgt(frame.effectiveAt, { date: true })}
              </time>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
