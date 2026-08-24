/**
 * Seed/mock data so the UI runs end-to-end before the Microsoft tenant is
 * wired. Every value here is fictional. Replaced by real Graph/Dataverse/
 * SharePoint reads in later build-order steps.
 */
import type {
  Announcement,
  ApprovalRequest,
  Asset,
  AttendanceRecord,
  CalendarEvent,
  DirectoryPerson,
  DocumentItem,
  Notification,
  QuickLink,
  UserProfile,
} from '@flowtech/shared';

// Fixed "today" anchor is computed at request time in routes; helpers here
// build ISO strings relative to a passed-in base date.
const at = (base: Date, hour: number, min = 0) => {
  const d = new Date(base);
  d.setHours(hour, min, 0, 0);
  return d.toISOString();
};

export const mockUser: UserProfile = {
  id: 'me-0001',
  displayName: 'Alex Morgan',
  givenName: 'Alex',
  jobTitle: 'Operations Strategist',
  department: 'Strategy & Operations',
  mail: 'alex.morgan@flowtechapps.com',
  // roles + capabilities are resolved by the RBAC layer at /api/me (the mock
  // user is treated as a bootstrap admin); these are placeholder defaults.
  roles: ['Administrator'],
  capabilities: [],
};

/**
 * Mock people records for the celebrations widget — birthdays + hire dates.
 * Dates are derived from a base "now" so a few always fall in the look-ahead
 * window and the widget is populated in demo/mock mode. birthYear/hireYear set
 * the person's age / tenure.
 */
export function mockCelebrationRecords(now = new Date()) {
  const md = (offsetDays: number, year: number) => {
    const d = new Date(now.getTime() + offsetDays * 864e5);
    const mm = String(d.getUTCMonth() + 1).padStart(2, '0');
    const dd = String(d.getUTCDate()).padStart(2, '0');
    return `${year}-${mm}-${dd}`;
  };
  return [
    { id: 'p-004', name: 'Sofia Reyes', jobTitle: 'Process Analyst', department: 'Delivery', birthday: md(2, 1994) },
    { id: 'p-003', name: 'Daniel Cho', jobTitle: 'Implementation Lead', department: 'Delivery', birthday: md(9, 1989) },
    { id: 'p-006', name: 'Hannah Klein', jobTitle: 'Client Success Manager', department: 'Delivery', birthday: md(23, 1992) },
    { id: 'p-001', name: 'Alex Morgan', jobTitle: 'Operations Strategist', department: 'Strategy & Operations', start: md(4, 2021) },
    { id: 'p-005', name: 'Marcus Webb', jobTitle: 'Data & Systems Engineer', department: 'Technology', start: md(12, 2019) },
    { id: 'p-002', name: 'Priya Nair', jobTitle: 'Founder & Principal', department: 'Leadership', start: md(18, 2016) },
  ];
}

export const mockDirectory: DirectoryPerson[] = [
  {
    id: 'p-002',
    displayName: 'Priya Nair',
    jobTitle: 'Founder & Principal',
    department: 'Leadership',
    mail: 'priya.nair@flowtechapps.com',
    officeLocation: 'HQ',
    // top of the org — no manager
  },
  {
    id: 'p-001',
    displayName: 'Alex Morgan',
    jobTitle: 'Operations Strategist',
    department: 'Strategy & Operations',
    mail: 'alex.morgan@flowtechapps.com',
    officeLocation: 'Remote',
    managerId: 'p-002',
  },
  {
    id: 'p-003',
    displayName: 'Daniel Cho',
    jobTitle: 'Implementation Lead',
    department: 'Delivery',
    mail: 'daniel.cho@flowtechapps.com',
    officeLocation: 'HQ',
    managerId: 'p-002',
  },
  {
    id: 'p-005',
    displayName: 'Marcus Webb',
    jobTitle: 'Data & Systems Engineer',
    department: 'Technology',
    mail: 'marcus.webb@flowtechapps.com',
    officeLocation: 'Remote',
    managerId: 'p-002',
  },
  {
    id: 'p-004',
    displayName: 'Sofia Reyes',
    jobTitle: 'Process Analyst',
    department: 'Delivery',
    mail: 'sofia.reyes@flowtechapps.com',
    officeLocation: 'Remote',
    managerId: 'p-003',
  },
  {
    id: 'p-006',
    displayName: 'Hannah Klein',
    jobTitle: 'Client Success Manager',
    department: 'Delivery',
    mail: 'hannah.klein@flowtechapps.com',
    officeLocation: 'HQ',
    managerId: 'p-003',
  },
];

