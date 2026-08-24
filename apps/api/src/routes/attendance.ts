/**
 * Personal punch-in/punch-out + EOD summary routes. Uses the Dataverse-backed
 * store when DATAVERSE_ATTENDANCE_TABLE is configured (live mode only);
 * otherwise falls back to the in-memory store — same branch pattern as
 * /vault (see useLocalVaultStore in routes/intranet.ts).
 */
import { Router, type NextFunction, type Request, type Response } from 'express';
import { z } from 'zod';
import { USE_MOCKS } from '../config.js';
import { mockAttendanceSeed, mockUser } from '../mocks.js';
import { requireCapability } from '../auth/middleware.js';
import { getMyProfile } from '../graph/me.js';
import * as store from '../store/attendance.js';
import {
  attendanceDataverseEnabled,
  dvGetTodayRecord,
  dvListRecordsFor,
  dvPunchIn,
  dvPunchOut,
} from '../dataverse/attendance.js';

export const attendanceRouter = Router();

// Demo data so the punch card + team dashboard aren't empty on first load.
if (USE_MOCKS) store.seedAttendance(mockAttendanceSeed());

const isMock = (req: Request) => req.auth?.isMock ?? USE_MOCKS;
const useLocalStore = (req: Request) => isMock(req) || !attendanceDataverseEnabled();

const who = (req: Request) => {
  const auth = req.auth!;
  return { id: auth.userId };
};

/** Only needed where the name is actually written (punch-in) — avoids an extra Graph call on every read. */
const resolveName = async (req: Request): Promise<string> => {
  const auth = req.auth!;
  return auth.isMock ? mockUser.displayName : (await getMyProfile(auth)).displayName;
};

/** Async-handler wrapper matching the `live()` convention elsewhere in api.ts. */
const h =
  (fn: (req: Request, res: Response) => Promise<void>) =>
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      await fn(req, res);
    } catch (err) {
      next(err);
    }
  };

attendanceRouter.get(
  '/today',
  requireCapability('attendance.view'),
  h(async (req, res) => {
    const me = who(req);
    const record = useLocalStore(req)
      ? (store.getTodayRecord(me.id) ?? null)
      : ((await dvGetTodayRecord(me.id, store.dateStr())) ?? null);
    const state = !record ? 'not-checked-in' : record.checkOut ? 'done' : 'working';
    res.json({ record, state });
  }),
);

attendanceRouter.get(
  '/',
  requireCapability('attendance.view'),
  h(async (req, res) => {
    const from = req.query.from ? String(req.query.from) : undefined;
    const to = req.query.to ? String(req.query.to) : undefined;
    const me = who(req);
    const items = useLocalStore(req)
      ? store.listRecordsFor(me.id, from, to)
      : await dvListRecordsFor(me.id, from, to);
    res.json({ items, nextCursor: null, total: items.length });
  }),
);

attendanceRouter.get(
  '/calendar',
  requireCapability('attendance.view'),
  h(async (req, res) => {
    const from = req.query.from ? String(req.query.from) : undefined;
    const to = req.query.to ? String(req.query.to) : undefined;
    if (!from || !to) {
      res.status(400).json({ error: { code: 'bad_request', message: 'from and to are required' } });
      return;
    }
    const me = who(req);
    const items = useLocalStore(req)
      ? store.calendarFor(me.id, from, to)
      : store.buildCalendar(
          (await dvListRecordsFor(me.id, from, to)).map((r) => r.date),
          from,
          to,
        );
    res.json({ items });
  }),
);

attendanceRouter.post(
  '/punch-in',
  requireCapability('attendance.view'),
  h(async (req, res) => {
    const me = who(req);
    try {
      const name = await resolveName(req);
      if (useLocalStore(req)) {
        res.status(201).json(store.punchIn(me.id, name));
        return;
      }
      const today = store.dateStr();
      if (await dvGetTodayRecord(me.id, today)) throw new Error('already_punched_in');
      res.status(201).json(await dvPunchIn(me.id, name, today));
    } catch (err) {
      if (err instanceof Error && err.message === 'already_punched_in') {
        res.status(409).json({ error: { code: 'already_punched_in', message: 'Already punched in today.' } });
        return;
      }
      throw err;
    }
  }),
);

const punchOutBody = z.object({
  completedTasks: z.array(z.string().min(1)).min(1),
  tomorrowsPlan: z.string().min(1).max(2000),
  blockers: z.string().max(2000).optional(),
});
attendanceRouter.post(
  '/punch-out',
  requireCapability('attendance.view'),
  h(async (req, res) => {
    const parsed = punchOutBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: { code: 'bad_request', message: parsed.error.message } });
      return;
    }
    const me = who(req);
    try {
      if (useLocalStore(req)) {
        res.json(store.punchOut(me.id, parsed.data));
        return;
      }
      const record = await dvGetTodayRecord(me.id, store.dateStr());
      if (!record) throw new Error('not_punched_in');
      if (record.checkOut) throw new Error('already_punched_out');
      res.json(await dvPunchOut(record.id, parsed.data));
    } catch (err) {
      const code = err instanceof Error ? err.message : 'conflict';
      if (code === 'not_punched_in' || code === 'already_punched_out') {
        res.status(409).json({ error: { code, message: 'Cannot punch out.' } });
        return;
      }
      throw err;
    }
  }),
);
