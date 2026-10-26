/*
 * Test — deriveRentalTimeline: derivasi timeline murni dari status backend.
 */
import { describe, expect, it } from "vitest";
import {
  deriveRentalTimeline,
  RENTAL_TIMELINE_STEPS,
} from "./rentalTimeline";
import { TRANSACTION_STATUS } from "./constants";

const T = TRANSACTION_STATUS;

describe("deriveRentalTimeline", () => {
  it("mengembalikan null untuk data kosong / status di luar kontrak", () => {
    expect(deriveRentalTimeline(null)).toBeNull();
    expect(deriveRentalTimeline({})).toBeNull();
    expect(deriveRentalTimeline({ status: "status_liar" })).toBeNull();
  });

  it("pending: hanya langkah pertama tercapai & current", () => {
    const t = deriveRentalTimeline({ status: T.PENDING });
    expect(t.cancelled).toBe(false);
    expect(t.currentKey).toBe(T.PENDING);
    expect(t.steps[0]).toMatchObject({ reached: true, current: true });
    expect(t.steps.slice(1).every((s) => !s.reached && !s.current)).toBe(true);
  });

  it("payment_verify → confirmed → ongoing: progres bertahap", () => {
    const idxOf = (t, key) => t.steps.findIndex((s) => s.key === key);
    for (const st of [T.PAYMENT_VERIFY, T.CONFIRMED, T.ONGOING]) {
      const t = deriveRentalTimeline({ status: st });
      const idx = idxOf(t, st);
      expect(t.steps[idx].current).toBe(true);
      expect(t.steps[idx].reached).toBe(true);
      // langkah sebelum idx tercapai, sesudahnya belum
      expect(t.steps.slice(0, idx).every((s) => s.reached && !s.current)).toBe(true);
      expect(t.steps.slice(idx + 1).every((s) => !s.reached && !s.current)).toBe(true);
    }
  });

  it("completed: semua langkah tercapai, langkah terakhir current", () => {
    const t = deriveRentalTimeline({ status: T.COMPLETED });
    expect(t.steps.every((s) => s.reached)).toBe(true);
    expect(t.steps.at(-1).current).toBe(true);
  });

  it("overdue: minimal ongoing tercapai, badge meta = Terlambat", () => {
    const t = deriveRentalTimeline({ status: T.OVERDUE });
    const ongoingIdx = RENTAL_TIMELINE_STEPS.findIndex((s) => s.key === T.ONGOING);
    expect(t.steps.slice(0, ongoingIdx + 1).every((s) => s.reached)).toBe(true);
    expect(t.meta.label).toBe("Terlambat");
    // langkah terakhir yang tercapai ditandai current (overdue bukan langkah list)
    expect(t.steps[ongoingIdx].current).toBe(true);
  });

  it("disputed: progres minimal ongoing, meta = Sengketa", () => {
    const t = deriveRentalTimeline({ status: T.DISPUTED });
    const ongoingIdx = RENTAL_TIMELINE_STEPS.findIndex((s) => s.key === T.ONGOING);
    expect(t.steps[ongoingIdx].reached).toBe(true);
    expect(t.meta.className).toBe("status-rejected");
    expect(t.currentKey).toBe(T.DISPUTED);
  });

  it("regresi: disputed pada rental yang sudah dikembalikan → completed tercapai (CATATAN-O: open_dispute berlaku di ongoing/overdue/completed)", () => {
    const t = deriveRentalTimeline({
      status: T.DISPUTED,
      actual_return_date: "2026-10-10",
    });
    const completedIdx = RENTAL_TIMELINE_STEPS.findIndex((s) => s.key === T.COMPLETED);
    expect(t.steps[completedIdx].reached).toBe(true);
    expect(t.steps[completedIdx].current).toBe(true);
    expect(t.steps[completedIdx - 1].reached).toBe(true);
    // tanpa actual_return_date tetap minimal-ongoing — TIDAK progres palsu
    const t2 = deriveRentalTimeline({ status: T.DISPUTED });
    expect(t2.steps[completedIdx].reached).toBe(false);
  });

  it("cancelled: terminal — hanya pending tercapai, sisa diredupkan", () => {
    const t = deriveRentalTimeline({ status: T.CANCELLED });
    expect(t.cancelled).toBe(true);
    expect(t.steps[0]).toMatchObject({ reached: true, current: false });
    expect(t.steps.slice(1).every((s) => !s.reached && !s.current)).toBe(true);
  });
});