export const mockAnnouncements: Announcement[] = [
  {
    id: 'a-001',
    title: 'Q3 strategy offsite — save the date',
    body: 'The annual strategy offsite is confirmed for the last week of the quarter. Agenda and travel details to follow. Strategy first. Systems that follow.',
    author: 'Priya Nair',
    publishedDateTime: new Date(Date.now() - 2 * 864e5).toISOString(),
    category: 'Company',
    pinned: true,
  },
  {
    id: 'a-002',
    title: 'DocCreate v2 rollout begins Monday',
    body: 'The new document generation workflow goes live for all delivery teams next week. Training sessions are on the calendar.',
    author: 'Daniel Cho',
    publishedDateTime: new Date(Date.now() - 5 * 864e5).toISOString(),
    category: 'Product',
  },
  {
    id: 'a-003',
    title: 'New QR Trax asset labels available',
    body: 'Request printed asset labels through the Asset Tracker. Bulk orders ship within two business days.',
    author: 'Marcus Webb',
    publishedDateTime: new Date(Date.now() - 9 * 864e5).toISOString(),
    category: 'Operations',
  },
];

// Events created via POST /calendar while in mock mode — there's no real
// mailbox to write to, so they're kept here for the session, letting a
// follow-up GET /calendar or /calendar/today actually show what was created.
export const mockCreatedEvents: CalendarEvent[] = [];

const overlaps = (e: CalendarEvent, startIso: string, endIso: string) =>
  new Date(e.end).getTime() >= new Date(startIso).getTime() &&
  new Date(e.start).getTime() <= new Date(endIso).getTime();

export function removeMockCreatedEvent(id: string): boolean {
  const idx = mockCreatedEvents.findIndex((e) => e.id === id);
  if (idx === -1) return false;
  mockCreatedEvents.splice(idx, 1);
  return true;
}

export const mockCreatedEventsInRange = (startIso: string, endIso: string): CalendarEvent[] =>
  mockCreatedEvents.filter((e) => overlaps(e, startIso, endIso));

export function mockTodayEvents(base = new Date()): CalendarEvent[] {
  return [
    {
      id: 'e-001',
      subject: 'Delivery standup',
      start: at(base, 9, 30),
      end: at(base, 9, 45),
      isAllDay: false,
      location: 'Teams',
      organizer: 'Daniel Cho',
      onlineMeetingUrl: 'https://teams.microsoft.com/l/meetup-join/mock',
      source: 'company',
    },
    {
      id: 'e-002',
      subject: 'Client portfolio review — Meridian',
      start: at(base, 11, 0),
      end: at(base, 12, 0),
      isAllDay: false,
      location: 'HQ — Room A',
      organizer: 'Hannah Klein',
      source: 'personal',
    },
    {
      id: 'e-003',
      subject: 'PRISM data model working session',
      start: at(base, 14, 30),
      end: at(base, 15, 30),
      isAllDay: false,
      location: 'Teams',
      organizer: 'Marcus Webb',
      onlineMeetingUrl: 'https://teams.microsoft.com/l/meetup-join/mock2',
      source: 'personal',
    },
  ];
}

/** Spread a handful of events across an arbitrary [start, end] range so the
 *  month/week views have something to show in mock mode. */
