import {
  USER_SOFT_REFRESH_MIN_INTERVAL_MS,
  shouldSkipSoftUserRefresh,
} from '../../utils/authRefresh';

describe('auth refresh guard', () => {
  it('skips non-forced user refreshes while the current snapshot is fresh', () => {
    expect(
      shouldSkipSoftUserRefresh({
        force: false,
        lastConfirmedAt: 1_000,
        now: 1_000 + USER_SOFT_REFRESH_MIN_INTERVAL_MS - 1,
      }),
    ).toBe(true);
  });

  it('allows forced user refreshes even inside the soft refresh window', () => {
    expect(
      shouldSkipSoftUserRefresh({
        force: true,
        lastConfirmedAt: 1_000,
        now: 2_000,
      }),
    ).toBe(false);
  });

  it('allows soft user refreshes once the snapshot is stale', () => {
    expect(
      shouldSkipSoftUserRefresh({
        force: false,
        lastConfirmedAt: 1_000,
        now: 1_000 + USER_SOFT_REFRESH_MIN_INTERVAL_MS,
      }),
    ).toBe(false);
  });
});
