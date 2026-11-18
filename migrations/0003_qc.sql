-- Automatic quality-control report per chapter (AI-flavour scan + continuity check/fix).
ALTER TABLE chapters ADD COLUMN qc TEXT;
