import type { Page, Locator } from '@playwright/test';
export function openCommand(page: Page): Promise<Locator>;
export function analyticViews(
  page: Page,
  shot?: (name: string) => Promise<void>,
): Promise<{ label: string; pane: Locator; separate: Locator }>;
