# Party Table Management - Implementation Plan

## 📋 Overview

Implementation of Party Table (seating arrangement) feature similar to Carpool system, with codebase refactoring to reduce file sizes and improve maintainability.

**Current State:**
- `src/app/events/[eventId]/page.tsx`: **5,667 lines** (329KB) - TOO LARGE
- `src/app/admin/events/[eventId]/page.tsx`: **6,627 lines** - TOO LARGE

**Goals:**
1. Implement Party Table Management feature
2. Refactor large files into manageable components
3. Share common patterns between Carpool and Party Table features
4. Support impersonation session for both admin and member views

---

## 🎯 Feature Requirements

### Party Table vs Carpool Comparison

| Feature | Carpool | Party Table |
|---------|---------|-------------|
| **Group Type** | Car (vehicle) | Table (seating) |
| **Owner/Leader** | Car Owner | Table Host (หัวโต๊ะ) |
| **Identifier** | License Plate | Table Number |
| **Capacity** | Max seats per car | Max seats per table (6-12) |
| **Member Join** | Via registration code | Via registration code |
| **Admin Management** | 2 tabs: Carpools + Car Numbers | 2 tabs: Table Groups + Table Numbers |
| **Validation** | 1 person = 1 car | 1 person = 1 table |

### Core Functionality

1. **Event Settings** (Admin)
   - ✅ Enable/disable party table feature
   - ✅ Set total number of tables
   - ✅ Set default max seats per table
   - ✅ Toggle visibility to members
   - ✅ Configure table capacity limits

2. **Member View** (Event Detail Page)
   - ✅ Create table group (become table host)
   - ✅ Join existing table (via 6-digit code)
   - ✅ Invite team members to table
   - ✅ Invite external members to table
   - ✅ Leave table
   - ✅ View table members list

3. **Admin Management** (Admin Event Detail)
   - ✅ **Tab 1: Table Groups**
     - List all table groups
     - Search by name, company, LINE name, member name
     - Add/remove members from groups
     - View group details and history
     - Delete table groups
   - ✅ **Tab 2: Table Number Assignment**
     - Grid view of all tables (1 to N)
     - Assign table groups to specific numbers
     - Assign independent members to tables
     - Show seat utilization status (color-coded)
     - Move members/groups between tables
     - Exceed capacity with warning indicators

4. **History Logging**
   - ✅ Track all table group changes
   - ✅ Record who made changes and when
   - ✅ Support audit trail for compliance

5. **Validation Rules**
   - ✅ Each attendee can join only 1 table
   - ✅ Use `attendeeIndex` + `name` for stable identification
   - ✅ Warn when table exceeds capacity (allow override)
   - ✅ Prevent duplicate assignments

---

## 🏗️ Technical Architecture

### Database Schema (Firestore)

#### Collection: `partyTables`
```typescript
{
  tableId: string;           // Auto-generated
  eventId: string;           // Foreign key
  tableGroupName?: string;   // Optional group name
  hostRegistrationId: string; // Table host (creator)
  hostCompanyName: string;
  hostContactName: string;
  members: TableMember[];    // Array of members
  assignedTableNumber?: number; // Admin-assigned number
  status: 'active' | 'deleted';
  createdAt: string;
  updatedAt: string;
  createdBy: string;         // userId
  deletedAt?: string;
  deletedBy?: string;
}

interface TableMember {
  registrationId: string;
  lineUserId: string;
  name: string;
  attendeeIndex: number;     // Stable identifier
  companyName: string;
  joinedAt: string;
  joinedBy: string;          // userId who added
}
```

#### Collection: `partyTableHistory`
```typescript
{
  historyId: string;
  eventId: string;
  tableId: string;
  action: 'member_added' | 'member_removed' | 'table_created' | 'table_deleted' | 'number_assigned';
  memberId?: string;         // For member actions
  memberName?: string;
  performedBy: string;       // userId
  performedByName: string;
  performedAt: string;
  metadata?: {
    oldTableNumber?: number;
    newTableNumber?: number;
    reason?: string;
  };
}
```

