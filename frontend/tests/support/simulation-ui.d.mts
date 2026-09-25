import type { Locator, Page } from '@playwright/test';
import type { SimulationRequest } from '../../src/modules/simulation/request.generated';
import type { SimulationResponse } from '../../src/modules/simulation/response.generated';
import type { SimulationRunStatus } from '../../src/contracts/generated';
export function externalFixture(
  kind?: 'golden' | 'local40' | 'remote40',
): SimulationRequest;
export function openSimulation(page: Page): Promise<Locator>;
export function submitSimulation(
  page: Page,
  body: string | SimulationRequest,
): Promise<SimulationResponse>;
export function abortSimulation(page: Page): Promise<void>;
export function simulationFlow(
  page: Page,
  base: string,
  output: string,
  kind?: 'golden' | 'local40' | 'remote40',
  capture?: (path: string) => Promise<unknown>,
): Promise<{
  body: SimulationRequest;
  result: SimulationResponse;
  run: SimulationRunStatus;
  resumedResult: SimulationResponse;
  worldSequence: number;
  pageErrors: string[];
  externalRequests: number;
}>;
