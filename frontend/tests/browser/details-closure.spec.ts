import { test } from '@playwright/test';
import { resolve } from 'node:path';
import { detailsClosure } from '../support/details-closure.mjs';

test('Details exact profiles, affiliations, fallback, pin, layouts, failure and recorded images', async ({
  page,
}) => {
  test.setTimeout(90000);
  await detailsClosure(
    page,
    'http://127.0.0.1:5182',
    resolve('test-results/browser/details-closure'),
  );
});
