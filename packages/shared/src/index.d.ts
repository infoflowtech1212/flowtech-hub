/**
 * @flowtech/shared — DTOs shared by the React web app and the Express BFF.
 * These are the ONLY shapes that cross the /api boundary. Keep them free of
 * any Microsoft Graph / Dataverse-specific fields; the BFF maps upstream
 * responses into these clean contracts.
 */
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
export interface UserProfile {
    id: string;
    displayName: string;
    givenName?: string;
    jobTitle?: string;
    department?: string;
    mail?: string;
    /** BFF-proxied photo URL (never a raw Graph URL). */
    photoUrl?: string;
    /** App roles derived from Entra group membership. */
    roles: AppRole[];
}
export type AppRole = 'employee' | 'admin';
export interface DirectoryPerson {
    id: string;
    displayName: string;
    jobTitle?: string;
    department?: string;
    mail?: string;
    officeLocation?: string;
    mobilePhone?: string;
    photoUrl?: string;
}
export interface OrgChart {
    person: DirectoryPerson;
    manager?: DirectoryPerson;
    reports: DirectoryPerson[];
}
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
export interface CalendarEvent {
    id: string;
    subject: string;
    start: string;
    end: string;
    isAllDay: boolean;
    location?: string;
    organizer?: string;
    onlineMeetingUrl?: string;
    /** 'personal' = user's mailbox, 'company' = shared company calendar. */
    source: 'personal' | 'company';
}
export interface Announcement {
    id: string;
    title: string;
    body: string;
    author: string;
    publishedDateTime: string;
    category?: string;
    pinned?: boolean;
}
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
    amount?: number;
    startDate?: string;
    endDate?: string;
    createdDateTime: string;
    updatedDateTime: string;
}
export interface Notification {
    id: string;
    title: string;
    body?: string;
    kind: 'approval' | 'announcement' | 'mention' | 'system';
    read: boolean;
    createdDateTime: string;
    link?: string;
}
export interface Asset {
    id: string;
    tag: string;
    name: string;
    location?: string;
    status: 'active' | 'in-service' | 'retired';
    assignedTo?: string;
    lastServicedDate?: string;
}
export interface QuickLink {
    id: string;
    label: string;
    url: string;
    /** lucide-react icon name, resolved on the client. */
    icon?: string;
}
//# sourceMappingURL=index.d.ts.map