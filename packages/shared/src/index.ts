/**
 * @flowtech/shared — DTOs shared by the React web app and the Express BFF.
 * These are the ONLY shapes that cross the /api boundary. Keep them free of
 * any Microsoft Graph / Dataverse-specific fields; the BFF maps upstream
 * responses into these clean contracts.
 */

// ---------------------------------------------------------------------------
// Common
// ---------------------------------------------------------------------------

/** Typed error envelope returned by every BFF endpoint on failure. */
export interface ApiError {
  error: {
    code: string;
    message: string;
    /** Correlates with the server log line (pino requestId). */
    requestId?: string;
  };
}

/** Cursor/offset paged collection. */
export interface Paged<T> {
  items: T[];
  /** Opaque token for the next page, or null when exhausted. */
  nextCursor: string | null;
  total?: number;
}

// ---------------------------------------------------------------------------
// Auth / identity  (GET /api/me)
// ---------------------------------------------------------------------------

export interface UserProfile {
  id: string;
  displayName: string;
  givenName?: string;
  jobTitle?: string;
  department?: string;
  mail?: string;
  /** BFF-proxied photo URL (never a raw Graph URL). */
  photoUrl?: string;
  /** Names of the roles assigned to this user (see Role). */
  roles: string[];
  /** Effective capabilities (union of assigned roles + admin-group bootstrap).
   *  This is what the client and BFF authorize against. */
  capabilities: Capability[];
}

// ---------------------------------------------------------------------------
// Authorization model (RBAC)
// ---------------------------------------------------------------------------

/**
 * Granular, per-feature capabilities. The admin bundles these into roles and
 * assigns roles to employees. Both the BFF (authoritative) and the client
 * (UX only) gate on these strings.
 */
export type Capability =
  // Employee-facing features
  | 'directory.view'
  | 'documents.view'
  | 'documents.upload'
  | 'documents.delete'
  | 'documents.share'
  | 'calendar.view'
  | 'requests.view'
  | 'requests.create'
  | 'requests.approve'
  | 'announcements.view'
  | 'announcements.manage'
  | 'notifications.view'
  | 'assets.view'
  | 'assets.manage'
  | 'projects.view'
  | 'projects.manage'
  | 'helpdesk.view'
  | 'helpdesk.manage'
  | 'legal.view'
  | 'legal.manage'
  | 'clientdocs.view'
  | 'clientdocs.manage'
  | 'courses.view'
  | 'courses.upload'
  | 'courses.share'
  | 'vault.view'
  | 'vault.manage'
  | 'expenses.view'
  | 'expenses.manage'
  | 'notes.view'
  | 'holidays.manage'
  | 'attendance.view'
  | 'attendance.manage'
  // Admin console
  | 'admin.access'
  | 'admin.roles.manage'
  | 'admin.users.manage'
  | 'admin.content.manage'
  | 'admin.settings.manage';

/** Metadata describing each capability, for rendering the admin role editor. */
export interface CapabilityInfo {
  key: Capability;
  label: string;
  group: string;
  description: string;
}

/** A named, editable bundle of capabilities. */
export interface Role {
  id: string;
  name: string;
  description?: string;
  capabilities: Capability[];
  /** System roles (Employee/Admin) can't be deleted; their key roles are fixed. */
  system?: boolean;
}

/** A person and the roles assigned to them (admin People & Access view). */
export interface RoleAssignment {
  userId: string;
  displayName: string;
  mail?: string;
  jobTitle?: string;
  roleIds: string[];
  /** True when the user is a bootstrap admin via the Entra admin group. */
  bootstrapAdmin?: boolean;
}

// ---------------------------------------------------------------------------
// Employee directory  (GET /api/directory, /api/directory/:id)
// ---------------------------------------------------------------------------

export interface DirectoryPerson {
  id: string;
  displayName: string;
  jobTitle?: string;
  department?: string;
  mail?: string;
  officeLocation?: string;
  mobilePhone?: string;
  photoUrl?: string;
  /** Manager's id — used to build the organisation chart. */
  managerId?: string;
  // Enriched profile fields (from Microsoft, or the Hub-managed supplement).
  /** Date of birth (YYYY-MM-DD). */
  birthday?: string;
  /** Joining / hire date (YYYY-MM-DD). */
  hireDate?: string;
  /** LinkedIn profile URL (Hub-managed). */
  linkedIn?: string;
  /** Working hours, free text e.g. "Mon–Fri, 9:00–18:00 IST" (Hub-managed). */
  workingHours?: string;
  /** Short bio (Hub-managed). */
  bio?: string;
  /** Reporting manager's display name (resolved for the profile card). */
  managerName?: string;
}

/** Hub-managed supplement to a person's Microsoft profile, edited by admins. */
export interface PersonProfileSupplement {
  linkedIn?: string;
  workingHours?: string;
  bio?: string;
  /** Admin overrides used when the Microsoft field is empty. */
  birthday?: string;
  hireDate?: string;
}

export interface OrgChart {
  person: DirectoryPerson;
  manager?: DirectoryPerson;
  reports: DirectoryPerson[];
}

