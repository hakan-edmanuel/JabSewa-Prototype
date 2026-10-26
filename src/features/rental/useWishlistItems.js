import { useCallback, useEffect, useMemo, useState } from "react";
import { useAuth } from "../auth/AuthContext";
import { getWishlist, toggleWishlist } from "../../data/wishlist";
import { fetchListings } from "../../data/listings";
import { translateRentalError } from "../../data/rentals";

/* Wishlist penyewa: id dari server (RLS-scoped) + katalog untuk kartu. */
export function useWishlistItems() {
  const { user } = useAuth();
  const [items, setItems] = useState([]);
  const [wishlist, setWishlist] = useState([]);
  const [wishlistState, setWishlistState] = useState("loading");
  const [busyWishId, setBusyWishId] = useState(null);
  const [error, setError] = useState("");

  /* --- Muat katalog (untuk kartu wishlist) --- */
  useEffect(() => {
    let active = true;
    Promise.resolve()
      .then(() => fetchListings())
      .then((data) => {
        if (active) setItems(data);
      })
      .catch(() => {
        if (active) setItems([]);
      });
    return () => {
      active = false;
    };
  }, []);

  /* --- Muat wishlist user login (persist di server) --- */
  const loadWishlist = useCallback(() => {
    if (!user?.id) {
      Promise.resolve().then(() => {
        setWishlist([]);
        setWishlistState("ready");
      });
      return;
    }
    Promise.resolve().then(() => setWishlistState("loading"));
    getWishlist()
      .then((ids) => {
        setWishlist(ids);
        setWishlistState("ready");
      })
      .catch(() => setWishlistState("error"));
  }, [user?.id]);

  useEffect(() => {
    loadWishlist();
  }, [loadWishlist]);

  const remove = useCallback(
    async (itemId) => {
      setError("");
      setBusyWishId(itemId);
      try {
        await toggleWishlist(itemId);
        loadWishlist();
      } catch (err) {
        setError(translateRentalError(err?.message));
      } finally {
        setBusyWishId(null);
      }
    },
    [loadWishlist],
  );

  const wishItems = useMemo(
    () => items.filter((item) => wishlist.includes(item.id)),
    [items, wishlist],
  );

  return { wishItems, wishlistState, busyWishId, error, loadWishlist, remove };
}
