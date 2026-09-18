import * as Menu from '@radix-ui/react-dropdown-menu';
import { useState } from 'react';
import { Check, ChevronRight, ListFilter } from 'lucide-react';
import type { ApplicationRuntime, RuntimeSnapshot } from '../../app/runtime';
import type { FilterState } from '../../state/sessionStore';
import { sourceChoices } from './presentation';

export function filtersActive(filters: FilterState) {
  return !!(
    filters.search?.trim() ||
    filters.affiliations.length ||
    filters.classificationCodes.length ||
    filters.sourceIds.length ||
    filters.zoneIds.length ||
    filters.observationStates?.length ||
    filters.conditions?.length ||
    !filters.showUnobserved ||
    filters.showRemoved
  );
}
function Choices({
  name,
  options,
  selected,
  change,
  technical = false,
}: {
  name: string;
  options: readonly { id: string; label: string }[];
  selected: readonly string[];
  change: (value: string[]) => void;
  technical?: boolean;
}) {
  const [copyResult, setCopyResult] = useState('Choose a source ID to copy');
  return (
    <Menu.Sub>
      <Menu.SubTrigger className="menu-item">
        {name}
        {selected.length ? ` · ${selected.length}` : ''}
        <ChevronRight size={12} />
      </Menu.SubTrigger>
      <Menu.Portal>
        <Menu.SubContent
          className="menu-content entity-filter-menu"
          sideOffset={4}
        >
          <Menu.Label className="menu-label">
            {name} · all when unchecked
          </Menu.Label>
          {options.map((option) => (
            <Menu.CheckboxItem
              className="menu-item"
              key={option.id}
              checked={selected.includes(option.id)}
              onSelect={(e) => e.preventDefault()}
              onCheckedChange={(checked) =>
                change(
                  checked
                    ? [...selected, option.id]
                    : selected.filter((v) => v !== option.id),
                )
              }
            >
              <Menu.ItemIndicator>
                <Check size={12} />
              </Menu.ItemIndicator>
              {option.label}
            </Menu.CheckboxItem>
          ))}
          {!options.length && (
            <Menu.Label className="menu-label">None supplied</Menu.Label>
          )}
          {technical && !!options.length && (
            <>
              <Menu.Separator className="menu-separator" />
              <Menu.Sub>
                <Menu.SubTrigger className="menu-item">
                  Technical source IDs <ChevronRight size={12} />
                </Menu.SubTrigger>
                <Menu.Portal>
                  <Menu.SubContent className="menu-content entity-filter-menu">
                    <div className="menu-label" role="status">
                      {copyResult}
                    </div>
                    {options.map((option) => (
                      <Menu.Item
                        key={option.id}
                        className="menu-item source-id-copy"
                        aria-label={`Copy ${option.label} source ID`}
                        onSelect={(event) => {
                          event.preventDefault();
                          void (async () => {
                            try {
                              await navigator.clipboard.writeText(option.id);
                              setCopyResult(`${option.label} ID copied`);
                            } catch {
                              setCopyResult(
                                'Copy unavailable; select the exact ID',
                              );
                            }
                          })();
                        }}
                      >
                        <span>{option.label}</span>
                        <code>{option.id}</code>
                      </Menu.Item>
                    ))}
                  </Menu.SubContent>
                </Menu.Portal>
              </Menu.Sub>
            </>
          )}
        </Menu.SubContent>
      </Menu.Portal>
    </Menu.Sub>
  );
}
export function FilterItems({
  runtime,
  state,
  presence = true,
}: {
  runtime: ApplicationRuntime;
  state: RuntimeSnapshot;
  presence?: boolean;
}) {
  const f = state.session.filters,
    frame = state.presentation.frame;
  const classes = new Map(
    Object.values(frame?.entities ?? {})
      .filter((e) => e.classification)
      .map((e) => [
        e.classification!.code,
        e.classification!.label ?? e.classification!.code,
      ]),
  );
  return (
    <>
      <Menu.Label className="menu-label">
        Shared · all maps and Tracks
      </Menu.Label>
      <Choices
        name="Affiliation"
        options={['friendly', 'hostile', 'neutral', 'unknown'].map((id) => ({
          id,
          label: id.toUpperCase(),
        }))}
        selected={f.affiliations}
        change={(v) =>
          runtime.setFilters({ affiliations: v as FilterState['affiliations'] })
        }
      />
      <Choices
        name="Observation"
        options={[
          { id: 'tracking', label: 'Tracking' },
          { id: 'stale', label: 'Last known' },
          { id: 'ended', label: 'Ended' },
          { id: 'unlocated', label: 'No position' },
        ]}
        selected={f.observationStates ?? []}
        change={(v) =>
          runtime.setFilters({
            observationStates: v as FilterState['observationStates'],
          })
        }
      />
      <Choices
        name="Condition"
        options={[
          { id: 'operational', label: 'Operational' },
          { id: 'degraded', label: 'Degraded' },
          { id: 'non-operational', label: 'NON-OP' },
          { id: 'unknown', label: 'Unknown condition' },
        ]}
        selected={f.conditions ?? []}
        change={(v) =>
          runtime.setFilters({ conditions: v as FilterState['conditions'] })
        }
      />
      <Choices
        name="Classification"
        options={[...classes].sort().map(([id, label]) => ({ id, label }))}
        selected={f.classificationCodes}
        change={(v) => runtime.setFilters({ classificationCodes: v })}
      />
      <Choices
        name="Source"
        options={sourceChoices(frame)}
        technical
        selected={f.sourceIds}
        change={(v) => runtime.setFilters({ sourceIds: v })}
      />
      <Choices
        name="Zone footprint"
        options={Object.values(frame?.zones ?? {}).map((z) => ({
          id: z.id,
          label: z.label,
        }))}
        selected={f.zoneIds}
        change={(v) => runtime.setFilters({ zoneIds: v })}
      />
      {presence && (
        <Menu.CheckboxItem
          className="menu-item"
          checked={f.showUnobserved}
          onSelect={(e) => e.preventDefault()}
          onCheckedChange={(v) => runtime.setFilters({ showUnobserved: v })}
        >
          <Menu.ItemIndicator>
            <Check size={12} />
          </Menu.ItemIndicator>
          Last-known observations
        </Menu.CheckboxItem>
      )}
      <Menu.CheckboxItem
        className="menu-item"
        checked={f.showRemoved}
        onSelect={(e) => e.preventDefault()}
        onCheckedChange={(v) => runtime.setFilters({ showRemoved: v })}
      >
        <Menu.ItemIndicator>
          <Check size={12} />
        </Menu.ItemIndicator>
        Removed entities
      </Menu.CheckboxItem>
      <Menu.Separator className="menu-separator" />
      <Menu.Item className="menu-item" onSelect={() => runtime.resetFilters()}>
        Reset all filters
      </Menu.Item>
    </>
  );
}
export function EntityFilters({
  runtime,
  state,
}: {
  runtime: ApplicationRuntime;
  state: RuntimeSnapshot;
}) {
  return (
    <Menu.Root>
      <Menu.Trigger
        className="text-control filter-trigger"
        aria-label="Shared entity filters"
      >
        <ListFilter size={14} />
        Filters{filtersActive(state.session.filters) && ' · active'}
      </Menu.Trigger>
      <Menu.Portal>
        <Menu.Content
          className="menu-content entity-filter-menu"
          align="start"
          sideOffset={5}
        >
          <FilterItems runtime={runtime} state={state} />
        </Menu.Content>
      </Menu.Portal>
    </Menu.Root>
  );
}
