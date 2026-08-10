# Testing Guide - User Impersonation & Test Accounts

This guide explains how to test various user scenarios, permissions, and validation logic in the Agents Club Member Manager system.

---

## 🎯 Overview

The system includes two powerful testing features:

1. **Test User Seeding** - Create predefined test accounts with various scenarios
2. **Admin Impersonation** - View the system as any user for debugging

---

## 📝 Part 1: Test User Accounts

### Quick Start

```bash
# 1. Seed test users
npm run seed-test-users

# 2. Clean up when done
npm run cleanup-test-users
```

### Available Test Scenarios

After running `npm run seed-test-users`, you'll have 8 test accounts:

| LINE User ID | Scenario | Description |
|--------------|----------|-------------|
| `test-normal-active` | ✅ Normal Member | Active license, in LINE group |
| `test-license-expired` | ⚠️ Expired License | License expired, should block registration |
| `test-license-suspended` | 🚫 Suspended | License suspended, should block access |
| `test-left-line-group` | 👋 Left Group | User left LINE group, should block registration |
| `test-pending-approval` | ⏳ Pending | New member awaiting approval |
| `test-admin-user` | 👑 Admin | Full admin access |
| `test-event-staff` | 🎫 Event Staff | Can manage assigned events |
| `test-multiple-issues` | ❌ Multiple Issues | Expired + left group (worst case) |

### Test User Details

All test users have:
- **Password**: Not needed (LINE OAuth only)
- **Marked as**: `testAccount: true` in Firestore
- **License Numbers**: `TEST-XXX-001` format
- **Emails**: `test-xxx@example.com`

### Usage Examples

#### Example 1: Test License Expiry Validation

```typescript
// 1. Login as test-license-expired user (via impersonation or LINE OAuth)
// 2. Try to register for an event
// 3. System should block with error message:
//    "ใบอนุญาตของคุณหมดอายุแล้ว กรุณาติดต่อเจ้าหน้าที่"
```

#### Example 2: Test Permission System

```typescript
// 1. Login as test-event-staff
// 2. Go to /admin - should have limited access
// 3. Can manage assigned events only
// 4. Cannot access /admin/members (insufficient permissions)
```

---

## 👁️ Part 2: Admin Impersonation

### What is Impersonation?

Impersonation allows admins to "become" another user temporarily, seeing exactly what they see with their permissions and data access.

### How to Use

1. **Login as Admin**
   ```
   Go to: /admin
   ```

2. **Navigate to Impersonation Page**
   ```
   Go to: /admin/impersonate
   ```

3. **Select User**
   - Search by name, email, or LINE ID
   - Filter by "Test" or "Real" users
   - Click "View as User"

4. **System Behavior**
   - You'll be redirected to `/events` (member view)
   - Purple banner appears at top showing impersonation status
   - You see exactly what that user sees
   - All permissions are enforced as that user

5. **Exit Impersonation**
   - Click "Exit Impersonation" button in purple banner
   - Returns to admin panel

### Impersonation Features

- ✅ **Full session replacement** - System treats you as the target user
- ✅ **Permission enforcement** - All access controls apply
- ✅ **Audit trail** - Every impersonation is logged in `impersonationLogs` collection
- ✅ **Safe** - Cannot impersonate yourself
- ✅ **Time-limited** - Auto-expires after 4 hours

### Audit Trail

Every impersonation session creates a log entry:

```typescript
{
  adminUserId: "admin-user-id",
  adminEmail: "admin@example.com",
  adminName: "Admin Name",
  targetUserId: "target-user-id",
  targetName: "Target User",
  targetEmail: "target@example.com",
  startedAt: "2024-01-15T10:00:00Z",
  endedAt: "2024-01-15T11:30:00Z",  // null if still active
  ipAddress: "203.0.113.1",
  userAgent: "Mozilla/5.0..."
}
```

---

## 🔬 Testing Workflows

### Workflow 1: Test Registration Validation

```bash
# 1. Seed test users
npm run seed-test-users

# 2. Impersonate expired license user
Login as admin → /admin/impersonate → Select "test-license-expired"

# 3. Try to register for event
Go to /events → Select event → Try to register
Expected: ❌ Error message about expired license

# 4. Exit impersonation
Click "Exit Impersonation"

# 5. Impersonate normal user
Select "test-normal-active"

# 6. Try to register for event
Go to /events → Select event → Register
Expected: ✅ Registration successful
```

### Workflow 2: Test Permission Levels

```bash
# Test 1: Guest User
Impersonate: test-pending-approval
Check: Should see limited content, cannot register

# Test 2: Normal Member
Impersonate: test-normal-active
Check: Can register, see events, manage own registrations

# Test 3: Event Staff
Impersonate: test-event-staff
Check: Can access /admin but limited to assigned events

# Test 4: Admin
Impersonate: test-admin-user
Check: Full access to all admin features
```

