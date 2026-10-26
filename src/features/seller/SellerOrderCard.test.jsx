// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import SellerOrderCard from "./SellerOrderCard";

afterEach(cleanup);

const ORDER = {
  id: "tx-1",
  status: "payment_verify",
  store_name: "Toko Kamera",
  items: [{ name: "Kamera Sony A7 III" }],
  start_date: "2026-10-01",
  end_date: "2026-10-03",
  total_days: 3,
  subtotal: 450000,
  deposit_total: 500000,
  total: 950000,
  late_fee_total: 0,
};

function renderCard(overrides = {}) {
  const handlers = {
    onApprovePayment: vi.fn(),
    onRejectPayment: vi.fn(),
    onReloadProofs: vi.fn(),
    onMarkFeePaid: vi.fn(),
    onCancel: vi.fn(),
    onStart: vi.fn(),
    onRecordReturned: vi.fn(),
    onMarkLate: vi.fn(),
    onRateReturn: vi.fn(),
  };
  render(
    <SellerOrderCard
      order={{ ...ORDER, ...overrides }}
      proofs={[]}
      orderFee={null}
      busy={false}
      {...handlers}
    />,
  );
  return handlers;
}

describe("SellerOrderCard", () => {
  it("menampilkan periode dalam format tanggal Indonesia, bukan ISO mentah", () => {
    renderCard();
    // Format lokal bergantung ICU; yang diuji: ISO mentah tidak lagi bocor ke UI.
    expect(screen.queryByText(/2026-10-01/)).toBeNull();
  });

  it("menampilkan tombol batalkan untuk pesanan payment_verify (bug B-3)", () => {
    renderCard();

    const cancelButton = screen.getByRole("button", { name: "Batalkan" });
    fireEvent.click(cancelButton);
    expect(
      screen.getByPlaceholderText("Alasan pembatalan (untuk penyewa)"),
    ).toBeTruthy();
  });

  it("mengirim alasan pembatalan ke handler", () => {
    const handlers = renderCard();

    fireEvent.click(screen.getByRole("button", { name: "Batalkan" }));
    fireEvent.change(
      screen.getByPlaceholderText("Alasan pembatalan (untuk penyewa)"),
      { target: { value: "Barang rusak" } },
    );
    fireEvent.click(screen.getByRole("button", { name: "Kirim pembatalan" }));

    expect(handlers.onCancel).toHaveBeenCalledWith("Barang rusak");
  });

  it("tidak menawarkan pembatalan pada pesanan yang sudah selesai", () => {
    renderCard({ status: "completed" });
    expect(screen.queryByRole("button", { name: "Batalkan" })).toBeNull();
  });
});