export function mockRangeEvents(startIso: string, endIso: string): CalendarEvent[] {
  const start = new Date(startIso);
  const end = new Date(endIso);
  const events: CalendarEvent[] = [];
  const templates = [
    { subject: 'Delivery standup', hour: 9, min: 30, dur: 15, source: 'company' as const, online: true, org: 'Daniel Cho' },
    { subject: 'Client portfolio review', hour: 11, dur: 60, source: 'personal' as const, loc: 'HQ — Room A', org: 'Hannah Klein' },
    { subject: 'PRISM working session', hour: 14, min: 30, dur: 60, source: 'personal' as const, online: true, org: 'Marcus Webb' },
    { subject: 'Strategy sync', hour: 16, dur: 45, source: 'company' as const, loc: 'Teams', online: true, org: 'Priya Nair' },
  ];
  const cursor = new Date(start);
  cursor.setHours(0, 0, 0, 0);
  let day = 0;
  while (cursor <= end) {
    const dow = cursor.getDay();
    if (dow !== 0 && dow !== 6) {
      // Weekdays: 1–2 events, rotating templates so the calendar looks populated.
      const count = day % 3 === 0 ? 2 : 1;
      for (let i = 0; i < count; i++) {
        const t = templates[(day + i) % templates.length];
        const s = new Date(cursor);
        s.setHours(t.hour, t.min ?? 0, 0, 0);
        const e = new Date(s.getTime() + t.dur * 60000);
        events.push({
          id: `e-${cursor.toISOString().slice(0, 10)}-${i}`,
          subject: t.subject,
          start: s.toISOString(),
          end: e.toISOString(),
          isAllDay: false,
          location: t.loc,
          organizer: t.org,
          onlineMeetingUrl: t.online ? 'https://teams.microsoft.com/l/meetup-join/mock' : undefined,
          source: t.source,
        });
      }
    }
    cursor.setDate(cursor.getDate() + 1);
    day++;
  }
  return events;
}

export const mockRequests: ApprovalRequest[] = [
  {
    id: 'r-000',
    type: 'expense',
    title: 'Conference ticket — Ops Summit',
    description: 'Annual operations conference registration.',
    status: 'pending',
    requesterId: 'me-0001',
    requesterName: 'Alex Morgan',
    approverName: 'Priya Nair',
    amount: 349,
    createdDateTime: new Date(Date.now() - 0.5 * 864e5).toISOString(),
    updatedDateTime: new Date(Date.now() - 0.5 * 864e5).toISOString(),
  },
  {
    id: 'r-001',
    type: 'leave',
    title: 'Annual leave — 3 days',
    description: 'Family trip.',
    status: 'pending',
    requesterId: 'p-004',
    requesterName: 'Sofia Reyes',
    approverName: 'Daniel Cho',
    startDate: new Date(Date.now() + 10 * 864e5).toISOString(),
    endDate: new Date(Date.now() + 13 * 864e5).toISOString(),
    createdDateTime: new Date(Date.now() - 1 * 864e5).toISOString(),
    updatedDateTime: new Date(Date.now() - 1 * 864e5).toISOString(),
  },
  {
    id: 'r-002',
    type: 'expense',
    title: 'Client site travel reimbursement',
    description: 'Rail + lodging for Meridian visit.',
    status: 'pending',
    requesterId: 'p-006',
    requesterName: 'Hannah Klein',
    approverName: 'Priya Nair',
    amount: 428.5,
    createdDateTime: new Date(Date.now() - 3 * 864e5).toISOString(),
    updatedDateTime: new Date(Date.now() - 2 * 864e5).toISOString(),
  },
];

export const mockNotifications: Notification[] = [
  {
    id: 'n-001',
    title: 'Your expense request was approved',
    kind: 'approval',
    read: false,
    createdDateTime: new Date(Date.now() - 4 * 36e5).toISOString(),
    link: '/requests',
  },
  {
    id: 'n-002',
    title: 'New announcement: Q3 strategy offsite',
    kind: 'announcement',
    read: false,
    createdDateTime: new Date(Date.now() - 2 * 864e5).toISOString(),
    link: '/news',
  },
];

export const mockAssets: Asset[] = [
  {
    id: 'as-001',
    tag: 'FT-LT-0142',
    name: 'MacBook Pro 14"',
    location: 'HQ — Desk 12',
    status: 'active',
    assignedTo: 'Sofia Reyes',
    lastServicedDate: new Date(Date.now() - 60 * 864e5).toISOString(),
  },
  {
    id: 'as-002',
    tag: 'FT-MN-0088',
    name: 'Dell 27" Monitor',
    location: 'Remote — M. Webb',
    status: 'active',
    assignedTo: 'Marcus Webb',
  },
  {
    id: 'as-003',
    tag: 'FT-PR-0007',
    name: 'Label Printer',
    location: 'HQ — Ops closet',
    status: 'in-service',
  },
];

