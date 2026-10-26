/*
 * ProofLink — tautan bukti pembayaran yang aman untuk bucket private.
 *
 * payment_proof_url bisa berisi:
 *   - path Storage  (proofs/{rental_id}/{file} — dari upload baru) → dibuka
 *     via signed URL TTL 15 menit; berhasil hanya bila sesi punya hak baca
 *     (buyer pemilik / owner toko / admin — storage policy).
 *   - URL eksternal (http/https — dari input manual lama) → dipakai apa adanya.
 *
 * Bila signed URL gagal (tanpa akses / path invalid) → teks fallback, bukan
 * link mati. Tidak ada perubahan kontrak data — hanya cara menampilkan.
 *
 * Reset state saat value berubah dilakukan SAAT RENDER (pola "adjusting state
 * when a prop changes" — react.dev), bukan setState sinkron di effect.
 */
import { useEffect, useState } from "react";
import { getPaymentProofUrl } from "../data/uploads";

export default function ProofLink({ value, className = "proof-link" }) {
  const [url, setUrl] = useState(null);
  const [resolved, setResolved] = useState(false);
  const [prevValue, setPrevValue] = useState(value);

  if (prevValue !== value) {
    setPrevValue(value);
    setUrl(null);
    setResolved(false);
  }

  useEffect(() => {
    let active = true;
    getPaymentProofUrl(value)
      .then((signed) => {
        if (active) {
          setUrl(signed);
          setResolved(true);
        }
      })
      .catch(() => {
        if (active) setResolved(true);
      });
    return () => {
      active = false;
    };
  }, [value]);

  if (!value) return null;
  if (!resolved) return <span className={className}>…</span>;
  if (!url) return <span className={className}>bukti tidak dapat dibuka</span>;
  return (
    <a href={url} target="_blank" rel="noreferrer" className={className}>
      buka bukti
    </a>
  );
}