// ---------------------------------------------------------------------------
// Document center  (GET /api/documents, POST /api/documents)
// ---------------------------------------------------------------------------

/** Which SharePoint-library-backed document surface a request targets. */
export type LibraryScope = 'documents' | 'clientdocs' | 'courses';

export interface DocumentItem {
  id: string;
  name: string;
  kind: 'folder' | 'file';
  size?: number;
  mimeType?: string;
  webUrl?: string;
  lastModifiedDateTime?: string;
  lastModifiedBy?: string;
  /** Path relative to the library root, used to navigate folders. */
  path: string;
}

// ---------------------------------------------------------------------------
// Calendar  (GET /api/calendar)
// ---------------------------------------------------------------------------

export interface CalendarEvent {
  id: string;
  subject: string;
  start: string; // ISO 8601
  end: string; // ISO 8601
  isAllDay: boolean;
  location?: string;
  organizer?: string;
  onlineMeetingUrl?: string;
  /** 'personal' = user's mailbox, 'company' = shared company calendar. */
  source: 'personal' | 'company';
}

// ---------------------------------------------------------------------------
// Company holidays  (GET /api/holidays)
// ---------------------------------------------------------------------------

export interface Holiday {
  id: string;
  name: string;
  /** Calendar date, YYYY-MM-DD (no time — holidays are all-day, company-wide). */
  date: string;
  description?: string;
}

// ---------------------------------------------------------------------------
// Announcements / news  (GET /api/announcements)
// ---------------------------------------------------------------------------

export interface Announcement {
  id: string;
  title: string;
  body: string;
  author: string;
  publishedDateTime: string;
  category?: string;
  pinned?: boolean;
  /** Optional banner image; a category-tinted banner is shown when absent. */
  imageUrl?: string;
}

// ---------------------------------------------------------------------------
// Requests & approvals  (GET/POST /api/requests)
// ---------------------------------------------------------------------------

export type RequestType = 'leave' | 'expense' | 'document';
export type RequestStatus = 'draft' | 'pending' | 'approved' | 'rejected' | 'cancelled';

export interface ApprovalRequest {
  id: string;
  type: RequestType;
  title: string;
  description?: string;
  status: RequestStatus;
  requesterId: string;
  requesterName: string;
  approverName?: string;
  amount?: number; // expense
  startDate?: string; // leave
  endDate?: string; // leave
  createdDateTime: string;
  updatedDateTime: string;
}

// ---------------------------------------------------------------------------
// Attendance  (GET/POST /api/attendance, GET /api/admin/attendance)
// ---------------------------------------------------------------------------

/** Computed/display-only status for a calendar day cell — never persisted. */
export type AttendanceDayStatus = 'present' | 'absent' | 'weekend' | 'holiday';

/** One employee's punch-in/punch-out cycle for a single calendar day. */
export interface AttendanceRecord {
  id: string;
  userId: string;
  userName: string;
  /** YYYY-MM-DD, server-local date the shift started. */
  date: string;
  checkIn: string; // ISO 8601
  checkOut: string | null; // null while still punched in
  /** A record only exists once punched in, so this is always 'present'. */
  status: 'present';
  completedTasks: string[];
  tomorrowsPlan: string;
  blockers?: string;
  createdDateTime: string;
  updatedDateTime: string;
}

/** Today's punch state for the current user — drives the punch card. */
export interface AttendanceToday {
  record: AttendanceRecord | null;
  state: 'working' | 'not-checked-in' | 'done';
}

/** One calendar cell for the month view. */
export interface AttendanceDaySummary {
  date: string; // YYYY-MM-DD
  status: AttendanceDayStatus;
}

/** Admin "who's working right now" row. */
export interface AttendanceLiveEntry {
  userId: string;
  userName: string;
  checkIn: string;
  elapsedMinutes: number;
}

// ---------------------------------------------------------------------------
// Notifications  (GET /api/notifications)
// ---------------------------------------------------------------------------

export interface Notification {
  id: string;
  title: string;
  body?: string;
  kind: 'approval' | 'announcement' | 'mention' | 'system';
  read: boolean;
  createdDateTime: string;
  link?: string;
}

// ---------------------------------------------------------------------------
// Assets (QR Trax)  (GET /api/assets)
// ---------------------------------------------------------------------------

export interface Asset {
  id: string;
  tag: string;
  name: string;
  location?: string;
  status: 'active' | 'in-service' | 'retired';
  assignedTo?: string;
  lastServicedDate?: string;
}

// ---------------------------------------------------------------------------
// Quick links (dashboard)
// ---------------------------------------------------------------------------

export interface QuickLink {
  id: string;
  label: string;
  url: string;
  /** lucide-react icon name, resolved on the client. */
  icon?: string;
  /** Custom logo (data URI or image URL); overrides the auto favicon. */
  logo?: string;
  /** Group heading on the App Links page (e.g. "Company Sites"). */
  category?: string;
}

// ---------------------------------------------------------------------------
// Projects
// ---------------------------------------------------------------------------

