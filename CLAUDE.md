@AGENTS.md

<!-- BEGIN:impersonation-session-rules -->
# Impersonation Mode - Session Handling Rules

This application supports **admin impersonation** feature where admins can view the system as any user for testing and debugging purposes.

## CRITICAL: Always Use Effective Session APIs

### Backend API Routes (Server-side)
**ALWAYS** use `getEffectiveSession()` instead of `getServerSession()` for ANY API route that:
- Displays user-specific data (registrations, payments, profile, etc.)
- Is accessible by regular members
- Needs to support impersonation mode for testing

```typescript
// ❌ WRONG - Does not support impersonation
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth-options';

export async function GET(request: NextRequest) {
  const session = await getServerSession(authOptions);
  // This will ALWAYS return the admin's session, even in impersonation mode
}

// ✅ CORRECT - Supports impersonation
import { getEffectiveSession } from '@/lib/impersonation';

export async function GET(request: NextRequest) {
  const session = await getEffectiveSession();
  // This returns impersonated user's session when in impersonation mode
  // Otherwise returns normal session
}
```

### Frontend Components (Client-side)
**ALWAYS** use `useEffectiveSessionContext()` instead of `useSession()` for ANY component that:
- Displays user-specific information
- Makes API calls based on current user
- Is part of member-facing features

```typescript
// ❌ WRONG - Does not support impersonation
import { useSession } from 'next-auth/react';

export default function MyComponent() {
  const { data: session } = useSession();
  // This will ALWAYS return the admin's session, even in impersonation mode
}

// ✅ CORRECT - Supports impersonation
import { useEffectiveSessionContext } from '@/lib/EffectiveSessionProvider';

export default function MyComponent() {
  const { data: session, status } = useEffectiveSessionContext();
  // This returns impersonated user's session when in impersonation mode
  // Otherwise returns normal session
}
```

## When to Use Which Session API

| Context | Use | Import From | Notes |
|---------|-----|-------------|-------|
| **Member-facing API routes** | `getEffectiveSession()` | `@/lib/impersonation` | Returns impersonated session if active |
| **Member-facing components** | `useEffectiveSessionContext()` | `@/lib/EffectiveSessionProvider` | Returns impersonated session if active |
| **Admin-only API routes** | `getServerSession()` | `next-auth` | Always returns real admin session |
| **Admin-only components** | `useSession()` | `next-auth/react` | Always returns real admin session |

## How getEffectiveSession Works

```typescript
export async function getEffectiveSession() {
  const session = await getServerSession(authOptions);

  if (!session?.user) return null;

  const cookieStore = await cookies();
  const impersonatingUserId = cookieStore.get('impersonating')?.value;

  if (!impersonatingUserId) {
    // Not impersonating - return normal session
    return { ...session, isImpersonating: false };
  }

  // Fetch impersonated user from Firestore users collection
  const targetUser = await db.collection('users').doc(impersonatingUserId).get();

  // Return session with impersonated user's data
  return {
    ...session,
    user: { /* impersonated user data */ },
    isImpersonating: true,
    originalAdmin: { /* admin info */ }
  };
}
```

## Examples of Correct Usage

### ✅ Event Detail API (Member-facing)
```typescript
// src/app/api/events/[eventId]/detail/route.ts
import { getEffectiveSession } from '@/lib/impersonation';

export async function GET(request: NextRequest, { params }) {
  const session = await getEffectiveSession(); // ✅ Supports impersonation

  // When admin impersonates a user, this will return the user's registrations
  const userRegistration = registrations.find(r =>
    r.lineUserId === session.user.id // This is the impersonated user's ID
  );
}
```

### ✅ My Registrations Page (Member-facing)
```typescript
// src/app/my-registrations/page.tsx
import { useEffectiveSessionContext } from '@/lib/EffectiveSessionProvider';

export default function MyRegistrationsPage() {
  const { data: session, status } = useEffectiveSessionContext(); // ✅ Supports impersonation

  // When admin impersonates a user, this fetches the user's registrations
  const fetchMyRegistrations = async () => {
    const response = await fetch('/api/my-registrations');
    // API also uses getEffectiveSession, so it returns correct data
  };
}
```

### ❌ Admin Panel (Admin-only - Don't use effective session)
```typescript
// src/app/admin/page.tsx
import { useSession } from 'next-auth/react'; // ✅ Use regular session for admin panels

export default function AdminPanel() {
  const { data: session } = useSession(); // ✅ Always shows admin's real session

  // Admin panels should NOT use effective session
  // We want to know who the real admin is, not who they're impersonating
}
```

## Checklist for New Features

When creating new member-facing features, ensure:

- [ ] API routes use `getEffectiveSession()` instead of `getServerSession()`
- [ ] Client components use `useEffectiveSessionContext()` instead of `useSession()`
- [ ] User data is fetched using `session.user.id` or `session.user.memberId`
- [ ] No direct references to deprecated `members` collection (use `users` collection)
- [ ] Test the feature in impersonation mode to ensure it shows impersonated user's data

## Impact of Not Using Effective Session

If you use `getServerSession()` or `useSession()` in member-facing features:

- ❌ Impersonation mode will NOT work
- ❌ Admin will always see their own data instead of the impersonated user's data
- ❌ Testing member scenarios becomes impossible
- ❌ Debugging user-specific issues becomes much harder

## Related Files

- **Session Provider**: `src/lib/EffectiveSessionProvider.tsx`
- **Impersonation Logic**: `src/lib/impersonation.ts`
- **Impersonation API**: `src/app/api/admin/impersonate/route.ts`
- **Impersonation UI**: `src/app/admin/impersonate/page.tsx`
- **Impersonation Banner**: `src/components/ImpersonationBanner.tsx`

<!-- END:impersonation-session-rules -->
