# FlowTech Hub — Microsoft tenant setup

This checklist is what an **admin** configures in the Azure / Microsoft 365
tenant. You do the portal clicks; the app consumes the resulting values via the
root `.env` (template: [`.env.example`](./.env.example)). Nothing here is needed
for **mock mode** — it applies when wiring auth (Build Order step 2) onward.

> Anything the code can't discover on its own is marked **TODO: fill in .env**.
> Where a permission needs tenant-admin consent, it's flagged **[admin consent]**.

---

## 1. Entra ID (Azure AD) app registration

Entra admin center → **App registrations → New registration**.

> **Topology note:** the Hub uses the **Pure BFF session** pattern — the browser
> never runs MSAL and holds no tokens. So you only need a **Web** redirect for
> the confidential-client BFF; there is **no SPA redirect** and **no "Expose an
> API" scope** to configure (those belong to the msal-react/OBO alternative we
> did not take).

1. **Name:** `FlowTech Hub`.
2. **Supported account types:** Single tenant (this organization only).
3. **Redirect URI** — add **one** platform:
   - **Web** → `http://localhost:4000/auth/redirect` (dev) and your prod BFF
     redirect (e.g. `https://hub.flowtechapps.com/auth/redirect`). This is where
     Entra returns the auth code to the confidential-client BFF.
     → keep in sync with **.env** `REDIRECT_URI`.
4. **Certificates & secrets** → **New client secret**. Copy the value once.
   → **TODO: fill in .env** `AZURE_CLIENT_SECRET` (server-side only — never in the web bundle)
5. From **Overview**, copy:
   → **TODO: fill in .env** `AZURE_TENANT_ID`, `AZURE_CLIENT_ID`

## 2. Microsoft Graph — delegated permissions

App registration → **API permissions → Add → Microsoft Graph → Delegated**.

| Permission               | Purpose                              | Admin consent?    |
| ------------------------ | ------------------------------------ | ----------------- |
| `openid`, `profile`, `email` | OIDC sign-in                     | No                |
| `offline_access`         | Refresh tokens (server-side)         | No                |
| `User.Read`              | Signed-in user's profile + photo     | No                |
| `User.ReadBasic.All`     | Employee directory                   | **[admin consent]** |
| `Calendars.Read`         | Read Outlook + company calendar      | No                |
| `Calendars.ReadWrite`    | _Only if_ creating events / RSVP     | No                |
| `Files.ReadWrite.All` **or** `Sites.ReadWrite.All` | SharePoint document library | **[admin consent]** |
| `Directory.Read.All`     | _Only if_ you want the People & Access / Document Access admin pages to correctly flag people who are bootstrap admins via their Entra **Global Administrator** role (not just the `ADMIN_EMAILS` allowlist) | **[admin consent]** |

After adding, click **Grant admin consent for <tenant>** for the flagged ones.
The requested delegated scopes are set in `.env` (`GRAPH_SCOPES`); keep them
least-privilege.

## 3. Dataverse (structured data — announcements, requests, assets)

Used from Build Order step 5+.

1. Power Platform admin center → your environment → note the **Environment URL**.
   → **TODO: fill in .env** `DATAVERSE_URL=https://<org>.crm.dynamics.com`
   → `DATAVERSE_SCOPE=https://<org>.crm.dynamics.com/.default`
2. Create an **application user** for the app registration (Settings → Users +
   permissions → Application users → New), and assign a **security role** that
   grants access to the tables the Hub uses (announcements, requests, assets).
3. The BFF requests the Dataverse token via On-Behalf-Of using the app scope.
4. **Requests table** — create a table `flowtech_request` (entity set
   `flowtech_requests`) with these columns (the code in
   `apps/api/src/dataverse/requests.ts` maps to these logical names — adjust the
   `flowtech_` prefix to match your publisher):

   | Column (logical name)    | Type            | Notes                          |
   | ------------------------ | --------------- | ------------------------------ |
   | `flowtech_type`          | Choice/Text     | `leave` / `expense` / `document` |
   | `flowtech_title`         | Text            |                                |
   | `flowtech_description`   | Multiline text  |                                |
   | `flowtech_status`        | Choice (int)    | 1 draft · 2 pending · 3 approved · 4 rejected · 5 cancelled |
   | `flowtech_requesterid`   | Text            | Entra oid                      |
   | `flowtech_requestername` | Text            |                                |
   | `flowtech_approvername`  | Text            |                                |
   | `flowtech_amount`        | Decimal         | expenses                       |
   | `flowtech_startdate`     | DateTime        | leave                          |
   | `flowtech_enddate`       | DateTime        | leave                          |

   `createdon` / `modifiedon` are system columns. Announcements and assets tables
   follow later; for now they persist in-memory in the BFF.

