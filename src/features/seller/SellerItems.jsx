import { useEffect, useMemo, useState } from "react";
import {
  fetchCategories,
  listMyListings,
  removeListing,
  updateListingAvailability,
} from "../../data/listings";
import { translateRentalError } from "../../data/rentals";
import ListingForm from "./ListingForm";
import SellerListingCard from "./SellerListingCard";

/*
 * Barang Saya (seller) — ERD v2.
 * Data dari direct SELECT listings (RLS-scoped: hanya listing toko milik
 * sesi yang terlihat). Tambah/edit via RPC save_listing (validasi server;
 * harga/stok tidak dipercaya dari client). Kategori dari tabel categories.
 * Form (ListingForm) menangani unggah gambar ke Supabase Storage.
 */
export default function SellerItems({ store }) {
  const [items, setItems] = useState(null);
  const [categories, setCategories] = useState([]);
  const [loadError, setLoadError] = useState("");
  const [actionError, setActionError] = useState("");
  const [query, setQuery] = useState("");
  // 'all' | 'active' | 'inactive' — nilai logika, bukan label tampilan.
  const [status, setStatus] = useState("all");
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState(null);

  useEffect(() => {
    let active = true;
    fetchCategories()
      .then((cats) => {
        if (active) setCategories(cats);
      })
      .catch(() => {
        if (active) setCategories([]);
      });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    let active = true;
    listMyListings()
      .then((data) => {
        if (active) {
          setItems(data);
          setLoadError("");
        }
      })
      .catch(() => {
        if (active) {
          setItems([]);
          setLoadError("Gagal memuat barang toko. Coba muat ulang.");
        }
      });
    return () => {
      active = false;
    };
  }, [store]);

  const isLoading = items === null;

  const visibleItems = useMemo(
    () =>
      (items || []).filter(
        (item) =>
          item.name.toLowerCase().includes(query.toLowerCase()) &&
          (status === "all" ||
            (status === "active" && item.available) ||
            (status === "inactive" && !item.available)),
      ),
    [items, query, status],
  );

  const openForm = (item) => {
    setEditing(item);
    setShowForm(true);
  };

  const closeForm = () => {
    setEditing(null);
    setShowForm(false);
  };

  const toggleAvailability = async (item) => {
    setActionError("");
    try {
      await updateListingAvailability(item.id, !item.available);
      setItems((current) =>
        current.map((listing) =>
          listing.id === item.id
            ? { ...listing, available: !listing.available }
            : listing,
        ),
      );
    } catch (err) {
      setActionError(translateRentalError(err?.message));
    }
  };

  const removeItem = async (item) => {
    setActionError("");
    try {
      await removeListing(item.id);
      setItems((current) => current.filter((listing) => listing.id !== item.id));
    } catch (err) {
      setActionError(translateRentalError(err?.message));
    }
  };

  return (
    <div className="seller-items">
      <div className="items-header">
        <div>
          <h1 className="seller-page-title">Barang Saya</h1>
          <p className="seller-page-desc">Kelola barang sewaan Anda di sini.</p>
        </div>
        <button className="btn-primary-solid" onClick={() => openForm(null)}>
          + Tambah Barang
        </button>
      </div>

      {showForm && (
        <ListingForm
          store={store}
          categories={categories}
          editing={editing}
          onSaved={setItems}
          onClose={closeForm}
        />
      )}

      {!showForm && (
        <>
          <div className="items-filters">
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              type="search"
              placeholder="Cari barang..."
              className="search-box-solid"
            />
            <select
              value={status}
              onChange={(event) => setStatus(event.target.value)}
              className="filter-select-solid"
            >
              <option value="all">Semua Status</option>
              <option value="active">Aktif</option>
              <option value="inactive">Nonaktif</option>
            </select>
          </div>

          {actionError && <p className="rental-note is-error">{actionError}</p>}

          {isLoading ? (
            <p className="dashboard-empty-note">Memuat barang…</p>
          ) : loadError ? (
            <p className="dashboard-empty-note">{loadError}</p>
          ) : (
            <div className="items-grid-solid">
              {visibleItems.map((item) => (
                <SellerListingCard
                  key={item.id}
                  item={item}
                  onEdit={openForm}
                  onToggle={toggleAvailability}
                  onRemove={removeItem}
                />
              ))}
              {!visibleItems.length && (
                <div className="empty-state-solid">
                  <span className="empty-state-icon" aria-hidden="true">
                    📦
                  </span>
                  <p className="empty-state-title">Belum ada barang di sini</p>
                  <p className="empty-state-desc">
                    Coba ubah kata kunci atau filter status, atau tambahkan
                    barang baru.
                  </p>
                  <button className="btn-primary-solid" onClick={() => openForm(null)}>
                    + Tambah Barang
                  </button>
                </div>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}
