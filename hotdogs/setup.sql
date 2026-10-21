-- ─────────────────────────────────────────────────────────────────────────────
-- The Hot Dog Games — Supabase setup
-- Run this once in the Supabase SQL Editor. It reuses the existing `profiles`
-- table and auth users from The Lunch Games, so accounts work on both sites.
-- ─────────────────────────────────────────────────────────────────────────────

-- Hot dogs: one row per submitted dog
CREATE TABLE hotdogs (
  id         uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id    uuid REFERENCES profiles(id) ON DELETE CASCADE,
  name       text CHECK (char_length(name) <= 60),
  toppings   text[] NOT NULL CHECK (cardinality(toppings) BETWEEN 1 AND 20),
  photo_url  text NOT NULL,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE hotdogs ENABLE ROW LEVEL SECURITY;

-- Anyone can browse dogs
CREATE POLICY "Hot dogs are viewable by everyone"
  ON hotdogs FOR SELECT USING (true);

-- Users can only submit dogs as themselves
CREATE POLICY "Users can submit their own hot dogs"
  ON hotdogs FOR INSERT WITH CHECK (auth.uid() = user_id);

-- Users can delete their own dogs
CREATE POLICY "Users can delete their own hot dogs"
  ON hotdogs FOR DELETE USING (auth.uid() = user_id);


-- Votes: one swipe per user per dog; value is +1 (right / yum) or -1 (left / nope)
CREATE TABLE hotdog_votes (
  id         uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  hotdog_id  uuid REFERENCES hotdogs(id) ON DELETE CASCADE,
  user_id    uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  value      smallint NOT NULL CHECK (value IN (1, -1)),
  created_at timestamptz DEFAULT now(),
  UNIQUE (hotdog_id, user_id)
);

ALTER TABLE hotdog_votes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view hot dog votes"
  ON hotdog_votes FOR SELECT USING (true);

-- Users vote as themselves, and not on their own dogs
CREATE POLICY "Users can vote on other people's hot dogs"
  ON hotdog_votes FOR INSERT
  WITH CHECK (
    auth.uid() = user_id
    AND NOT EXISTS (
      SELECT 1 FROM hotdogs
      WHERE hotdogs.id = hotdog_id AND hotdogs.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can change their own hot dog vote"
  ON hotdog_votes FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);


-- Leaderboard: every dog with its swipe tallies, best first
CREATE VIEW hotdog_leaderboard AS
SELECT
  h.id,
  h.name,
  h.toppings,
  h.photo_url,
  h.created_at,
  p.display_name,
  p.username,
  COUNT(v.id) FILTER (WHERE v.value = 1)  AS yums,
  COUNT(v.id) FILTER (WHERE v.value = -1) AS nopes,
  COALESCE(SUM(v.value), 0)               AS score
FROM hotdogs h
LEFT JOIN hotdog_votes v ON v.hotdog_id = h.id
LEFT JOIN profiles p     ON p.id = h.user_id
GROUP BY h.id, p.display_name, p.username
ORDER BY score DESC, yums DESC, h.created_at DESC;


-- Photo storage: a public bucket that signed-in users can upload to
INSERT INTO storage.buckets (id, name, public)
VALUES ('hotdog-photos', 'hotdog-photos', true);

CREATE POLICY "Authenticated users can upload hot dog photos"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'hotdog-photos');
