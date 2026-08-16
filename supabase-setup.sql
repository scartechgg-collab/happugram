-- ============================================================================
-- HappuGram — Supabase setup
-- ----------------------------------------------------------------------------
-- Run this script ONCE in the Supabase SQL editor.
-- After running it:
--   1. Open the "Table editor" → private_access_credentials
--   2. Set / update the 4-digit PIN by pasting a bcrypt hash into `code_hash`
--      (see "SETTING THE 4-DIGIT PIN" section below).
--   3. Register a normal account in the app with the email
--      happygram@gmail.com — that account is auto-promoted to admin.
--      (Or manually flip the `is_admin` flag in the `users` table.)
--
-- SECURITY NOTES
-- - Never expose the Supabase service_role key to the browser.
-- - The 4-digit PIN is only stored as a bcrypt hash. Do NOT store the raw
--   digits anywhere.
-- - Row Level Security (RLS) is enabled on every table containing user data,
--   with policies that require Supabase Auth (auth.uid()) if you plan to
--   access these tables directly from the client. Server-side code using the
--   service key bypasses RLS (that's how the Next.js API layer works).
-- ============================================================================

-- ---- Extensions ------------------------------------------------------------
CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ---- Tables ----------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.users (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  username       varchar(40)  NOT NULL,
  email          varchar(160),
  display_name   varchar(80)  NOT NULL,
  password_hash  text         NOT NULL,
  avatar_url     text,
  bio            varchar(240),
  is_admin       boolean      NOT NULL DEFAULT false,
  banned         boolean      NOT NULL DEFAULT false,
  show_presence  boolean      NOT NULL DEFAULT true,
  last_seen_at   timestamptz,
  created_at     timestamptz  NOT NULL DEFAULT now(),
  updated_at     timestamptz  NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS users_username_key    ON public.users (username);
CREATE UNIQUE INDEX IF NOT EXISTS users_email_key       ON public.users (email);
CREATE INDEX        IF NOT EXISTS users_display_name_idx ON public.users (display_name);

-- Singleton: stores the bcrypt hash of the 4-digit PIN.
-- The raw code is NEVER stored, transmitted, or logged.
CREATE TABLE IF NOT EXISTS public.private_access_credentials (
  id          integer PRIMARY KEY DEFAULT 1,
  code_hash   text        NOT NULL,
  updated_at  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT private_access_credentials_singleton CHECK (id = 1)
);

CREATE TABLE IF NOT EXISTS public.private_access_attempts (
  client_key       varchar(120) PRIMARY KEY,
  failures         integer      NOT NULL DEFAULT 0,
  locked_until     timestamptz,
  last_attempt_at  timestamptz  NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.conversations (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title       varchar(120),
  is_group    boolean     NOT NULL DEFAULT false,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.conversation_members (
  conversation_id  uuid NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
  user_id          uuid NOT NULL REFERENCES public.users(id)          ON DELETE CASCADE,
  role             varchar(20) NOT NULL DEFAULT 'member',
  muted            boolean     NOT NULL DEFAULT false,
  archived         boolean     NOT NULL DEFAULT false,
  pinned_at        timestamptz,
  last_read_at     timestamptz,
  joined_at        timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (conversation_id, user_id)
);
CREATE INDEX IF NOT EXISTS conversation_members_user_idx ON public.conversation_members (user_id);
CREATE INDEX IF NOT EXISTS conversation_members_conv_idx ON public.conversation_members (conversation_id);

CREATE TABLE IF NOT EXISTS public.messages (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id  uuid NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
  sender_id        uuid NOT NULL REFERENCES public.users(id)         ON DELETE CASCADE,
  reply_to_id      uuid REFERENCES public.messages(id) ON DELETE SET NULL,
  kind             varchar(20) NOT NULL DEFAULT 'text',
  content          text,
  status           varchar(20) NOT NULL DEFAULT 'sent',
  pinned           boolean     NOT NULL DEFAULT false,
  edited_at        timestamptz,
  deleted_at       timestamptz,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS messages_conv_created_idx ON public.messages (conversation_id, created_at);
CREATE INDEX IF NOT EXISTS messages_sender_idx       ON public.messages (sender_id);
CREATE INDEX IF NOT EXISTS messages_reply_idx        ON public.messages (reply_to_id);

CREATE TABLE IF NOT EXISTS public.message_receipts (
  message_id  uuid NOT NULL REFERENCES public.messages(id) ON DELETE CASCADE,
  user_id     uuid NOT NULL REFERENCES public.users(id)    ON DELETE CASCADE,
  status      varchar(20) NOT NULL DEFAULT 'delivered',
  updated_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (message_id, user_id)
);

CREATE TABLE IF NOT EXISTS public.message_reactions (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id  uuid NOT NULL REFERENCES public.messages(id) ON DELETE CASCADE,
  user_id     uuid NOT NULL REFERENCES public.users(id)    ON DELETE CASCADE,
  emoji       varchar(16) NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS message_reactions_uniq ON public.message_reactions (message_id, user_id);

CREATE TABLE IF NOT EXISTS public.attachments (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id     uuid REFERENCES public.messages(id) ON DELETE CASCADE,
  uploader_id    uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  kind           varchar(20) NOT NULL,
  filename       varchar(240) NOT NULL,
  mime_type      varchar(120) NOT NULL,
  size_bytes     bigint      NOT NULL,
  storage_key    text        NOT NULL,
  thumbnail_key  text,
  width          integer,
  height         integer,
  duration_ms    integer,
  metadata       jsonb,
  created_at     timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS attachments_message_idx ON public.attachments (message_id);

CREATE TABLE IF NOT EXISTS public.user_blocks (
  blocker_id  uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  blocked_id  uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  created_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (blocker_id, blocked_id)
);

CREATE TABLE IF NOT EXISTS public.user_reports (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reporter_id  uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  reported_id  uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  reason       varchar(80) NOT NULL,
  details      text,
  created_at   timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.notifications (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  kind        varchar(40) NOT NULL,
  title       varchar(120) NOT NULL,
  body        text,
  payload     jsonb,
  read_at     timestamptz,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS notifications_user_idx ON public.notifications (user_id, created_at);

CREATE TABLE IF NOT EXISTS public.link_previews (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  url          text        NOT NULL,
  host         varchar(200) NOT NULL,
  title        varchar(240),
  description  text,
  image_url    text,
  video_url    text,
  media_kind   varchar(40),
  embed_html   text,
  fetched_at   timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS link_previews_url_key ON public.link_previews (url);

-- ---- Row Level Security ----------------------------------------------------
--
-- These policies ONLY apply when tables are queried with the anon/user JWT
-- (i.e. from the browser via the Supabase JS client). The Next.js backend
-- talks to Postgres directly with a privileged connection and bypasses RLS —
-- that's how we enforce authorization in application code.
--
-- If you also want to expose these tables to the browser via PostgREST, the
-- policies below assume Supabase Auth is used and `auth.uid()` equals the
-- `users.id` value for the current user.

ALTER TABLE public.users                        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.private_access_credentials   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.private_access_attempts      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.conversations                ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.conversation_members         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.messages                     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.message_receipts             ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.message_reactions            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.attachments                  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_blocks                  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_reports                 ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notifications                ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.link_previews                ENABLE ROW LEVEL SECURITY;

-- --- users ---
DROP POLICY IF EXISTS users_read_self       ON public.users;
DROP POLICY IF EXISTS users_read_directory  ON public.users;
DROP POLICY IF EXISTS users_update_self     ON public.users;
DROP POLICY IF EXISTS users_admin_all       ON public.users;

CREATE POLICY users_read_self ON public.users
  FOR SELECT USING (auth.uid() = id);

-- Public directory: allow reading only non-sensitive columns (rely on a view
-- in real deployments). This lets people search for other users to chat with.
CREATE POLICY users_read_directory ON public.users
  FOR SELECT USING (true);

CREATE POLICY users_update_self ON public.users
  FOR UPDATE USING (auth.uid() = id) WITH CHECK (auth.uid() = id);

-- Admins can do anything on users.
CREATE POLICY users_admin_all ON public.users
  FOR ALL USING (
    EXISTS (SELECT 1 FROM public.users u WHERE u.id = auth.uid() AND u.is_admin)
  );

-- --- private_access_credentials ---
-- NEVER readable / writable by clients. Only the service key (server) can
-- touch this. Deny everything to normal auth roles.
DROP POLICY IF EXISTS pac_deny_all ON public.private_access_credentials;
CREATE POLICY pac_deny_all ON public.private_access_credentials
  FOR ALL USING (false) WITH CHECK (false);

DROP POLICY IF EXISTS paa_deny_all ON public.private_access_attempts;
CREATE POLICY paa_deny_all ON public.private_access_attempts
  FOR ALL USING (false) WITH CHECK (false);

-- --- conversations & members ---
DROP POLICY IF EXISTS conversations_member_read ON public.conversations;
CREATE POLICY conversations_member_read ON public.conversations
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.conversation_members m
      WHERE m.conversation_id = id AND m.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS conv_members_self ON public.conversation_members;
CREATE POLICY conv_members_self ON public.conversation_members
  FOR SELECT USING (
    user_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.conversation_members m
      WHERE m.conversation_id = conversation_members.conversation_id
        AND m.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS conv_members_update_self ON public.conversation_members;
CREATE POLICY conv_members_update_self ON public.conversation_members
  FOR UPDATE USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

-- --- messages ---
DROP POLICY IF EXISTS messages_member_read ON public.messages;
CREATE POLICY messages_member_read ON public.messages
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.conversation_members m
      WHERE m.conversation_id = messages.conversation_id
        AND m.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS messages_member_insert ON public.messages;
CREATE POLICY messages_member_insert ON public.messages
  FOR INSERT WITH CHECK (
    sender_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.conversation_members m
      WHERE m.conversation_id = messages.conversation_id
        AND m.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS messages_own_update ON public.messages;
CREATE POLICY messages_own_update ON public.messages
  FOR UPDATE USING (sender_id = auth.uid()) WITH CHECK (sender_id = auth.uid());

DROP POLICY IF EXISTS messages_admin_all ON public.messages;
CREATE POLICY messages_admin_all ON public.messages
  FOR ALL USING (
    EXISTS (SELECT 1 FROM public.users u WHERE u.id = auth.uid() AND u.is_admin)
  );

-- --- attachments & reactions ---
DROP POLICY IF EXISTS attachments_member_read ON public.attachments;
CREATE POLICY attachments_member_read ON public.attachments
  FOR SELECT USING (
    uploader_id = auth.uid()
    OR EXISTS (
      SELECT 1
      FROM public.messages msg
      JOIN public.conversation_members m
        ON m.conversation_id = msg.conversation_id
      WHERE msg.id = attachments.message_id
        AND m.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS attachments_own_write ON public.attachments;
CREATE POLICY attachments_own_write ON public.attachments
  FOR INSERT WITH CHECK (uploader_id = auth.uid());

DROP POLICY IF EXISTS reactions_member_all ON public.message_reactions;
CREATE POLICY reactions_member_all ON public.message_reactions
  FOR ALL USING (
    user_id = auth.uid()
    OR EXISTS (
      SELECT 1
      FROM public.messages msg
      JOIN public.conversation_members m ON m.conversation_id = msg.conversation_id
      WHERE msg.id = message_reactions.message_id AND m.user_id = auth.uid()
    )
  ) WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS receipts_self ON public.message_receipts;
CREATE POLICY receipts_self ON public.message_receipts
  FOR ALL USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

-- --- blocks / reports / notifications ---
DROP POLICY IF EXISTS blocks_self ON public.user_blocks;
CREATE POLICY blocks_self ON public.user_blocks
  FOR ALL USING (blocker_id = auth.uid()) WITH CHECK (blocker_id = auth.uid());

DROP POLICY IF EXISTS reports_self_insert ON public.user_reports;
CREATE POLICY reports_self_insert ON public.user_reports
  FOR INSERT WITH CHECK (reporter_id = auth.uid());

DROP POLICY IF EXISTS reports_admin_read ON public.user_reports;
CREATE POLICY reports_admin_read ON public.user_reports
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM public.users u WHERE u.id = auth.uid() AND u.is_admin)
  );

DROP POLICY IF EXISTS notifications_self ON public.notifications;
CREATE POLICY notifications_self ON public.notifications
  FOR ALL USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

-- --- link previews ---
-- Link previews are cache-only, no PII. Allow authenticated users to read.
DROP POLICY IF EXISTS link_previews_read ON public.link_previews;
CREATE POLICY link_previews_read ON public.link_previews
  FOR SELECT USING (auth.role() = 'authenticated');

-- ---- Supabase Storage buckets (create + policies) --------------------------
-- Create private buckets. HappuGram serves media through authenticated API
-- routes with signed URLs, so the buckets stay private.

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES
  ('profile-images', 'profile-images', false,  4 * 1024 * 1024, ARRAY['image/jpeg','image/png','image/webp','image/gif']),
  ('chat-images',    'chat-images',    false, 10 * 1024 * 1024, ARRAY['image/jpeg','image/png','image/webp','image/gif']),
  ('chat-videos',    'chat-videos',    false, 50 * 1024 * 1024, ARRAY['video/mp4','video/webm','video/quicktime']),
  ('chat-files',     'chat-files',     false, 25 * 1024 * 1024, NULL),
  ('voice-messages', 'voice-messages', false,  5 * 1024 * 1024, ARRAY['audio/mpeg','audio/mp4','audio/webm','audio/ogg','audio/wav','audio/aac'])
ON CONFLICT (id) DO NOTHING;

-- Storage RLS: users may only read/write objects under a prefix that matches
-- their own auth.uid(). Cross-user access must go through the server layer
-- (which uses the service key and checks conversation membership).
DROP POLICY IF EXISTS "hg storage read own"  ON storage.objects;
DROP POLICY IF EXISTS "hg storage write own" ON storage.objects;

CREATE POLICY "hg storage read own" ON storage.objects
  FOR SELECT USING (
    bucket_id IN ('profile-images','chat-images','chat-videos','chat-files','voice-messages')
    AND (auth.uid()::text = (storage.foldername(name))[1])
  );

CREATE POLICY "hg storage write own" ON storage.objects
  FOR INSERT WITH CHECK (
    bucket_id IN ('profile-images','chat-images','chat-videos','chat-files','voice-messages')
    AND (auth.uid()::text = (storage.foldername(name))[1])
  );

-- ============================================================================
-- SETTING THE 4-DIGIT PIN
-- ----------------------------------------------------------------------------
-- The PIN is stored ONLY as a bcrypt hash. To set it, run ONE of the
-- following two options. Never save the raw digits anywhere.
--
-- OPTION A — set the PIN from SQL (recommended):
--   Requires the `pgcrypto` extension (enabled above). Replace the placeholder
--   below with the PIN you want. This uses bcrypt with cost factor 12.
--
--     INSERT INTO public.private_access_credentials (id, code_hash)
--     VALUES (1, crypt('0818', gen_salt('bf', 12)))
--     ON CONFLICT (id) DO UPDATE
--       SET code_hash = EXCLUDED.code_hash,
--           updated_at = now();
--
--   After running the INSERT, forget the plaintext PIN. The `crypt()` call
--   above never persists the raw digits — only the resulting hash is stored.
--
-- OPTION B — set the PIN from the app:
--   1. Log in as the admin account.
--   2. Open the Admin panel → "PIN code" tab.
--   3. Type the new PIN. The server hashes it with bcrypt and stores only
--      the hash.
--
-- NEVER paste the raw PIN into logs, chat messages, GitHub issues, etc.
-- ============================================================================

-- ============================================================================
-- PROMOTING THE ADMIN ACCOUNT
-- ----------------------------------------------------------------------------
-- The application auto-promotes any user that registers with the
-- ADMIN_EMAIL env var value (default: happygram@gmail.com). If you registered
-- before setting that env var, or if you want to add another admin, run:
--
--     UPDATE public.users
--     SET is_admin = true
--     WHERE email = 'happygram@gmail.com';
--
-- To revoke admin:
--
--     UPDATE public.users
--     SET is_admin = false
--     WHERE email = 'someone@example.com';
-- ============================================================================
