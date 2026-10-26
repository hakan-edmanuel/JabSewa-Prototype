/* eslint-disable react-refresh/only-export-components */
/*
 * ============================================================================
 * AUTH CONTEXT — JabSewa (SUPABASE AUTH, ERD v2)
 * ============================================================================
 * Kontrak ke komponen:
 *   user            → { id, name, email, role ('consumer'|'admin'), status, isSeller }
 *   isAuthenticated → Boolean(user)
 *   hasSellerAccess → Boolean(user.isSeller) — cache server; otorisasi asli di DB
 *   storeApplication → ajuan toko terbaru (dari store_applications)
 *   isReady / register / login / logout
 *   submitStoreApplication(data) / startStoreApplication(data)
 * Satu istilah: `storeApplication` (tidak ada alias sellerApplication).
 * ============================================================================
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { getClient, isSupabaseConfigured } from "../../data/supabaseClient";
import { ROLE_CONSUMER } from "../../domain/roles";
import { translateServerError } from "../../domain/constants";

/* -------------------------------------------------------------------------- */

function mapProfile(row) {
  if (!row) return null;
  return {
    id: row.id,
    email: row.email,
    name: row.full_name || (row.email ? row.email.split("@")[0] : "Penyewa"),
    role: row.role || ROLE_CONSUMER,
    status: row.status || "active",
    isSeller: Boolean(row.is_seller),
  };
}

async function fetchProfile(userId) {
  const { data, error } = await getClient()
    .from("users")
    .select("id, email, full_name, role, status, is_seller")
    .eq("id", userId)
    .maybeSingle();
  if (error) throw error;
  return mapProfile(data);
}

/** Ajuan toko terbaru milik sesi (dari tabel store_applications). */
async function fetchLatestApplication() {
  const { data, error } = await getClient().rpc("get_my_applications");
  if (error) return null;
  const row = (data || [])[0];
  if (!row) return null;
  return {
    id: row.id,
    status: row.status,
    storeName: row.store_name,
    description: row.description,
    address: row.address,
    submittedAt: row.created_at,
    reviewedAt: row.reviewed_at,
    rejectionReason: row.rejection_reason,
  };
}

/* -------------------------------------------------------------------------- */

const AuthContext = createContext(null);

/**
 * Klasifikasi hasil signUp (fungsi murni — mudah dites tanpa mock Supabase).
 * Akar dari bug registrasi: signUp sukses dengan email confirmation aktif
 * mengembalikan user TANPA session — kondisi yang wajib dibedakan dari
 * "authenticated" agar frontend tidak menganggap user sudah login.
 *
 *   CASE A  failed             → user null (registrasi tidak jadi)
 *   CASE B  authenticated      → session tersedia → boleh masuk dashboard
 *   CASE C  needs_confirmation → user ada, session null → minta verifikasi email
 */