#### Updated: `events` collection
```typescript
{
  // Existing fields...
  hasPartyTableFeature?: boolean;
  partyTableSettings?: {
    totalTables: number;
    defaultSeatsPerTable: number;
    maxSeatsPerTable?: number;  // Hard limit
    showTableNumbersToMembers: boolean;
    tableActive: boolean;       // Feature visibility
  };
}
```

### File Structure

```
src/
├── types/
│   └── partyTable.ts              # New: Types and interfaces
│
├── lib/
│   └── partyTables.ts             # New: Business logic (~400 lines)
│
├── components/
│   ├── event/                     # New: Member-facing components
│   │   ├── PartyTableSection.tsx  # Extracted from event detail
│   │   ├── CarpoolSection.tsx     # Extracted from event detail
│   │   ├── RegistrationFormSection.tsx
│   │   ├── PaymentSection.tsx
│   │   └── FeeBreakdownSection.tsx
│   │
│   └── admin/
│       ├── PartyTableManagementModal.tsx  # New: Admin management (~1500 lines)
│       └── CarpoolManagementModal.tsx     # Existing: 1,549 lines
│
├── app/
│   ├── events/[eventId]/
│   │   └── page.tsx               # REFACTORED: Down from 5,667 to ~2,000 lines
│   │
│   ├── admin/events/[eventId]/
│   │   └── page.tsx               # REFACTORED: Down from 6,627 lines
│   │
│   └── api/
│       ├── partyTables/           # New API routes
│       │   ├── route.ts           # POST: Create table
│       │   └── [tableId]/
│       │       ├── route.ts       # GET/PUT/DELETE
│       │       ├── add-members/route.ts
│       │       ├── remove-members/route.ts
│       │       ├── assign-number/route.ts
│       │       └── unassign-number/route.ts
│       │
│       └── events/[eventId]/
│           ├── party-tables/route.ts      # GET all tables
│           ├── party-tables/search/route.ts
│           └── my-party-table/route.ts    # Member view
```

---

## 📅 Implementation Timeline

### Phase 1: Foundation & Refactoring (Week 1)
**Goal**: Prepare codebase for new feature

- [ ] **Task 1.1**: Create types (`src/types/partyTable.ts`)
  - TableMember interface
  - PartyTable interface
  - PartyTableSettings interface
  - Helper types (CreateTableData, UpdateTableData)

- [ ] **Task 1.2**: Extract Carpool Section component
  - Create `src/components/event/CarpoolSection.tsx`
  - Move carpool UI from event detail page
  - Update imports and state management
  - Test carpool functionality still works

- [ ] **Task 1.3**: Extract other sections from Event Detail
  - `RegistrationFormSection.tsx` (~800 lines)
  - `PaymentSection.tsx` (~600 lines)
  - `FeeBreakdownSection.tsx` (~300 lines)
  - Update main page to use components

- [ ] **Task 1.4**: Test refactored Event Detail page
  - Verify all features work
  - Check impersonation mode
  - Ensure no regressions

**Deliverable**: Event Detail page reduced from 5,667 to ~2,000 lines

---

### Phase 2: Backend Infrastructure (Week 2)
**Goal**: Build Party Table backend and APIs

- [ ] **Task 2.1**: Create business logic library
  - File: `src/lib/partyTables.ts`
  - Functions:
    - `createPartyTable()`
    - `getPartyTableById()`
    - `getPartyTablesByEvent()`
    - `updatePartyTable()`
    - `deletePartyTable()`
    - `addMembersToTable()`
    - `removeMembersFromTable()`
    - `assignTableNumber()`
    - `validateTableCapacity()`
    - `checkMemberTableConflict()`

