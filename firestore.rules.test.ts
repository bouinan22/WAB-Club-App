/**
 * Phase 0 Dirty Dozen Security Verification Specification
 * Covers adversarial payloads verified against firestore.rules.
 */
export const DIRTY_DOZEN_CASES = [
  {
    id: 'DD-01',
    name: 'Self-assign super_admin in /admins',
    path: '/admins/attacker_uid',
    operation: 'create',
    expected: 'PERMISSION_DENIED',
  },
  {
    id: 'DD-02',
    name: 'Escalate role field in /users/{uid}',
    path: '/users/coach_uid',
    operation: 'update',
    expected: 'PERMISSION_DENIED',
  },
  {
    id: 'DD-03',
    name: 'Spoof admin email with email_verified=false',
    path: '/players/p1',
    operation: 'create',
    expected: 'PERMISSION_DENIED',
  },
  {
    id: 'DD-04',
    name: 'Shadow ghost field injection on coachReports',
    path: '/coachReports/rep_1',
    operation: 'create',
    expected: 'PERMISSION_DENIED',
  },
  {
    id: 'DD-05',
    name: 'Parent reads /subscriptions or /payments',
    path: '/subscriptions/sub_1',
    operation: 'get',
    expected: 'PERMISSION_DENIED',
  },
  {
    id: 'DD-06',
    name: 'Coach reads /financeEntries',
    path: '/financeEntries/fin_1',
    operation: 'list',
    expected: 'PERMISSION_DENIED',
  },
  {
    id: 'DD-07',
    name: 'Coach lists all players across categories',
    path: '/players',
    operation: 'list',
    expected: 'PERMISSION_DENIED',
  },
  {
    id: 'DD-08',
    name: 'Parent reads another family child document',
    path: '/players/other_child',
    operation: 'get',
    expected: 'PERMISSION_DENIED',
  },
  {
    id: 'DD-09',
    name: 'Parent mutates own child player document',
    path: '/players/own_child',
    operation: 'update',
    expected: 'PERMISSION_DENIED',
  },
  {
    id: 'DD-10',
    name: 'Oversized document ID poisoning (>128 chars)',
    path: '/players/' + 'x'.repeat(200),
    operation: 'create',
    expected: 'PERMISSION_DENIED',
  },
  {
    id: 'DD-11',
    name: 'Client-forged serverCreatedAt timestamp',
    path: '/coachReports/rep_2',
    operation: 'create',
    expected: 'PERMISSION_DENIED',
  },
  {
    id: 'DD-12',
    name: 'Coach modifies reviewed report (terminal state lock)',
    path: '/coachReports/rep_reviewed',
    operation: 'update',
    expected: 'PERMISSION_DENIED',
  },
] as const;
