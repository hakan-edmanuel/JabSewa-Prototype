import { describe, expect, it } from "vitest";
import { resolveSignUpOutcome } from "./AuthContext";

/*
 * Regresi bug registrasi (CASE A/B/C):
 * signUp sukses dengan email confirmation aktif mengembalikan
 * { user, session: null } — kondisi yang HARUS dibedakan dari
 * "authenticated". Sebelum fix, AuthContext mengabaikan data.session,
 * memanggil fetchProfile tanpa JWT (diblokir RLS → null) sehingga UI
 * kembali ke home dalam keadaan tidak authenticated secara diam-diam.
 */
describe("resolveSignUpOutcome (klasifikasi hasil signUp)", () => {
  it("CASE A — user null → failed", () => {
    expect(resolveSignUpOutcome({ user: null, session: null })).toEqual({
      outcome: "failed",
    });
    expect(resolveSignUpOutcome(null)).toEqual({ outcome: "failed" });
    expect(resolveSignUpOutcome(undefined)).toEqual({ outcome: "failed" });
  });

  it("CASE B — user + session → authenticated", () => {
    const result = resolveSignUpOutcome({
      user: { id: "u-1", email: "a@b.co" },
      session: { access_token: "x", user: { id: "u-1" } },
    });
    expect(result.outcome).toBe("authenticated");
    expect(result.userId).toBe("u-1");
  });

  it("CASE C — user tanpa session (email confirmation) → needs_confirmation", () => {
    const result = resolveSignUpOutcome({
      user: { id: "u-2", email: "new@b.co" },
      session: null,
    });
    expect(result.outcome).toBe("needs_confirmation");
    expect(result.email).toBe("new@b.co");
  });

  it("tidak pernah membocorkan token/kredensial pada hasil", () => {
    const result = resolveSignUpOutcome({
      user: { id: "u-3", email: "c@b.co" },
      session: {
        access_token: "secret-access",
        refresh_token: "secret-refresh",
      },
    });
    expect(JSON.stringify(result)).not.toContain("secret-access");
    expect(JSON.stringify(result)).not.toContain("secret-refresh");
  });
});