export const mockDocuments: DocumentItem[] = [
  { id: 'd-f1', name: 'Client Deliverables', kind: 'folder', path: '/Client Deliverables' },
  { id: 'd-f2', name: 'SOPs & Playbooks', kind: 'folder', path: '/SOPs & Playbooks' },
  { id: 'd-f3', name: 'Templates', kind: 'folder', path: '/Templates' },
  {
    id: 'd-1',
    name: 'Strategy Framework.pdf',
    kind: 'file',
    mimeType: 'application/pdf',
    size: 482_133,
    path: '/Strategy Framework.pdf',
    lastModifiedBy: 'Priya Nair',
    lastModifiedDateTime: new Date(Date.now() - 7 * 864e5).toISOString(),
  },
  {
    id: 'd-2',
    name: 'Onboarding Checklist.docx',
    kind: 'file',
    mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    size: 34_902,
    path: '/Onboarding Checklist.docx',
    lastModifiedBy: 'Hannah Klein',
    lastModifiedDateTime: new Date(Date.now() - 14 * 864e5).toISOString(),
  },
];

export const mockCourses: DocumentItem[] = [
  { id: 'c-f1', name: 'Onboarding', kind: 'folder', path: '/Onboarding' },
  { id: 'c-f2', name: 'Sales Training', kind: 'folder', path: '/Sales Training' },
  {
    id: 'c-1',
    name: 'Welcome to FlowTech.mp4',
    kind: 'file',
    mimeType: 'video/mp4',
    size: 84_213_000,
    path: '/Welcome to FlowTech.mp4',
    lastModifiedBy: 'Priya Nair',
    lastModifiedDateTime: new Date(Date.now() - 21 * 864e5).toISOString(),
  },
  {
    id: 'c-2',
    name: 'Brand Guidelines.pdf',
    kind: 'file',
    mimeType: 'application/pdf',
    size: 1_204_400,
    path: '/Brand Guidelines.pdf',
    lastModifiedBy: 'Hannah Klein',
    lastModifiedDateTime: new Date(Date.now() - 10 * 864e5).toISOString(),
  },
];

/** Demo attendance history — a few past days for the mock user, plus a
 *  couple of colleagues currently "working" so the admin team dashboard
 *  isn't empty. Seeded once at boot (see routes/attendance.ts). */
export function mockAttendanceSeed(base: Date = new Date()): AttendanceRecord[] {
  const dateStr = (d: Date) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const dayAgo = (n: number) => {
    const d = new Date(base);
    d.setDate(d.getDate() - n);
    return d;
  };

  const history: AttendanceRecord[] = [1, 2, 3, 4].map((n, i) => {
    const day = dayAgo(n);
    const now = new Date().toISOString();
    return {
      id: `att-hist-${n}`,
      userId: mockUser.id,
      userName: mockUser.displayName,
      date: dateStr(day),
      checkIn: at(day, 9, 30),
      checkOut: at(day, 18, i % 2 === 0 ? 15 : 45),
      status: 'present',
      completedTasks: ['Reviewed pending requests', 'Synced with delivery team', 'Updated project tracker'].slice(
        0,
        2 + (i % 2),
      ),
      tomorrowsPlan: ['Ship the intranet attendance system', 'Follow up on client onboarding', 'Prep weekly report'][
        i % 3
      ],
      blockers: i === 1 ? 'Waiting on design sign-off' : undefined,
      createdDateTime: now,
      updatedDateTime: now,
    };
  });

  const currentlyWorking: AttendanceRecord[] = [
    { person: mockDirectory[0], hour: 9 },
    { person: mockDirectory[2], hour: 10 },
  ].map(({ person, hour }, i) => {
    const now = new Date().toISOString();
    return {
      id: `att-live-${i}`,
      userId: person.id,
      userName: person.displayName,
      date: dateStr(base),
      checkIn: at(base, hour, 15),
      checkOut: null,
      status: 'present',
      completedTasks: [],
      tomorrowsPlan: '',
      createdDateTime: now,
      updatedDateTime: now,
    };
  });

  return [...history, ...currentlyWorking];
}

