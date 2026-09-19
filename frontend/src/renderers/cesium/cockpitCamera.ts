import type { DeepReadonly } from '../../contracts/types';
import type { Position3D } from '../../contracts/generated';
import { visualHeight } from './altitude';

export interface CockpitCameraFrame {
  bindingKey: string;
  missionId: string;
  frameId: string;
  sequence: number;
  effectiveAt: string;
  position: DeepReadonly<Position3D>;
  headingTrueDeg: number;
  yaw: number;
  pitch: number;
}
export const cockpitFovDegrees = 60;
/** Camera-only defaults, never aircraft attitude or camera specifications. */
export function cockpitOrientation(input: CockpitCameraFrame) {
  const height = visualHeight(input.position.altitude);
  if (height?.quality !== 'ellipsoid') return;
  const radians = Math.PI / 180;
  return {
    height: height.metres,
    heading:
      ((input.headingTrueDeg + Math.max(-90, Math.min(90, input.yaw)) + 360) %
        360) *
      radians,
    pitch: Math.max(-45, Math.min(45, input.pitch)) * radians,
    roll: 0,
    fov: cockpitFovDegrees * radians,
  };
}