5. **Attendance table** — create a table (e.g. `Attendance`) with these
   columns (the code in `apps/api/src/dataverse/attendance.ts` maps to these
   logical names by default — every column name is individually overridable
   via env if your table doesn't match, since Dataverse's auto-generated
   names vary by how the table was created; see `data-table/attendance.csv`
   for a ready-to-import template):

   | Column (logical name)      | Type           | Notes                                    |
   | --------------------------- | -------------- | ----------------------------------------- |
   | `<prefix>recordtitle`      | Text           | primary name column, e.g. `Jane — 2026-08-17` |
   | `<prefix>userid`           | Text           | Entra oid                                 |
   | `<prefix>username`         | Text           |                                            |
   | `<prefix>date`             | Text           | `YYYY-MM-DD` — kept as text to match the app's local-date comparisons |
   | `<prefix>checkin`          | Text           | ISO 8601                                  |
   | `<prefix>checkout`         | Text           | blank while still punched in              |
   | `<prefix>completedtasks`   | Multiline text | one task per line                         |
   | `<prefix>tomorrowsplan`    | Multiline text |                                            |
   | `<prefix>blockers`         | Multiline text | optional                                  |

   Writes go through the app's own application user (client-credentials
   token) — same as the Requests/Expenses/Vault tables — so no per-employee
   Dataverse license is needed. Set `DATAVERSE_ATTENDANCE_TABLE` (the exact
   **entity set** name — confirm on the table's Web API metadata, Dataverse
   sometimes pluralizes oddly) and `DATAVERSE_ATTENDANCE_PREFIX` in `.env` to
   enable it; leave `DATAVERSE_ATTENDANCE_TABLE` unset to keep using the
   in-memory store.

6. **Profiles table** — one row per user, backing **My Profile → About you**
   (LinkedIn / working hours / bio / DOB / joining-date overrides). Without
   this table the values are kept in-memory only and **are lost on every
   redeploy** — set this up if you want them to actually persist. Live table
   `ft_profileses` (entity set), prefix `ft_` (the code in
   `apps/api/src/dataverse/profiles.ts` maps to these logical names by
   default — every column is individually overridable via env; see
   `data-table/profiles.csv` for a ready-to-import template):

   | Column (logical name)      | Type              | Notes                          |
   | ---------------------------- | ------------------ | -------------------------------- |
   | `ft_profilesid`             | Unique identifier | primary key (auto)             |
   | `ft_employeeidentifier`    | Text (primary name) | Entra oid — one row per user |
   | `ft_linkedinprofileurl`    | URL               |                                 |
   | `ft_workinghours`          | Text              |                                 |
   | `ft_biography`             | Text              |                                 |
   | `ft_dateofbirth`           | Date only         |                                 |
   | `ft_hiredate`              | Date only         |                                 |

   Writes go through the app's own application user (client-credentials
   token) — same as the Requests/Attendance tables. Set
   `DATAVERSE_PROFILE_TABLE` (the exact **entity set** name) and
   `DATAVERSE_PROFILE_PREFIX` in `.env` to enable it; leave
   `DATAVERSE_PROFILE_TABLE` unset to keep using the in-memory store.

