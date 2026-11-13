import { ALL_TOURS, TourEventDto } from './contracts';

// Oldalbemutató (TICKET-53): a látott bemutatók tárolt állapota és az események hatása. Egyetlen
// forrás: az API (`users.tour_state`) és a kliensoldali mock (`mock-engine.ts`) is ezt használja.

/** A tárolt állapot: a látott bemutatók, és a lépés, amelynél bezárta őket. */
export type StoredTourState = { seen: string[]; closedAt: Record<string, number> };

const isObject = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === 'object' && !Array.isArray(value);

/** A tárolt JSON olvasása; a hibás vagy hiányzó részek üresnek számítanak. */
export function readTourState(value: unknown): StoredTourState {
  const state: Record<string, unknown> = isObject(value) ? value : {};
  const seen = Array.isArray(state.seen)
    ? state.seen.filter((id): id is string => typeof id === 'string')
    : [];
  const closedAt = isObject(state.closedAt)
    ? Object.fromEntries(
        Object.entries(state.closedAt).filter(
          (entry): entry is [string, number] => typeof entry[1] === 'number',
        ),
      )
    : {};
  return { seen, closedAt };
}

/**
 * Az esemény hatása: a `seen` lista ismétlés nélkül bővül (`all` → `*`), a `reset` üríti (a
 * lépésstatisztika megmarad). Ha nincs változás, ugyanazt az objektumot adja vissza.
 */
export function applyTourEvent(
  state: StoredTourState,
  event: TourEventDto,
): StoredTourState {
  if (event.kind === 'reset') {
    return state.seen.length === 0 ? state : { ...state, seen: [] };
  }
  const id = event.kind === 'all' ? ALL_TOURS : event.id;
  const seen = state.seen.includes(id) ? state.seen : [...state.seen, id];
  if (event.kind === 'all' || state.closedAt[event.id] === event.step) {
    return seen === state.seen ? state : { ...state, seen };
  }
  return { seen, closedAt: { ...state.closedAt, [event.id]: event.step } };
}