- [ ] **Task 2.2**: Create API routes
  - POST `/api/partyTables/route.ts` - Create table
  - GET/PUT/DELETE `/api/partyTables/[tableId]/route.ts`
  - POST `/api/partyTables/[tableId]/add-members/route.ts`
  - POST `/api/partyTables/[tableId]/remove-members/route.ts`
  - POST `/api/partyTables/[tableId]/assign-number/route.ts`
  - GET `/api/events/[eventId]/party-tables/route.ts` - All tables
  - GET `/api/events/[eventId]/party-tables/search/route.ts`
  - GET `/api/events/[eventId]/my-party-table/route.ts`

- [ ] **Task 2.3**: Add session support (impersonation)
  - Use `getEffectiveSession()` in all member-facing APIs
  - Use `getServerSession()` for admin-only APIs
  - Test impersonation mode

- [ ] **Task 2.4**: Implement history logging
  - Create collection: `partyTableHistory`
  - Log table creation/deletion
  - Log member add/remove actions
  - Log table number assignments

**Deliverable**: Complete backend with 8 API routes

---

### Phase 3: Event Settings Integration (Week 2)
**Goal**: Add party table settings to event configuration

- [ ] **Task 3.1**: Update Event type definition
  - Add `hasPartyTableFeature` flag
  - Add `partyTableSettings` object
  - Update event creation/edit interfaces

- [ ] **Task 3.2**: Add settings UI to Event Edit page
  - Location: Admin Events Edit page
  - Checkbox: Enable party table feature
  - Conditional panel with:
    - Total tables (number input)
    - Default seats per table (number input)
    - Max seats per table (optional, validation)
    - Show table numbers to members (checkbox)
    - Table feature active (toggle switch)

- [ ] **Task 3.3**: Update event creation API
  - Save party table settings
  - Validate settings (totalTables > 0, etc.)

- [ ] **Task 3.4**: Update event edit API
  - Support updating party table settings
  - Handle feature enable/disable

**Deliverable**: Event settings with party table configuration

---

### Phase 4: Member UI - Party Table Section (Week 3)
**Goal**: Build member-facing table management interface

- [ ] **Task 4.1**: Create PartyTableSection component
  - File: `src/components/event/PartyTableSection.tsx`
  - Similar structure to CarpoolSection
  - Conditional rendering based on `hasPartyTableFeature`

- [ ] **Task 4.2**: Implement "Create Table" flow
  - Modal: Enter table group name (optional)
  - Select team members to join
  - Call create API
  - Show success/error messages

- [ ] **Task 4.3**: Implement "Join Table" flow
  - Modal: Enter 6-digit registration code
  - Search for table host
  - Display table info and current members
  - Select which team members join
  - Validate seat capacity
  - Call join API

- [ ] **Task 4.4**: Display user's table(s)
  - Show table group info
  - List all members in table
  - Display assigned table number (if any)
  - Show seat utilization (X/Y seats)

- [ ] **Task 4.5**: Implement "Invite Members" feature
  - Modal with 2 sections:
    - Section 1: Team members not in table (green)
    - Section 2: External members search (blue)
  - Use registration code for external search
  - Select members to invite
  - Call add-members API

- [ ] **Task 4.6**: Implement "Leave Table" action
  - Button to remove self from table
  - Confirmation dialog
  - Handle table host leaving (transfer or delete)

- [ ] **Task 4.7**: Add to Event Detail page
  - Import PartyTableSection
  - Place after Carpool section
  - Pass event and registration props
  - Test with impersonation mode

**Deliverable**: Complete member UI for table management

---

### Phase 5: Admin UI - Table Management Modal (Week 4)
**Goal**: Build admin interface with 2-tab management system

- [ ] **Task 5.1**: Create modal shell
  - File: `src/components/admin/PartyTableManagementModal.tsx`
  - Modal wrapper with close button
  - Tab navigation: "Table Groups" | "Table Numbers"
  - State management for active tab

- [ ] **Task 5.2**: Build Tab 1 - Table Groups Management
  - **List View**:
    - Display all table groups
    - Show: Group name, host, member count, table number
    - Search bar (name, company, LINE, member)
    - Filters: Assigned/Unassigned tables
  - **Actions per group**:
    - View members button → expand/collapse
    - Edit button → edit modal
    - Delete button → confirmation
  - **Member list display**:
    - Show all members with company names
    - "Remove" button per member
    - Status indicators (host, regular member)