7. **Quick Notes table** — one row per note, backing the private per-employee
   sticky notes on the **Quick Notes** page. Without this table, notes are
   kept in-memory only and **are lost on every redeploy**. Live table
   `ft_notes` (entity set), prefix `ft_` (the code in
   `apps/api/src/dataverse/quickNotes.ts` maps to these logical names by
   default — every column is individually overridable via env; see
   `data-table/quicknotes.csv` for a ready-to-import template):

   | Column (logical name)  | Type                              | Notes                     |
   | ------------------------ | ------------------------------------ | -------------------------- |
   | `ft_noteid`             | Unique identifier                  | primary key (auto)        |
   | `ft_notetitle`          | Single line of text, primary name column | optional — matches the "Title (optional)" field |
   | `ft_notebody`           | Multiple lines of text             | matches the "Take a note…" field |
   | `ft_notecolor`          | Single line of text                | `default`/`yellow`/`green`/`blue`/`pink`/`purple` — plain text (not Choice), same convention as the Requests table's type/status columns, so the app owns the fixed value set |
   | `ft_owneridentifier`    | Single line of text                | Entra object id (GUID) — scopes notes to their author (custom text field, not the built-in Owner lookup) |

   Writes go through the app's own application user (client-credentials
   token) — same as the Requests/Attendance/Profiles tables. Set
   `DATAVERSE_QUICKNOTE_TABLE` and `DATAVERSE_QUICKNOTE_PREFIX` in `.env` to
   enable it; leave `DATAVERSE_QUICKNOTE_TABLE` unset to keep using the
   in-memory store.

8. **Help Desk tickets table** — one row per ticket, backing the **Help
   Desk** page (internal submissions, agent triage) and the public,
   unauthenticated `/submit` form. Without this table, tickets are kept
   in-memory only and **are lost on every redeploy**; the public form's
   Dataverse write was previously a one-way mirror disconnected from what
   the ticket center actually reads — this table makes it the shared source
   of truth for both. Live table `ft_supporttickets` (entity set), prefix
   `ft_` (the code in `apps/api/src/dataverse/tickets.ts` maps to these
   logical names by default — every column is individually overridable via
   env; see `data-table/tickets.csv` for a ready-to-import template):

   | Column (logical name)       | Type                   | Notes                     |
   | ------------------------------ | ------------------------ | -------------------------- |
   | `ft_supportticketid`         | Unique identifier       | primary key (auto)        |
   | `ft_ticketsubject`           | Single line of text, primary name column | |
   | `ft_ticketdescription`       | Multiple lines of text | optional                  |
   | `ft_issuecategory`           | Single line of text    | `Access`/`Hardware`/`Software`/`Request`/`Other`/… |
   | `ft_prioritylevel`           | Single line of text    | `low`/`medium`/`high`/`urgent` — plain text, not Choice, same convention as Requests |
   | `ft_ticketstatus`            | Single line of text    | `open`/`in-progress`/`resolved`/`closed` |
   | `ft_requesteridentifier`     | Single line of text    | Entra oid, or `public:<email>` for public-form submissions |
   | `ft_requestername`           | Single line of text    | |
   | `ft_assigned`                | Single line of text    | optional — agent's name |
   | `ft_submitteremail`          | Email                   | optional — set only for public-form submissions |
   | `ft_ticketsource`            | Single line of text    | `internal` or `public-form` |

   Writes go through the app's own application user (client-credentials
   token) — same as the Requests/Attendance/Profiles/Quick Notes tables, and
   the same application user the public `/submit` form uses (no per-visitor
   Dataverse access needed). Set `DATAVERSE_TICKET_TABLE` and
   `DATAVERSE_TICKET_PREFIX` in `.env` to enable it; leave
   `DATAVERSE_TICKET_TABLE` unset to keep using the in-memory store.

9. **Projects table** — one row per project, backing the **Projects** page.
   Team-wide, not per-owner scoped — anyone with `projects.view` sees every
   row. Without this table, projects are kept in-memory only and **are lost
   on every redeploy**. Live table `ft_projectses` (entity set), prefix `ft_`
   (the code in `apps/api/src/dataverse/projects.ts` maps to these logical
   names by default — every column is individually overridable via env; see
   `data-table/projects.csv` for a ready-to-import template):

   | Column (logical name)     | Type                  | Notes                     |
   | ----------------------------- | ----------------------- | -------------------------- |
   | `ft_projectsid`             | Unique identifier      | primary key (auto)        |
   | `ft_projectname`            | Single line of text, primary name column | |
   | `ft_projectdescription`     | Single line of text    | optional                  |
   | `ft_projectstatus`          | Single line of text    | `planning`/`active`/`on-hold`/`completed` — plain text, not Choice, same convention as Requests |
   | `ft_projectowner`           | Single line of text    | display name (free text, not the built-in Owner lookup) |
   | `ft_progresspercentage`     | Whole number (0–100)   | |
   | `ft_startdate`              | Date only               | optional |
   | `ft_duedate`                | Date only               | optional |
   | `ft_projecttags`            | Single line of text    | comma-separated (e.g. `internal,platform`) |

   Writes go through the app's own application user (client-credentials
   token) — same as every other table above. Set `DATAVERSE_PROJECT_TABLE`
   and `DATAVERSE_PROJECT_PREFIX` in `.env` to enable it; leave
   `DATAVERSE_PROJECT_TABLE` unset to keep using the in-memory store.