// Seeded from the FlowTech SharePoint site. URLs that aren't public services
// default to '#' — an admin sets the real link in Admin → Quick Links.
let qlSeq = 0;
const ql = (label: string, category: string, url = '#'): QuickLink => ({
  id: `ql-${++qlSeq}`,
  label,
  url,
  category,
});

export const quickLinks: QuickLink[] = [
  // Company Sites
  ql('briqbi', 'Company Sites', 'https://briqbi.com'),
  ql('QR Trax', 'Company Sites'),
  ql('FlowTech', 'Company Sites', 'https://flowtechapps.com'),
  ql('DocCreate', 'Company Sites'),
  ql('MILA PM', 'Company Sites'),
  ql('Viala', 'Company Sites'),

  // briqbi Quick Access
  ql('briqbi intranet', 'briqbi Quick Access'),
  ql('Invoices and payments', 'briqbi Quick Access'),
  ql('briqbi Document templates', 'briqbi Quick Access'),
  ql('Submit New Job Posting', 'briqbi Quick Access'),
  ql('briqbi hiring tracker', 'briqbi Quick Access'),
  ql('briqbi Candidate Resumes', 'briqbi Quick Access'),
  ql('briqbi Payroll', 'briqbi Quick Access'),
  ql('briqbi Employee Directory', 'briqbi Quick Access'),

  // Utility Links
  ql('Canva', 'Utility Links', 'https://www.canva.com'),
  ql('VPN', 'Utility Links'),
  ql('Hottinger VPS', 'Utility Links'),
  ql('Google Analytics', 'Utility Links', 'https://analytics.google.com'),

  // Quick Links
  ql('Quickbooks', 'Quick Links', 'https://quickbooks.intuit.com'),
  ql('Monday.com', 'Quick Links', 'https://monday.com'),
  ql('Payoneer', 'Quick Links', 'https://www.payoneer.com'),

  // Social Links
  ql('FT LinkedIn', 'Social Links', 'https://www.linkedin.com'),
  ql('FT Facebook', 'Social Links', 'https://www.facebook.com'),
  ql('FT Instagram', 'Social Links', 'https://www.instagram.com'),
  ql('DocCreate LinkedIn', 'Social Links', 'https://www.linkedin.com'),
  ql('@DocCreate Instagram', 'Social Links', 'https://www.instagram.com'),
  ql('DocCreate YouTube', 'Social Links', 'https://www.youtube.com'),

  // Analytics
  ql('FlowTech Google Analytics', 'Analytics', 'https://analytics.google.com'),
  ql('FlowTech Google Search', 'Analytics', 'https://search.google.com/search-console'),
  ql('FlowTech Clarity', 'Analytics', 'https://clarity.microsoft.com'),
  ql('DocCreate Google Analytics', 'Analytics', 'https://analytics.google.com'),
  ql('DocCreate Search Console', 'Analytics', 'https://search.google.com/search-console'),
  ql('briqbi Google Analytics', 'Analytics', 'https://analytics.google.com'),

  // Client Web Analytics & Report
  ql('Alexis Clarity', 'Client Web Analytics', 'https://clarity.microsoft.com'),
  ql('Alexis Google Analytics', 'Client Web Analytics', 'https://analytics.google.com'),
  ql('Alexis Google Search Console', 'Client Web Analytics', 'https://search.google.com/search-console'),
  ql('VertualIVA Clarity', 'Client Web Analytics', 'https://clarity.microsoft.com'),
  ql('VertualIVA Google Search Console', 'Client Web Analytics', 'https://search.google.com/search-console'),
  ql('VertualIVA Google Analytics', 'Client Web Analytics', 'https://analytics.google.com'),
  ql('Saber HT Clarity', 'Client Web Analytics', 'https://clarity.microsoft.com'),
  ql('Saber HT Google Analytics', 'Client Web Analytics', 'https://analytics.google.com'),
  ql('Saber HT Google Search Console', 'Client Web Analytics', 'https://search.google.com/search-console'),
];