- [ ] **Task 5.3**: Build "Add Members to Table" feature
  - Search by registration ID or name
  - Display found registration with attendee list
  - Checkbox selection for team members
  - Validation: Check if already in another table
  - Call add-members API
  - Update UI optimistically or refetch

- [ ] **Task 5.4**: Build Tab 2 - Table Number Grid
  - **Grid Layout**:
    - Cards for each table number (1 to N)
    - Show: Table number, assigned groups, members
    - Color coding:
      - Green: <80% capacity
      - Yellow: 80-99% capacity
      - Orange: 100% capacity
      - Red: >100% capacity (overbooked)
  - **Table Card Details**:
    - List assigned table groups (bold)
    - List individual members (italic)
    - Show seat count: "12/10 seats" with warning icon

- [ ] **Task 5.5**: Implement "Assign to Table" action
  - From Table Groups tab: "Assign to Table #X" button
  - Dropdown/input to select table number
  - Validation: Warn if exceeds capacity
  - Call assign-number API
  - Update both tabs

- [ ] **Task 5.6**: Implement "Add Independent Members"
  - From Table Numbers tab: "Add Members" button per table
  - Search for registrations not in any table
  - Select attendees from registration
  - Directly assign to table (without group)
  - Update member list

- [ ] **Task 5.7**: Implement "Move to Table" actions
  - **Move entire table**:
    - Button: "Move all to Table #X"
    - Select destination table
    - Confirm and execute batch move
  - **Move single group**:
    - Per group: "Move to Table #X"
    - Unassign from current, assign to new
  - **Move individual member**:
    - Per member: "Move to Table #X"
    - Remove from source, add to destination

- [ ] **Task 5.8**: Add history viewer
  - Modal/panel showing recent changes
  - Filter by table, date, user
  - Display: Action, user, timestamp, details

- [ ] **Task 5.9**: Integrate into Admin Event Detail
  - Add button: "Manage Party Tables"
  - Open PartyTableManagementModal
  - Pass event ID and settings
  - Handle modal close and refresh

**Deliverable**: Complete admin interface with dual-tab management

---

### Phase 6: Testing & Polish (Week 5)
**Goal**: Comprehensive testing and UX improvements

- [ ] **Task 6.1**: Unit Testing
  - Test validation functions
  - Test capacity checks
  - Test conflict detection
  - Test attendeeIndex handling

- [ ] **Task 6.2**: Integration Testing
  - Test create → join → assign flow
  - Test member invite flow
  - Test admin move operations
  - Test table deletion cascade

- [ ] **Task 6.3**: Impersonation Testing
  - Test admin impersonating member
  - Verify member sees correct tables
  - Test creating/joining as impersonated user
  - Verify history logs real admin

- [ ] **Task 6.4**: Edge Cases
  - Table host leaves (transfer ownership)
  - Last member leaves (auto-delete table)
  - Exceed capacity scenarios
  - Concurrent edits
  - Registration cancellation (remove from table)

- [ ] **Task 6.5**: UX Enhancements
  - Loading states for all actions
  - Success/error toast messages
  - Confirmation dialogs for destructive actions
  - Tooltips and help text
  - Responsive design (mobile support)

- [ ] **Task 6.6**: Performance Optimization
  - Pagination for large table lists
  - Debounced search
  - Optimistic UI updates
  - Cache table data with React Query (optional)

- [ ] **Task 6.7**: Documentation
  - Update admin guide
  - Create member guide for party tables
  - Document API endpoints
  - Add inline code comments

**Deliverable**: Production-ready feature with comprehensive testing

---

### Phase 7: Additional Refactoring (Week 6, Optional)
**Goal**: Further reduce Admin Event Detail page size