10. **Expenses table** — one row per line item, backing the **Expenses**
    admin page (software, subscriptions, hardware, resources). Team-wide,
    not per-owner scoped. Without this table, expenses are kept in-memory
    only and **are lost on every redeploy**; the previous Dataverse write
    was a one-way mirror nothing ever read back — this table makes it the
    actual source of truth. Live table `ft_expenseses` (entity set), prefix
    `ft_` (the code in `apps/api/src/dataverse/expenses.ts` maps to these
    logical names by default — every column is individually overridable via
    env; see `data-table/expenses.csv` for a ready-to-import template):

    | Column (logical name)   | Type                | Notes                     |
    | -------------------------- | --------------------- | -------------------------- |
    | `ft_expensesid`          | Unique identifier    | primary key (auto)        |
    | `ft_assetname`           | Single line of text, primary name column | e.g. "Figma" |
    | `ft_assetcategory`       | Single line of text  | `software`/`subscription`/`hardware`/`resource`/`service`/`other` — plain text, not Choice |
    | `ft_vendorname`          | Single line of text  | optional |
    | `ft_purchaseamount`      | Currency             | |
    | `ft_currencycode`        | Single line of text  | ISO code, e.g. `USD` |
    | `ft_paymentrecurrence`   | Single line of text  | `one-time`/`monthly`/`quarterly`/`yearly` |
    | `ft_assetstatus`         | Single line of text  | `active`/`pending`/`cancelled` |
    | `ft_renewaldate`         | Date only            | optional |

    **The live table has no Owner or Notes column.** Those two `Expense`
    fields are silently dropped on write (never sent, never read back) until
    you add matching columns and set `DATAVERSE_EXPENSE_OWNER_COL` /
    `DATAVERSE_EXPENSE_NOTES_COL` in `.env` — recommended: `ft_ownername`
    (Single line of text) and `ft_notes` (Multiline text), or whatever
    logical names Dataverse assigns.

    Writes go through the app's own application user (client-credentials
    token) — same as every other table above. Set `DATAVERSE_EXPENSE_TABLE`
    and `DATAVERSE_EXPENSE_PREFIX` in `.env` to enable it; leave
    `DATAVERSE_EXPENSE_TABLE` unset to keep using the in-memory store.

11. **Admin Notes table** — one row per note, backing the **Admin Notes**
    ideas board (`notes.view`, administrators only). Team-wide, not
    per-author scoped — every admin sees every note. Without this table,
    notes are kept in-memory only and **are lost on every redeploy**; the
    previous Dataverse write was a one-way mirror (and dropped `authorId`
    and `pinned` entirely) — this table makes it the actual source of
    truth. Live table `ft_adminnoteses` (entity set), prefix `ft_` (the
    code in `apps/api/src/dataverse/notes.ts` maps to these logical names
    by default — every column is individually overridable via env; see
    `data-table/notes.csv` for a ready-to-import template):

    | Column (logical name)   | Type                | Notes                     |
    | -------------------------- | --------------------- | -------------------------- |
    | `ft_adminnotesid`        | Unique identifier    | primary key (auto)        |
    | `ft_updatetitle`         | Single line of text, primary name column | |
    | `ft_updatebody`          | Single line of text  | |
    | `ft_authoridentifier`    | Single line of text  | Entra oid |
    | `ft_authorname`          | Single line of text  | |
    | `ft_ispinned`            | Yes/No               | pinned notes sort first |

    Writes go through the app's own application user (client-credentials
    token) — same as every other table above. Set `DATAVERSE_NOTE_TABLE`
    and `DATAVERSE_NOTE_PREFIX` in `.env` to enable it; leave
    `DATAVERSE_NOTE_TABLE` unset to keep using the in-memory store.