export function resolveSignUpOutcome(data) {
  if (!data?.user) return { outcome: "failed" };
  if (!data.session)
    return { outcome: "needs_confirmation", email: data.user.email };
  return { outcome: "authenticated", userId: data.user.id };
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [storeApplication, setStoreApplication] = useState(null);
  const [isReady, setIsReady] = useState(() => !isSupabaseConfigured);
  // Dedupe fetch profil yang berjalan bersamaan: getSession() dan event
  // onAuthStateChange (INITIAL_SESSION) sama-sama memuat profil saat mount.
  const inFlightProfiles = useRef(new Map());

  const fetchProfileOnce = useCallback((userId) => {
    const pending = inFlightProfiles.current.get(userId);
    if (pending) return pending;
    const request = fetchProfile(userId).finally(() => {
      inFlightProfiles.current.delete(userId);
    });
    inFlightProfiles.current.set(userId, request);
    return request;
  }, []);

  const refreshApplication = useCallback(async () => {
    const app = await fetchLatestApplication();
    setStoreApplication(app);
    return app;
  }, []);

  useEffect(() => {
    if (!isSupabaseConfigured) {
      return undefined;
    }
    let active = true;

    getClient()
      .auth.getSession()
      .then(async ({ data: { session } }) => {
        if (!active) return;
        if (session?.user) {
          try {
            const profile = await fetchProfileOnce(session.user.id);
            if (active) setUser(profile);
            await refreshApplication().catch(() => {});
          } catch {
            if (active) setUser(null);
          }
        }
        if (active) setIsReady(true);
      })
      .catch(() => {
        // Sesi tidak bisa dibaca (offline/error jaringan): jangan biarkan app
        // menggantung di layar "Memuat…" selamanya.
        if (active) setIsReady(true);
      });

    const { data: sub } = getClient().auth.onAuthStateChange(
      (_event, session) => {
        if (!active) return;
        if (!session?.user) {
          setUser(null);
          setStoreApplication(null);
          return;
        }
        fetchProfileOnce(session.user.id)
          .then((profile) => {
            if (active) setUser(profile);
          })
          .catch(() => {
            if (active) setUser(null);
          });
        refreshApplication().catch(() => {});
      },
    );

    return () => {
      active = false;
      sub?.subscription?.unsubscribe?.();
    };
  }, [refreshApplication, fetchProfileOnce]);

  const isAuthenticated = Boolean(user);
  const hasSellerAccess = Boolean(user?.isSeller);

  const login = useCallback(
    async ({ email, password }) => {
      const { data, error } = await getClient().auth.signInWithPassword({
        email: String(email || "").trim(),
        password: String(password || ""),
      });
      if (error) throw error;
      const profile = await fetchProfile(data.user.id);
      setUser(profile);
      refreshApplication().catch(() => {});
      return profile;
    },
    [refreshApplication],
  );

  const register = useCallback(
    async ({ name, email, password }) => {
      if (String(password || "").length < 6) {
        throw new Error("password should be at least 6 characters");
      }
      const { data, error } = await getClient().auth.signUp({
        email: String(email || "").trim(),
        password: String(password || ""),
        options: {
          data: { full_name: String(name || "").trim() || "Penyewa" },
        },
      });
      if (error) throw error;
      const outcome = resolveSignUpOutcome(data);
      if (outcome.outcome === "failed") throw new Error("register failed");

      // CASE C — email confirmation aktif: signUp sukses tetapi session belum
      // tersedia (data.user != null, data.session == null). JANGAN dianggap
      // authenticated: tanpa JWT, RLS menyaring baris profil dan fetchProfile
      // diam-diam mengembalikan null. Sinyalkan ke pemanggil, jangan set user.
      if (outcome.outcome === "needs_confirmation") {
        setUser(null);
        setStoreApplication(null);
        return { needsEmailConfirmation: true, email: outcome.email };
      }

      // CASE B — session tersedia: trigger handle_new_user sudah commit
      // (transaksi yang sama dengan INSERT auth.users), profil siap dimuat.
      const profile = await fetchProfile(data.user.id).catch(() => null);
      setUser(profile);
      refreshApplication().catch(() => {});
      return profile;
    },
    [refreshApplication],
  );

  const logout = useCallback(async () => {
    if (isSupabaseConfigured) {
      await getClient().auth.signOut();
    }
    setUser(null);
    setStoreApplication(null);
  }, []);

  /* --- Store application (tulis via RPC server-side) ---------------------- */
  const submitStoreApplication = useCallback(
    async ({ storeName, description, address }) => {
      const { data, error } = await getClient().rpc(
        "submit_store_application",
        {
          p_store_name: String(storeName || "").trim(),
          p_description: String(description || "").trim(),
          p_address: String(address || "").trim(),
        },
      );
      if (error) throw error;
      const row = data?.[0];
      if (!row?.ok)
        throw new Error(translateServerError(row?.error || "forbidden"));
      const app = await refreshApplication();
      return app;
    },
    [refreshApplication],
  );

  const startStoreApplication = useCallback(
    (data = {}) => submitStoreApplication(data),
    [submitStoreApplication],
  );

  const value = useMemo(
    () => ({
      user,
      isAuthenticated,
      hasSellerAccess,
      storeApplication,
      isReady,
      login,
      register,
      logout,
      submitStoreApplication,
      startStoreApplication,
      refreshStoreApplication: refreshApplication,
    }),
    [
      user,
      isAuthenticated,
      hasSellerAccess,
      storeApplication,
      isReady,
      login,
      register,
      logout,
      submitStoreApplication,
      startStoreApplication,
      refreshApplication,
    ],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth harus dipakai di dalam <AuthProvider>");
  return ctx;
}