### Workflow 3: Test LINE Group Status

```bash
# 1. Impersonate user who left group
Select: test-left-line-group

# 2. Try to access member features
Expected: Limited or blocked access (depends on business rules)

# 3. Try to register for event
Expected: ❌ Error message about LINE group status
```

---

## 🛠️ Advanced Usage

### Using in API Routes

```typescript
import { getEffectiveSession } from '@/lib/impersonation';

export async function GET(request: NextRequest) {
  // This automatically handles impersonation
  const session = await getEffectiveSession();

  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // session.user now represents the impersonated user (if impersonating)
  // session.isImpersonating is true if in impersonation mode
  // session.originalAdmin contains admin info

  console.log('Current user:', session.user.id);
  console.log('Is impersonating:', session.isImpersonating);

  // ... your logic
}
```

### Checking Impersonation Status

```typescript
import { isImpersonating, getImpersonatedUserId } from '@/lib/impersonation';

// Check if currently impersonating
const impersonating = await isImpersonating();

if (impersonating) {
  const userId = await getImpersonatedUserId();
  console.log('Viewing as:', userId);
}
```

---

## 📊 Database Collections

### Test Users

```
Collection: members
Document ID: test-xxx-xxx (LINE User ID)

Fields:
  - testAccount: true (marks as test user)
  - displayName: "Test: Scenario Name"
  - licenseStatus: "active" | "expired" | "suspended" | "pending"
  - lineGroupStatus: "member" | "left" | "pending"
  - role: "admin" | "event-staff" | "member" | "guest"
```

### Impersonation Logs

```
Collection: impersonationLogs
Auto-generated ID

Fields:
  - adminUserId: string
  - adminEmail: string
  - targetUserId: string
  - targetName: string
  - startedAt: timestamp
  - endedAt: timestamp | null
  - ipAddress: string
  - userAgent: string
```

---

## ⚠️ Important Notes

### Security

- ✅ Impersonation is **admin-only** (requires `admin:access` permission)
- ✅ All impersonations are **logged** for audit
- ✅ Cookies are **httpOnly** and **secure** in production
- ✅ Cannot impersonate yourself
- ⚠️ Test users are marked with `testAccount: true` - filter them out in production queries if needed

### Cleanup

```bash
# Clean up all test users
npm run cleanup-test-users

# This deletes all members where testAccount === true
```

### Production Safety

The seed script has multiple safety checks:

```typescript
// ❌ Will not run in production
if (process.env.NODE_ENV === 'production') {
  console.error('Cannot seed in production!');
  process.exit(1);
}
```

---

## 🐛 Troubleshooting

### Issue: Test users not appearing

**Solution:**
```bash
# Check Firestore directly
# Look for members with testAccount: true

# Re-run seed script
npm run cleanup-test-users
npm run seed-test-users
```

### Issue: Cannot impersonate

**Possible causes:**
1. Not logged in as admin
2. Don't have `admin:access` permission
3. Target user doesn't exist

**Solution:**
Check your admin permissions in Firestore `members` collection.

### Issue: Impersonation banner not showing

**Possible causes:**
1. Cookie not set
2. Banner component not in layout
3. JavaScript error

**Solution:**
1. Check browser cookies for `impersonating`
2. Check console for errors
3. Verify `ImpersonationBanner` in `layout.tsx`

---

## 📚 Additional Resources

### Related Files

- **Scripts:**
  - `scripts/seed-test-users.ts` - Creates test users
  - `scripts/cleanup-test-users.ts` - Removes test users

- **API Routes:**
  - `app/api/admin/impersonate/route.ts` - Impersonation endpoints

- **Components:**
  - `components/ImpersonationBanner.tsx` - Status banner
  - `app/admin/impersonate/page.tsx` - Impersonation UI

- **Libraries:**
  - `lib/impersonation.ts` - Helper functions

### Extending Test Scenarios

To add more test scenarios, edit `scripts/seed-test-users.ts`:

```typescript
{
  lineUserId: 'test-custom-scenario',
  displayName: 'Test: Custom Scenario',
  licenseStatus: 'custom-status',
  // ... other fields
  description: '📝 Your scenario description',
}
```

---

## ✅ Quick Checklist

Before deploying to production:

- [ ] Run `npm run cleanup-test-users` to remove test accounts
- [ ] Verify `NODE_ENV=production` is set
- [ ] Test impersonation audit logs are working
- [ ] Verify impersonation requires admin permission
- [ ] Check that test users are filtered from production reports

---

**Happy Testing! 🚀**

For questions or issues, check the audit logs in Firestore `impersonationLogs` collection.
