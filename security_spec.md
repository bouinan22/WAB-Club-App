# W.A.B Security Specification (Phase 0 TDD)

## 1. Data Invariants
1. **Super Admin Exclusivity**: Only the verified email `boudiafrabeh8@gmail.com` (`email_verified == true`) is `isSuperAdmin()`. No user can self-assign `role: 'admin'` or create `/admins/{uid}`.
2. **Financial & Subscription Isolation**: `subscriptions`, `payments`, `financeEntries`, `categoryFees`, `clubSettingsPrivate`, `activityLogs`, and `migrations` are strictly inaccessible (`read`/`write`) to coaches and parents.
3. **Coach Category Scoping**: Coaches can only `list`/`get` players, trainings, matches, attendance, and evaluations where `request.auth.uid in resource.data.authorizedCoachUids`, and can only create attendance/evaluations/coachReports within their assigned category.
4. **Parent Child Scoping**: Parents can only `list`/`get` players, attendance, and published evaluations where `resource.data.parentAuthUid == request.auth.uid`. Parents are strictly read-only on player profiles and never see `adminNotes`.
5. **Temporal & Structural Integrity**: Every write requires `serverCreatedAt == request.time` (on create) and `serverUpdatedAt == request.time` (on create/update), bounded strings/arrays, and strict key allowlists (`hasOnly`).

## 2. The "Dirty Dozen" Attack Payloads
1. **Privilege Escalation (Self-Admin)**: Authenticated parent attempts `setDoc(doc(db, 'admins', parentUid), { uid: parentUid, role: 'super_admin', ... })` -> MUST fail `PERMISSION_DENIED`.
2. **Role Tampering on Profile**: Coach attempts `updateDoc(doc(db, 'users', coachUid), { role: 'admin' })` -> MUST fail `PERMISSION_DENIED`.
3. **Spoofed Admin Email (`email_verified == false`)**: Attacker registers with `boudiafrabeh8@gmail.com` unverified -> MUST fail `PERMISSION_DENIED`.
4. **Shadow/Ghost Field Injection**: User injects `{ isVerified: true, ghostField: 1 }` on `players` or `coachReports` -> MUST fail `PERMISSION_DENIED` via `hasOnly`.
5. **Financial Data Access by Parent**: Parent queries `subscriptions` or `payments` or `financeEntries` -> MUST fail `PERMISSION_DENIED`.
6. **Financial Data Access by Coach**: Coach queries `subscriptions` or `payments` or `financeEntries` -> MUST fail `PERMISSION_DENIED`.
7. **Cross-Category Player Scraping by Coach**: Coach assigned to `U13` tries `getDocs(collection(db, 'players'))` without category/coach filter -> MUST fail `PERMISSION_DENIED`.
8. **Cross-Parent Child Snooping**: Parent A attempts `getDoc(doc(db, 'players', childOfParentB))` -> MUST fail `PERMISSION_DENIED`.
9. **Parent Modifying Child Record**: Parent attempts `updateDoc(doc(db, 'players', ownChildId), { status: 'active' })` -> MUST fail `PERMISSION_DENIED`.
10. **ID Poisoning**: Attacker writes document with 500-char ID or slashes -> MUST fail `isValidId()` -> `PERMISSION_DENIED`.
11. **Timestamp Forgery**: Client sends past timestamp `serverCreatedAt: Timestamp.fromMillis(0)` instead of `serverTimestamp()` -> MUST fail `PERMISSION_DENIED`.
12. **Terminal State Mutation**: Coach attempts to change `coachReports/{id}` after `status == 'reviewed'` -> MUST fail `PERMISSION_DENIED`.
