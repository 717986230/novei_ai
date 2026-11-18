-- Continuity ledger: story state as of the END of each chapter (characters, place/time, open threads, facts).
ALTER TABLE chapters ADD COLUMN state TEXT;
