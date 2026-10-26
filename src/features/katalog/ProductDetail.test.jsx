// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import ProductDetail from "./ProductDetail";

// Tamu: tidak ada sesi (bug B-1 lahir dari asumsi user selalu ada).
vi.mock("../auth/AuthContext", () => ({
  useAuth: () => ({ user: null }),
}));

vi.mock("../../data/rentals", () => ({
  quoteRental: vi.fn(() => new Promise(() => {})),
  addRental: vi.fn(),
  translateRentalError: (message) => message || "Gagal",
}));

const ITEM = {
  id: "listing-1",
  name: "Kamera Sony A7 III",
  seller: "Toko Kamera",
  location: "Bandung",
  category: "Kamera",
  category_name: "Kamera",
  description: "Body only.",
  price: 150000,
  deposit: 500000,
  stock: 5,
  rental_unit: "day",
  min_rental_duration: 2,
  available: true,
  image: "https://example.com/kamera.jpg",
};

afterEach(cleanup);

describe("ProductDetail (tamu)", () => {
  it("tamu melihat tombol aktif 'Masuk untuk sewa' dan diarahkan ke login", () => {
    const onRequireAuth = vi.fn();
    render(
      <ProductDetail
        item={ITEM}
        onBack={() => {}}
        onNavigate={() => {}}
        onRequireAuth={onRequireAuth}
      />,
    );

    const button = screen.getByRole("button", { name: "Masuk untuk sewa" });
    expect(button.disabled).toBe(false);

    fireEvent.click(button);
    expect(onRequireAuth).toHaveBeenCalledWith(ITEM);
  });

  it("pilihan jumlah mengikuti stok listing, bukan selalu 1", () => {
    render(
      <ProductDetail
        item={ITEM}
        onBack={() => {}}
        onNavigate={() => {}}
        onRequireAuth={() => {}}
      />,
    );

    const options = screen.getAllByRole("option").map((o) => o.textContent);
    expect(options).toEqual(["1 unit", "2 unit", "3 unit", "4 unit", "5 unit"]);
  });
});