export type ProjectStatus = 'planning' | 'active' | 'on-hold' | 'completed';

export interface Project {
  id: string;
  name: string;
  description?: string;
  status: ProjectStatus;
  owner: string;
  /** 0–100 percent complete. */
  progress: number;
  startDate?: string;
  dueDate?: string;
  tags?: string[];
  createdDateTime: string;
}

// ---------------------------------------------------------------------------
// Help Desk (tickets)
// ---------------------------------------------------------------------------

export type TicketPriority = 'low' | 'medium' | 'high' | 'urgent';
export type TicketStatus = 'open' | 'in-progress' | 'resolved' | 'closed';

export interface Ticket {
  id: string;
  subject: string;
  description?: string;
  category: string;
  priority: TicketPriority;
  status: TicketStatus;
  requesterId: string;
  requesterName: string;
  assignee?: string;
  createdDateTime: string;
  updatedDateTime: string;
}

// ---------------------------------------------------------------------------
// Legal register
// ---------------------------------------------------------------------------

export type LegalType = 'contract' | 'nda' | 'policy' | 'agreement' | 'other';
export type LegalStatus = 'draft' | 'in-review' | 'signed' | 'expired';

export interface LegalDocument {
  id: string;
  title: string;
  type: LegalType;
  status: LegalStatus;
  counterparty?: string;
  owner: string;
  effectiveDate?: string;
  expiryDate?: string;
  createdDateTime: string;
}

// ---------------------------------------------------------------------------
// Client documents
// ---------------------------------------------------------------------------

export interface ClientDocument {
  id: string;
  name: string;
  client: string;
  category?: string;
  size?: number;
  uploadedBy?: string;
  uploadedDateTime: string;
  url?: string;
}

// ---------------------------------------------------------------------------
// Celebrations  (upcoming birthdays + work anniversaries)
// ---------------------------------------------------------------------------

export type CelebrationKind = 'birthday' | 'work-anniversary';

export interface Celebration {
  id: string;
  personName: string;
  jobTitle?: string;
  department?: string;
  kind: CelebrationKind;
  /** The upcoming occurrence date this year/next, YYYY-MM-DD. */
  date: string;
  /** Whole days until the occurrence (0 = today). */
  daysUntil: number;
  /** Years completed on that date (work anniversaries only). */
  years?: number;
}

export interface Celebrations {
  birthdays: Celebration[];
  workAnniversaries: Celebration[];
}

// ---------------------------------------------------------------------------
// Quick notes  (private per-employee scratch notes)
// ---------------------------------------------------------------------------

export type QuickNoteColor = 'default' | 'yellow' | 'green' | 'blue' | 'pink' | 'purple';

export interface QuickNote {
  id: string;
  title?: string;
  body: string;
  color: QuickNoteColor;
  createdDateTime: string;
  updatedDateTime: string;
}

// ---------------------------------------------------------------------------
// Expense tracker  (software, hardware, subscriptions, resources)
// ---------------------------------------------------------------------------

export type ExpenseCategory =
  | 'software'
  | 'subscription'
  | 'hardware'
  | 'resource'
  | 'service'
  | 'other';
export type ExpenseRecurrence = 'one-time' | 'monthly' | 'quarterly' | 'yearly';
export type ExpenseStatus = 'active' | 'pending' | 'cancelled';

export interface Expense {
  id: string;
  /** What the spend is for, e.g. "Figma", "AWS", "Adobe CC". */
  item: string;
  category: ExpenseCategory;
  vendor?: string;
  amount: number;
  /** ISO currency code, e.g. USD, INR, EUR. */
  currency: string;
  recurrence: ExpenseRecurrence;
  status: ExpenseStatus;
  /** Person/team that owns or pays for this line. */
  owner?: string;
  /** Next renewal/billing date (YYYY-MM-DD) for recurring items. */
  renewalDate?: string;
  notes?: string;
  createdDateTime: string;
  updatedDateTime: string;
}

// ---------------------------------------------------------------------------
// Admin notes / ideas board  (visible to admins only)
// ---------------------------------------------------------------------------

/** A private note or idea shared between administrators only. */
export interface AdminNote {
  id: string;
  title: string;
  body: string;
  authorId: string;
  authorName: string;
  pinned?: boolean;
  createdDateTime: string;
  updatedDateTime: string;
}

// ---------------------------------------------------------------------------
// Password vault
// ---------------------------------------------------------------------------

export type VaultScope = 'open' | 'personal';

/**
 * A vault entry's metadata. The secret itself is WRITE-ONLY — accepted on
 * create/update but never returned by the API (`secretSet` reports whether one
 * exists). Real deployments must encrypt secrets at rest in a secrets backend;
 * the mock store is metadata-only and not a secure store.
 */
export interface VaultEntry {
  id: string;
  title: string;
  username?: string;
  url?: string;
  notes?: string;
  category?: string;
  scope: VaultScope;
  ownerId?: string;
  ownerName?: string;
  /** True when a secret has been stored for this entry (the value is never returned). */
  secretSet: boolean;
  updatedDateTime: string;
}