12. **Announcements table** — one row per post, backing company **News**
    (`/news`, every employee) and the admin **Content → Announcements**
    editor. Team-wide, no per-owner scoping. Without this table,
    announcements are kept in-memory only and **are lost on every
    redeploy**. Live table `ft_announcements` (entity set), prefix `ft_`
    (the code in `apps/api/src/dataverse/announcements.ts` maps to these
    logical names by default — every column is individually overridable
    via env; see `data-table/announcements.csv` for a ready-to-import
    template):

    | Column (logical name)        | Type                | Notes                     |
    | -------------------------------- | --------------------- | -------------------------- |
    | `ft_announcementid`            | Unique identifier    | primary key (auto)        |
    | `ft_announcementtitle`         | Single line of text, primary name column | |
    | `ft_announcementbody`          | Single line of text  | |
    | `ft_authorname`                | Single line of text  | |
    | `ft_announcementcategory`      | Single line of text  | optional |
    | `ft_ispinned`                  | Single line of text  | stored/read as the literal strings `"true"`/`"false"` — this column is Text, not a native Yes/No |
    | `ft_bannerimage`               | Multiple lines of text | optional banner image — holds the uploaded image's base64 data URI. The table also has its own `ft_imageurl` (Single line of text, hard-capped at 4,000 chars) which is too small for an upload and is **not** used by the app; `ft_bannerimage` was added specifically for this. |

    Writes go through the app's own application user (client-credentials
    token) — same as every other table above. Set
    `DATAVERSE_ANNOUNCEMENT_TABLE` and `DATAVERSE_ANNOUNCEMENT_PREFIX` in
    `.env` to enable it; leave `DATAVERSE_ANNOUNCEMENT_TABLE` unset to keep
    using the in-memory store.

13. **Roles table** — one row per role, backing the admin **Roles** page.
    Without this table, custom roles and their capability grants are kept
    in-memory only and **are lost on every redeploy**, reverting every
    non-default assignment. This data is also read on every authenticated
    request (RBAC check), so — unlike every other table above — it is **not**
    queried from Dataverse per-request; instead the app hydrates an in-memory
    cache from it once at boot, and every admin edit writes through to both
    Dataverse and that cache (see `apps/api/src/auth/permissions.ts`'s file
    comment). Create a table (e.g. `Role`) with these columns (the code in
    `apps/api/src/dataverse/roles.ts` maps to these logical names by default
    — every column is individually overridable via env; see
    `data-table/roles.csv` for a ready-to-import template — though you don't
    strictly need to pre-populate it: the two system roles, Employee and
    Administrator, are auto-created on first read if the table is empty).
    Live table `ft_userroles` (entity set), prefix `ft_`:

    | Column (logical name)     | Type                  | Notes                     |
    | ------------------------------ | ----------------------- | -------------------------- |
    | `ft_userroleid`              | Unique identifier      | primary key (auto)        |
    | `ft_rolename`                | Single line of text, primary name column | display name |
    | `ft_roleidentifier`          | Single line of text    | stable id — `role-employee`/`role-admin` for the two system roles (**never** rename these two values, auth logic hardcodes them), or a generated slug for custom roles |
    | `ft_roledescription`         | Single line of text    | optional |
    | `ft_rolecapabilities`        | Single line of text    | comma-separated capability keys — even the Administrator role's full list is ~600 chars, well under the 4,000-char cap |
    | `ft_systemroleflag`          | Yes/No                 | protects Employee/Administrator from deletion/rename |

    Writes go through the app's own application user (client-credentials
    token) — same as every other table above. Set `DATAVERSE_ROLE_TABLE`
    (the exact **entity set** name — confirm on the table's Web API
    metadata) and `DATAVERSE_ROLE_PREFIX` in `.env` to enable it; leave
    `DATAVERSE_ROLE_TABLE` unset to keep using the in-memory store.

