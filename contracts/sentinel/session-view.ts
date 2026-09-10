/** Phase 0 frontend-only contracts. No stores, shell or renderer implementation. */
import type { Position3D, WorldFrame, Entity } from './world.generated';
type Affiliation = Entity['affiliation'];
export type Id = string;
export type UtcInstant = string;
export type Json = null | boolean | number | string | Json[] | { [key:string]:Json };
export type ObjectRef = {kind:'entity'|'track'|'asset'|'sensor'|'zone'|'event'|'task';id:Id};
export interface SelectionState {missionId:Id;items:readonly ObjectRef[];primary?:ObjectRef;revision:number}
export type TimeState = {mode:'live';followLatest:true} | {
  mode:'replay';recordingId:Id;requestedAt:UtcInstant;
  resolved?:{frameId:Id;at:UtcInstant};seekGeneration:number;playing:boolean;rate:number;
};
export interface FilterState {
  affiliations:readonly Affiliation[];classificationCodes:readonly string[];
  sourceIds:readonly Id[];zoneIds:readonly Id[];showUnobserved:boolean;showRemoved:boolean;
}
export interface OverlayState {
  zones:boolean;history:boolean;predictions:boolean;assignments:boolean;eventMarkers:boolean;historyWindowSeconds:number;
}
export interface SessionState {
  id:Id;missionId?:Id;selection?:SelectionState;time:TimeState;filters:FilterState;overlays:OverlayState;
}
export interface CameraIntent {focus:Position3D;groundSpanM:number;headingTrueDeg:number;focusEntityId?:Id}
export type ViewDescriptor =
  | {id:Id;type:'map';mode:'tactical'|'3d';camera?:CameraIntent}
  | {id:Id;type:'entity-detail';missionId:Id;entityId:Id}
  | {id:Id;type:'command-picture'|'timeline'|'entity-browser'}
  | {id:Id;type:'vertical-profile';originEntityId?:Id};
export interface WorkspaceState {
  schemaVersion:1;sessionId:Id;activeModule:string;activeViewId?:Id;
  views:Readonly<Record<Id,ViewDescriptor>>;
  layout:{engine:'flexlayout';version:string;config:Json};
  popouts:Readonly<Record<Id,{viewId:Id;status:'opening'|'open'|'closed'|'blocked'}>>;
}
export type PresentationState =
  | {status:'empty'}
  | {status:'ready'|'seeking';frame:Readonly<WorldFrame>;mode:'live'|'replay';recordingId?:Id};
export interface OperationalCache {
  live?:Readonly<WorldFrame>;
  historical:Readonly<Record<Id,Readonly<WorldFrame>>>;
  connection:'connecting'|'connected'|'stale'|'disconnected';
}
export type SessionIntent =
  | {type:'select';selection:SelectionState}
  | {type:'seek';recordingId:Id;at:UtcInstant;generation:number}
  | {type:'return-to-live'};
export interface DockingPort {
  open(view:ViewDescriptor):void;
  openToSide(viewId:Id,relativeTo:Id):void;
  close(viewId:Id):void;
  popOut(viewId:Id):void;
}
export interface SceneObject {
  ref:ObjectRef;position:Position3D;affiliation:Entity['affiliation'];label:string;selected:boolean;
}
/** Read-model draft; overlay geometry is added with renderer implementation. */
export interface SceneProjection {
  missionId:Id;frameId:Id;time:UtcInstant;objects:readonly SceneObject[];overlays:OverlayState;
}
export type RendererIntent={type:'select';target?:ObjectRef;additive:boolean}|{type:'camera';camera:CameraIntent};
/** Runtime-only port. Implementations own GPU objects outside all serializable state. */
export interface RendererPort {
  mount(host:HTMLElement,emit:(intent:RendererIntent)=>void):Promise<void>;
  apply(scene:SceneProjection):void;captureCamera():CameraIntent;restoreCamera(camera:CameraIntent):void;
  resize():void;setVisible(visible:boolean):void;dispose():void;
}
