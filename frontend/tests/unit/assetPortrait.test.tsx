import { afterEach, expect, it } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { AssetPortrait } from '../../src/features/entities/AssetPortrait';

afterEach(cleanup);

it('uses the two supplied model references and distinguishes them from a live feed', () => {
  const { rerender } = render(<AssetPortrait profileId="sting-v1" />);
  const sting = screen.getByRole('img', {
    name: /STING interceptor.*static model reference.*not a live feed/,
  });
  expect(sting.getAttribute('src')).toContain('sting-interceptor.png');
  rerender(<AssetPortrait profileId="hornet-10-v1" />);
  expect(
    screen
      .getByRole('img', { name: /Quadcopter.*static model reference/ })
      .getAttribute('src'),
  ).toContain('quadcopter.png');
  expect(screen.queryByText('Illustration')).toBeNull();
});

it.each([
  undefined,
  'lancet-3-v1',
  'shahed-136-v1',
  'STING',
  'future-aircraft',
  'constructor',
])('does not assign a misleading photograph to %s', (profileId) => {
  render(<AssetPortrait profileId={profileId} />);
  expect(screen.queryByRole('img')).toBeNull();
  expect(screen.getByText('No reference image assigned')).toBeTruthy();
});

it('retains a truthful failed-image state without poisoning a different selection', () => {
  const { rerender } = render(<AssetPortrait profileId="hornet-10-v1" />);
  fireEvent.error(screen.getByRole('img'));
  expect(screen.queryByRole('img')).toBeNull();
  expect(screen.getByText('Reference image unavailable')).toBeTruthy();
  rerender(<AssetPortrait profileId="sting-v1" />);
  expect(screen.getByRole('img', { name: /STING interceptor/ })).toBeTruthy();
  rerender(<AssetPortrait profileId="hornet-10-v1" />);
  expect(screen.getByText('Reference image unavailable')).toBeTruthy();
});