14. **Role Assignments table** — one row per user, backing the admin
    **People & Access** page (who has which role). Required alongside the
    Roles table above for role changes to actually persist — a role
    definition with no durable assignments is of limited use. Live table
    `ft_userroleassignments` (entity set), prefix `ft_`:

    | Column (logical name)          | Type                  | Notes                     |
    | ----------------------------------- | ----------------------- | -------------------------- |
    | `ft_userroleassignmentid`         | Unique identifier      | primary key (auto)        |
    | `ft_useridentifier`               | Single line of text, primary name column | Entra oid — one row per user |
    | `ft_assignedrole`                 | Single line of text    | comma-separated role keys, e.g. `role-employee,role-manager` |

    Writes go through the app's own application user (client-credentials
    token) — same as every other table above. Set
    `DATAVERSE_ROLEASSIGNMENT_TABLE` and `DATAVERSE_ROLEASSIGNMENT_PREFIX`
    in `.env` to enable it; leave `DATAVERSE_ROLEASSIGNMENT_TABLE` unset to
    keep using the in-memory store. Both this table and the Roles table
    need to be configured together for the feature to actually persist.

15. **Grants table** — one row per user, backing the admin **Document
    Access** page (per-person grants for Documents/Client Documents, on top
    of whatever their role already gives them). Without this table, grants
    are kept in-memory only and **are lost on every redeploy**, silently
    revoking everyone's document access. Same hot-path caching as the Roles
    tables above — this data is read on every authenticated request, so it's
    hydrated into an in-memory cache at boot rather than queried per-request
    (see `apps/api/src/auth/permissions.ts`). Live table `ft_grantses`
    (entity set), prefix `ft_`:

    | Column (logical name)   | Type                | Notes                     |
    | -------------------------- | --------------------- | -------------------------- |
    | `ft_grantsid`             | Unique identifier    | primary key (auto)        |
    | `ft_useridentifier`       | Single line of text, primary name column | Entra oid — one row per user |
    | `ft_usercapabilities`     | Single line of text  | comma-separated capability keys, e.g. `clientdocs.view,clientdocs.manage` |

    Writes go through the app's own application user (client-credentials
    token) — same as every other table above. Set `DATAVERSE_GRANT_TABLE`
    (the exact **entity set** name — confirm on the table's Web API
    metadata) and `DATAVERSE_GRANT_PREFIX` in `.env` to enable it; leave
    `DATAVERSE_GRANT_TABLE` unset to keep using the in-memory store.

16. **Holidays table** — one row per company holiday, shown on everyone's
    **Calendar** and managed from `/admin/events`. Without this table,
    holidays are kept in-memory only and **are lost on every redeploy**.
    Simple per-request pattern, not hot-path cached. Live table
    `ft_holidayses` (entity set), prefix `ft_` (the code in
    `apps/api/src/dataverse/holidays.ts` maps to these logical names by
    default — every column is individually overridable via env):

    | Column (logical name)   | Type                | Notes                     |
    | -------------------------- | --------------------- | -------------------------- |
    | `ft_holidaysid`           | Unique identifier    | primary key (auto)        |
    | `ft_holidayname`          | Single line of text, primary name column | |
    | `ft_date`                 | Date only            | read/written as `YYYY-MM-DD`; the Web API returns Date Only columns as a full ISO datetime at UTC midnight, truncated back to the date part in code |
    | `ft_description`          | Multiple lines of text | optional |

    Writes go through the app's own application user (client-credentials
    token) — same as every other table above. Set `DATAVERSE_HOLIDAY_TABLE`
    and `DATAVERSE_HOLIDAY_PREFIX` in `.env` to enable it; leave
    `DATAVERSE_HOLIDAY_TABLE` unset to keep using the in-memory store.

