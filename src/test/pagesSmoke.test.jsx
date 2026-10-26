// @vitest-environment jsdom
/*
 * Smoke test render: halaman yang dipecah pada Fase 4 harus tetap bisa
 * dirender dengan data kosong dari lapisan data (tanpa Supabase).
 * Tujuan utamanya menangkap error runtime (prop hilang, hook salah urutan),
 * bukan menguji tampilan.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";

const authState = vi.hoisted(() => ({
  current: {
    user: { id: "user-1", name: "Budi Santoso", email: "budi@example.com", isSeller: true },
    hasSellerAccess: true,
    storeApplication: null,
    submitStoreApplication: () => {},
    logout: () => {},
  },
}));

vi.mock("../features/auth/AuthContext", () => ({
  useAuth: () => authState.current,
}));

vi.mock("../data/rentals", () => ({
  listRentals: vi.fn(() => Promise.resolve([])),
  getPaymentsForRental: vi.fn(() => Promise.resolve([])),
  getMyReviewedRentalIds: vi.fn(() => Promise.resolve([])),
  getLateFeeForRental: vi.fn(() => Promise.resolve(null)),
  cancelRental: vi.fn(),
  submitPayment: vi.fn(),
  openDispute: vi.fn(),
  createReview: vi.fn(),
  decidePayment: vi.fn(),
  decideLateFee: vi.fn(),
  startRental: vi.fn(),
  recordReturn: vi.fn(),
  markOverdue: vi.fn(),
  applyLateFee: vi.fn(),
  quoteRental: vi.fn(),
  addRental: vi.fn(),
  translateRentalError: (message) => message || "Gagal",
}));

vi.mock("../data/listings", () => ({
  fetchListings: vi.fn(() => Promise.resolve([])),
  fetchCategories: vi.fn(() => Promise.resolve([])),
  listMyListings: vi.fn(() => Promise.resolve([])),
  removeListing: vi.fn(),
  saveListing: vi.fn(),
  updateListingAvailability: vi.fn(),
}));

vi.mock("../data/wishlist", () => ({
  getWishlist: vi.fn(() => Promise.resolve([])),
  toggleWishlist: vi.fn(),
}));

vi.mock("../data/uploads", () => ({
  uploadPaymentProof: vi.fn(),
  uploadListingImage: vi.fn(),
  validateImageFile: () => "",
  IMAGE_ALLOWED_TYPES: ["image/png"],
  MAX_LISTING_IMAGES: 5,
}));

vi.mock("../data/admin", () => ({
  listStores: vi.fn(() => Promise.resolve([])),
  listUsers: vi.fn(() => Promise.resolve([])),
  adminListListings: vi.fn(() => Promise.resolve([])),
  setStoreStatus: vi.fn(),
  setUserStatus: vi.fn(),
  setUserRole: vi.fn(),
  setListingStatus: vi.fn(),
}));

import ConsumerOrdersPage from "../features/rental/ConsumerOrdersPage";
import SellerItems from "../features/seller/SellerItems";
import SellerOrders from "../features/seller/SellerOrders";
import SellerOnboardingPage from "../features/seller/SellerOnboardingPage";
import Navbar from "../ui/Navbar";
import AdminStores from "../features/admin/pages/AdminStores";
import AdminUsers from "../features/admin/pages/AdminUsers";
import AdminListings from "../features/admin/pages/AdminListings";

afterEach(() => {
  cleanup();
  authState.current = {
    ...authState.current,
    hasSellerAccess: true,
    storeApplication: null,
  };
});

describe("halaman hasil pemecahan Fase 4", () => {
  it("ConsumerOrdersPage merender header penyewa dan keadaan kosong", async () => {
    render(<ConsumerOrdersPage onNavigate={() => {}} onSellerIntent={() => {}} />);
    expect(await screen.findByText("Halo, Budi")).toBeTruthy();
    expect(await screen.findByText("Belum ada transaksi rental.")).toBeTruthy();
    expect(await screen.findByText("Wishlist masih kosong.")).toBeTruthy();
  });

  it("SellerItems merender daftar kosong beserta filter", async () => {
    render(<SellerItems store={{ id: "store-1" }} />);
    expect(await screen.findByText("Barang Saya")).toBeTruthy();
    expect(await screen.findByText("Belum ada barang di sini")).toBeTruthy();
  });

  it("SellerOrders merender ringkasan dan keadaan kosong", async () => {
    render(<SellerOrders onChanged={() => {}} />);
    expect(await screen.findByText("Pesanan Saya")).toBeTruthy();
    expect(await screen.findByText("Belum ada permintaan rental.")).toBeTruthy();
  });

  it("SellerOnboardingPage menampilkan wizard saat belum ada ajuan", () => {
    authState.current = { ...authState.current, hasSellerAccess: false };
    render(<SellerOnboardingPage onNavigate={() => {}} />);
    expect(screen.getByText("Ajukan dirimu jadi seller")).toBeTruthy();
    expect(screen.getByLabelText("Nama toko / seller")).toBeTruthy();
  });

  it("Navbar merender tautan utama untuk user login", () => {
    render(<Navbar onNavigate={() => {}} currentPage="home" />);
    expect(screen.getByText("Beranda")).toBeTruthy();
    expect(screen.getByText("Cari Barang")).toBeTruthy();
    expect(screen.getByText("Dashboard")).toBeTruthy();
  });

  it.each([
    ["AdminStores", AdminStores, "Stores"],
    ["AdminUsers", AdminUsers, "Users"],
    ["AdminListings", AdminListings, "Listings"],
  ])("%s merender daftar kosong", async (_name, Page, heading) => {
    render(<Page />);
    expect(await screen.findByRole("heading", { name: heading, level: 1 })).toBeTruthy();
    expect(
      await screen.findByText(/Pilih .* dari daftar untuk melihat detail/),
    ).toBeTruthy();
  });
});
