<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

<!-- BEGIN:firestore-rules -->
# Firestore Query Rules - IMPORTANT

## Avoid Composite Index Requirements
**NEVER** use `.where()` combined with `.orderBy()` in Firestore queries unless you have confirmed a composite index exists. This combination requires a composite index that may not be set up.

### BAD - Requires composite index:
```typescript
db.collection('searchLogs')
  .where('userId', '==', userId)
  .orderBy('searchedAt', 'desc')
  .get();
```

### GOOD - Fetch and sort in JavaScript:
```typescript
// 1. Fetch with just where clause
const snapshot = await db.collection('searchLogs')
  .where('userId', '==', userId)
  .limit(100)
  .get();

// 2. Map to array
let items = snapshot.docs.map(doc => ({
  id: doc.id,
  ...doc.data(),
  createdAt: doc.data().createdAt?.toDate?.() || doc.data().createdAt,
}));

// 3. Sort in JavaScript
items.sort((a, b) => {
  const dateA = a.createdAt instanceof Date ? a.createdAt.getTime() : new Date(a.createdAt || 0).getTime();
  const dateB = b.createdAt instanceof Date ? b.createdAt.getTime() : new Date(b.createdAt || 0).getTime();
  return dateB - dateA; // descending
});

// 4. Apply limit after sorting
items = items.slice(0, 50);
```

## Checklist Before Writing Firestore Queries
- [ ] Does the query use `.where()` + `.orderBy()` together? If yes, refactor to sort in JavaScript
- [ ] Does the query use multiple `.where()` clauses with different fields? May need composite index
- [ ] Always handle date conversion: `data.field?.toDate?.() || data.field`
<!-- END:firestore-rules -->