17. **Company Events table** — one row per company-wide calendar event,
    shown on everyone's **Calendar** and managed from `/admin/events`. This
    is the fallback for setups without a shared M365 mailbox: when
    `COMPANY_CALENDAR_MAILBOX` (§2) is set, company events are written
    straight to that real Outlook calendar instead and this table is never
    read; when it's unset, this table takes over as the durable store (see
    `companyEventsMode()` in `apps/api/src/routes/api.ts`). Without either
    one configured, company events are kept in-memory only and **are lost on
    every redeploy**. Live table `ft_companyeventses` (entity set), prefix
    `ft_` (the code in `apps/api/src/dataverse/companyEvents.ts` maps to
    these logical names by default — every column is individually
    overridable via env):

    | Column (logical name)   | Type                | Notes                     |
    | -------------------------- | --------------------- | -------------------------- |
    | `ft_companyeventsid`      | Unique identifier    | primary key (auto)        |
    | `ft_subject`              | Single line of text, primary name column | |
    | `ft_start`                | Single line of text  | full ISO 8601 datetime, stored as text |
    | `ft_end`                  | Single line of text  | full ISO 8601 datetime, stored as text |
    | `ft_isallday`             | Yes/No               | |
    | `ft_location`             | Single line of text  | optional |

    Writes go through the app's own application user (client-credentials
    token) — same as every other table above. Set
    `DATAVERSE_COMPANYEVENT_TABLE` and `DATAVERSE_COMPANYEVENT_PREFIX` in
    `.env` to enable it; leave `DATAVERSE_COMPANYEVENT_TABLE` unset to keep
    using the in-memory store.

## 4. SharePoint (document center)

1. Identify the target **site** and **document library** for Hub documents,
   e.g. site `https://<tenant>.sharepoint.com/sites/FlowTechHub`, library
   `Documents`.
   → **TODO: fill in .env** `SHAREPOINT_HOSTNAME`, `SHAREPOINT_SITE_PATH`, `SHAREPOINT_LIBRARY_NAME`
2. The BFF resolves the **site ID** and **drive ID** by name via Graph
   (`/sites/{hostname}:{path}` → `/drives`) and **caches** them server-side, so
   you don't paste raw IDs. Permissions are still enforced by SharePoint per user.

## 5. Power Automate (notifications & approvals)

Create two **HTTP-triggered** flows ("When an HTTP request is received"):

1. **`notify`** — accepts `{ title, body, audience }`, posts a Teams/email
   message. Copy its trigger URL.
   → **TODO: fill in .env** `FLOW_NOTIFY_URL` (server-side only)
2. **`approval`** — accepts the request payload the BFF POSTs (`requestId`,
   `type`, `title`, `requesterName`, `callbackUrl`, `callbackSecret`, …), starts
   an approval (Teams/email adaptive card), and on completion **calls back** the
   BFF. Copy its trigger URL.
   → **TODO: fill in .env** `FLOW_APPROVAL_URL` (server-side only)

   The callback: the flow does an **HTTP POST** to the `callbackUrl` it received,
   with header `x-flow-secret: <callbackSecret>` and body
   `{ requestId, decision: "approved"|"rejected", approverName }`. The BFF endpoint
   is `POST /flows/approval-callback` (outside the session-gated API; authenticated
   solely by the secret).
   → **TODO: fill in .env** `FLOW_CALLBACK_SECRET` (a long random string; the BFF
   rejects callbacks unless it's set and matches)

> Flow trigger URLs contain a signature — treat them as secrets. They live only
> in the BFF's `.env` and are never exposed to the browser.

## 6. Admin role gating

1. Create an Entra **security group**, e.g. `FlowTech Hub Admins`, and add
   admins. Copy its **object ID**.
   → **TODO: fill in .env** `ADMIN_GROUP_ID`
2. The BFF maps membership in this group to the `admin` app role in `/api/me`;
   the Admin panel and admin-only endpoints are gated on it.

---

## Values you must paste into `.env`

| `.env` key                | Source                                            |
| ------------------------- | ------------------------------------------------- |
| `AZURE_TENANT_ID`         | App registration → Overview                       |
| `AZURE_CLIENT_ID`         | App registration → Overview                       |
| `AZURE_CLIENT_SECRET`     | App registration → Certificates & secrets         |
| `REDIRECT_URI`            | Must match the Web redirect URI you registered    |
| `SHAREPOINT_*`            | Target site + library                             |
| `DATAVERSE_URL` / `_SCOPE`| Power Platform environment                        |
| `FLOW_NOTIFY_URL`         | Power Automate `notify` flow trigger              |
| `FLOW_APPROVAL_URL`       | Power Automate `approval` flow trigger            |
| `ADMIN_GROUP_ID`          | Entra security group object ID                    |

Fill these, restart the BFF, and it flips from **MOCK** to **LIVE** automatically
(it keys off `AZURE_CLIENT_ID` + `AZURE_CLIENT_SECRET`).
