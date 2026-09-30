-- ============================================================================
-- JabSewa — SEED DEV: kategori awal (opsional, dev/staging saja)
-- ============================================================================
-- Seed TIDAK pernah berada di dalam baseline schema (aturan §11 master prompt).
-- Jalankan file ini HANYA di project dev/staging setelah baseline diterapkan:
--   SQL Editor → paste → Run
--
-- Kategori di sini dipilih agar cocok dengan label fallback UI
-- (src/lib/constants.js → CATEGORIES / CATEGORY_LABELS).
-- Produksi: kategori dikelola admin; jalankan hanya bila disetujui.
-- Idempotent: ON CONFLICT (slug) DO NOTHING.
-- ============================================================================

INSERT INTO public.categories (name, slug) VALUES
  ('Fotografi', 'photography'),
  ('Gadget',    'gadget'),
  ('Olahraga',  'sports'),
  ('Event',     'event')
ON CONFLICT (slug) DO NOTHING;