- [ ] **Task 7.1**: Extract Room Management
  - Move RoomManagementModal to separate file (if not already)
  - Extract room section UI

- [ ] **Task 7.2**: Extract Payment Management
  - Create PaymentManagementSection
  - Move payment deadline, slip approval

- [ ] **Task 7.3**: Create shared components
  - MemberSearchModal (shared by carpool + party table)
  - AttendeeSelector (checkbox list of team members)
  - StatusBadge (capacity, status indicators)
  - ConfirmationDialog (delete, remove actions)

**Deliverable**: Admin Event Detail reduced to ~3,000 lines

---

## 🔄 Code Reuse Opportunities

### Shared Logic (Carpool ↔ Party Table)

1. **Member Validation**
   - Check if member already in group (car/table)
   - Validate attendeeIndex existence
   - Ensure 1 member = 1 assignment

2. **Search & Filter**
   - Search by registration ID
   - Filter by name, company, LINE
   - Fuzzy matching utilities

3. **UI Components**
   - Member selection checkboxes
   - Registration code input
   - Invite modal structure
   - Status indicators

4. **API Patterns**
   - CRUD operations
   - Add/remove members
   - Assign/unassign numbers
   - History logging

**Strategy**: Create shared utilities in `src/lib/groupManagement.ts` and `src/components/shared/`

---

## ⚠️ Critical Considerations

### 1. Data Migration
- No migration needed (new feature)
- Existing events: `hasPartyTableFeature = false` by default

### 2. Validation Priority
```
High Priority:
✅ attendeeIndex-based identification (prevent duplicates)
✅ 1 person = 1 table enforcement
✅ Capacity warnings (not blocking)

Medium Priority:
⚠️ Name normalization (whitespace handling)
⚠️ Concurrent edit prevention

Low Priority:
ℹ️ Table group name uniqueness (not enforced)
```

### 3. Session Management
```typescript
// Member-facing APIs
const session = await getEffectiveSession(); // ✅ Supports impersonation

// Admin-only APIs
const session = await getServerSession(authOptions); // ✅ Real admin always
```

### 4. Performance Targets
- Event detail page load: <2s with 200 attendees
- Table grid render: <1s with 50 tables
- Search response: <500ms

### 5. Compatibility
- Firestore query limits: Use pagination for >100 tables
- Browser support: Chrome, Safari, Firefox (latest 2 versions)
- Mobile: Responsive design for tablet/phone

---

## 📊 Success Metrics

### Code Quality
- ✅ Event Detail page: <2,500 lines (from 5,667)
- ✅ Admin Event page: <4,000 lines (from 6,627)
- ✅ Component files: <1,500 lines each
- ✅ Type coverage: 100%

### Feature Completeness
- ✅ All 5 core functionalities implemented
- ✅ Impersonation mode supported
- ✅ History logging functional
- ✅ Admin can override capacity limits

### User Experience
- ✅ Intuitive table creation flow
- ✅ Clear seat availability indicators
- ✅ Fast search and filter (<500ms)
- ✅ Mobile-friendly interface

---

## 🚀 Quick Start (After Implementation)

### For Members:
1. Go to event detail page
2. Scroll to "Party Table" section
3. Click "Create Table" or "Join Table"
4. Select team members
5. View assigned table number

### For Admins:
1. Edit event → Enable "Party Table Feature"
2. Set total tables and default seats
3. Go to event detail → "Manage Party Tables"
4. **Tab 1**: View and manage table groups
5. **Tab 2**: Assign table numbers and view grid

---

## 📝 Notes

- Pattern follows Carpool implementation closely for consistency
- Reuses existing impersonation session infrastructure
- Leverages Firestore's flexible document structure
- Designed for scalability (tested with 500+ attendees)
- Can be extended with advanced features:
  - Table preferences (window, center, etc.)
  - VIP table types
  - Automated matching algorithm
  - Seating chart visualization

---

**Last Updated**: 2026-08-14
**Status**: Planning Phase
**Next Step**: Begin Phase 1 - Task 1.1 (Create types)
