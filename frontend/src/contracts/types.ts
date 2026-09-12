import type * as Generated from './generated';

// Aliases only: backend Pydantic/OpenAPI is the sole wire-shape authority.
export type Mission = Generated.Mission;
export type MissionList = Generated.MissionList;
export type WorldFrame = Generated.WorldFrame;
export type Entity = Generated.Entity;
export type SnapshotMessage = Generated.SnapshotMessage;
export type DeltaMessage = Generated.DeltaMessage;
export type HeartbeatMessage = Generated.HeartbeatMessage;
export type ResyncRequiredMessage = Generated.ResyncRequiredMessage;
export type StreamMessage =
  SnapshotMessage | DeltaMessage | HeartbeatMessage | ResyncRequiredMessage;

export type DeepReadonly<T> = T extends readonly (infer Item)[]
  ? readonly DeepReadonly<Item>[]
  : T extends object
    ? { readonly [Key in keyof T]: DeepReadonly<T[Key]> }
    : T;
export type ImmutableFrame = DeepReadonly<WorldFrame>;
