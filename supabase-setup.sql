-- ============================================================================
-- HappuGram — COMPLETE Supabase setup (fresh install)
-- ----------------------------------------------------------------------------
-- Run this ENTIRE script once in the Supabase SQL editor.
-- It will:
--   1. DROP all HappuGram tables (clean slate)
--   2. Recreate every table with keys, indexes, cascades
--   3. Enable Row Level Security + policies
--   4. Create private Storage buckets + policies
--   5. Seed the default 4-digit private code = 0818 (bcrypt hash only)
--
-- After running it:
--   • Open the app, enter the private code 0818 on the keypad.
--   • Register an account with email happygram@gmail.com → becomes admin.
--   • Change the PIN anytime in Admin panel → PIN code.
--
-- SECURITY: The raw PIN is NEVER stored — only a bcrypt hash. Never expose the
-- service_role key to the browser.
-- ============================================================================

-- ---- Extensions ------------------------------------------------------------
CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ---- 1. DROP EVERYTHING (clean slate) --------------------------------------
DROP TABLE IF EXISTS public.link_previews              CASCADE;
DROP TABLE IF EXISTS public.notifications              CASCADE;
DROP TABLE IF EXISTS public.user_reports              CASCADE;
DROP TABLE IF EXISTS public.user_blocks               CASCADE;
DROP TABLE IF EXISTS public.attachments               CASCADE;
DROP TABLE IF EXISTS public.message_reactions         CASCADE;
DROP TABLE IF EXISTS public.message_receipts          CASCADE;
DROP TABLE IF EXISTS public.messages                  CASCADE;
DROP TABLE IF EXISTS public.conversation_members      CASCADE;
DROP TABLE IF EXISTS public.conversations             CASCADE;
DROP TABLE IF EXISTS public.private_access_attempts    CASCADE;
DROP TABLE IF EXISTS public.private_access_credentials CASCADE;
DROP TABLE IF EXISTS public.users                     CASCADE;

-- ---- 2. TABLES -------------------------------------------------------------

CREATE TABLE public.users (
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
CREATE UNIQUE INDEX users_username_key     ON public.users (username);
CREATE UNIQUE INDEX users_email_key        ON public.users (email);
CREATE INDEX        users_display_name_idx ON public.users (display_name);

-- Singleton row: bcrypt hash of the 4-digit PIN. Raw code is never stored.
CREATE TABLE public.private_access_credentials (
  id          integer PRIMARY KEY DEFAULT 1,
  code_hash   text        NOT NULL,
  updated_at  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT private_access_credentials_singleton CHECK (id = 1)
);

CREATE TABLE public.private_access_attempts (
  client_key       varchar(120) PRIMARY KEY,
  failures         integer      NOT NULL DEFAULT 0,
  locked_until     timestamptz,
  last_attempt_at  timestamptz  NOT NULL DEFAULT now()
);

CREATE TABLE public.conversations (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title       varchar(120),
  is_group    boolean     NOT NULL DEFAULT false,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.conversation_members (
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
CREATE INDEX conversation_members_user_idx ON public.conversation_members (user_id);
CREATE INDEX conversation_members_conv_idx ON public.conversation_members (conversation_id);

CREATE TABLE public.messages (
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
CREATE INDEX messages_conv_created_idx ON public.messages (conversation_id, created_at);
CREATE INDEX messages_sender_idx       ON public.messages (sender_id);
CREATE INDEX messages_reply_idx        ON public.messages (reply_to_id);
CREATE INDEX messages_content_fts_idx  ON public.messages (content);

CREATE TABLE public.message_receipts (
  message_id  uuid NOT NULL REFERENCES public.messages(id) ON DELETE CASCADE,
  user_id     uuid NOT NULL REFERENCES public.users(id)    ON DELETE CASCADE,
  status      varchar(20) NOT NULL DEFAULT 'delivered',
  updated_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (message_id, user_id)
);

CREATE TABLE public.message_reactions (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id  uuid NOT NULL REFERENCES public.messages(id) ON DELETE CASCADE,
  user_id     uuid NOT NULL REFERENCES public.users(id)    ON DELETE CASCADE,
  emoji       varchar(16) NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX message_reactions_uniq ON public.message_reactions (message_id, user_id);

CREATE TABLE public.attachments (
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
CREATE INDEX attachments_message_idx ON public.attachments (message_id);

CREATE TABLE public.user_blocks (
  blocker_id  uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  blocked_id  uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  created_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (blocker_id, blocked_id)
);

CREATE TABLE public.user_reports (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reporter_id  uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  reported_id  uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  reason       varchar(80) NOT NULL,
  details      text,
  created_at   timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.notifications (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  kind        varchar(40) NOT NULL,
  title       varchar(120) NOT NULL,
  body        text,
  payload     jsonb,
  read_at     timestamptz,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX notifications_user_idx ON public.notifications (user_id, created_at);

CREATE TABLE public.link_previews (
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
CREATE UNIQUE INDEX link_previews_url_key ON public.link_previews (url);

-- ---- 3. ROW LEVEL SECURITY -------------------------------------------------
-- Policies apply when tables are queried with the anon/user JWT (browser).
-- The HappuGram Next.js backend uses a privileged connection and enforces
-- authorization in application code.

ALTER TABLE public.users                      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.private_access_credentials ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.private_access_attempts    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.conversations              ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.conversation_members       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.messages                   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.message_receipts           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.message_reactions          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.attachments                ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_blocks                ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_reports               ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notifications              ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.link_previews              ENABLE ROW LEVEL SECURITY;

-- users
CREATE POLICY users_read_directory ON public.users
  FOR SELECT USING (true);
CREATE POLICY users_update_self ON public.users
  FOR UPDATE USING (auth.uid() = id) WITH CHECK (auth.uid() = id);
CREATE POLICY users_admin_all ON public.users
  FOR ALL USING (
    EXISTS (SELECT 1 FROM public.users u WHERE u.id = auth.uid() AND u.is_admin)
  );

-- The private code + attempt tables are locked from all client roles.
CREATE POLICY pac_deny_all ON public.private_access_credentials
  FOR ALL USING (false) WITH CHECK (false);
CREATE POLICY paa_deny_all ON public.private_access_attempts
  FOR ALL USING (false) WITH CHECK (false);

-- conversations & members
CREATE POLICY conversations_member_read ON public.conversations
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM public.conversation_members m
            WHERE m.conversation_id = id AND m.user_id = auth.uid())
  );
CREATE POLICY conv_members_self ON public.conversation_members
  FOR SELECT USING (
    user_id = auth.uid()
    OR EXISTS (SELECT 1 FROM public.conversation_members m
               WHERE m.conversation_id = conversation_members.conversation_id
                 AND m.user_id = auth.uid())
  );
CREATE POLICY conv_members_update_self ON public.conversation_members
  FOR UPDATE USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

-- messages
CREATE POLICY messages_member_read ON public.messages
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM public.conversation_members m
            WHERE m.conversation_id = messages.conversation_id
              AND m.user_id = auth.uid())
  );
CREATE POLICY messages_member_insert ON public.messages
  FOR INSERT WITH CHECK (
    sender_id = auth.uid()
    AND EXISTS (SELECT 1 FROM public.conversation_members m
                WHERE m.conversation_id = messages.conversation_id
                  AND m.user_id = auth.uid())
  );
CREATE POLICY messages_own_update ON public.messages
  FOR UPDATE USING (sender_id = auth.uid()) WITH CHECK (sender_id = auth.uid());
CREATE POLICY messages_admin_all ON public.messages
  FOR ALL USING (
    EXISTS (SELECT 1 FROM public.users u WHERE u.id = auth.uid() AND u.is_admin)
  );

-- attachments & reactions & receipts
CREATE POLICY attachments_member_read ON public.attachments
  FOR SELECT USING (
    uploader_id = auth.uid()
    OR EXISTS (SELECT 1 FROM public.messages msg
               JOIN public.conversation_members m ON m.conversation_id = msg.conversation_id
               WHERE msg.id = attachments.message_id AND m.user_id = auth.uid())
  );
CREATE POLICY attachments_own_write ON public.attachments
  FOR INSERT WITH CHECK (uploader_id = auth.uid());
CREATE POLICY reactions_member_all ON public.message_reactions
  FOR ALL USING (
    user_id = auth.uid()
    OR EXISTS (SELECT 1 FROM public.messages msg
               JOIN public.conversation_members m ON m.conversation_id = msg.conversation_id
               WHERE msg.id = message_reactions.message_id AND m.user_id = auth.uid())
  ) WITH CHECK (user_id = auth.uid());
CREATE POLICY receipts_self ON public.message_receipts
  FOR ALL USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

-- blocks / reports / notifications
CREATE POLICY blocks_self ON public.user_blocks
  FOR ALL USING (blocker_id = auth.uid()) WITH CHECK (blocker_id = auth.uid());
CREATE POLICY reports_self_insert ON public.user_reports
  FOR INSERT WITH CHECK (reporter_id = auth.uid());
CREATE POLICY reports_admin_read ON public.user_reports
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM public.users u WHERE u.id = auth.uid() AND u.is_admin)
  );
CREATE POLICY notifications_self ON public.notifications
  FOR ALL USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

-- link previews (cache only, no PII)
CREATE POLICY link_previews_read ON public.link_previews
  FOR SELECT USING (auth.role() = 'authenticated');

-- ---- 4. STORAGE BUCKETS + POLICIES ----------------------------------------
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES
  ('profile-images', 'profile-images', false,  4194304,  ARRAY['image/jpeg','image/png','image/webp','image/gif']),
  ('chat-images',    'chat-images',    false, 10485760,  ARRAY['image/jpeg','image/png','image/webp','image/gif']),
  ('chat-videos',    'chat-videos',    false, 52428800,  ARRAY['video/mp4','video/webm','video/quicktime']),
  ('chat-files',     'chat-files',     false, 26214400,  NULL),
  ('voice-messages', 'voice-messages', false,  5242880,  ARRAY['audio/mpeg','audio/mp4','audio/webm','audio/ogg','audio/wav','audio/aac'])
ON CONFLICT (id) DO NOTHING;

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

-- ---- 5. SEED THE DEFAULT 4-DIGIT PIN = 0818 -------------------------------
-- bcrypt hash (cost 12) generated in-database. Raw digits are never persisted.
INSERT INTO public.private_access_credentials (id, code_hash, updated_at)
VALUES (1, crypt('0818', gen_salt('bf', 12)), now())
ON CONFLICT (id) DO UPDATE
  SET code_hash = EXCLUDED.code_hash,
      updated_at = now();

-- ============================================================================
-- DONE.
--   • Private code: 0818  (change later in Admin → PIN code)
--   • Admin: register with happygram@gmail.com
--
-- To manually promote/verify admin later:
--   UPDATE public.users SET is_admin = true WHERE email = 'happygram@gmail.com';
--
-- To change the PIN from SQL (replace 1234):
--   UPDATE public.private_access_credentials
--   SET code_hash = crypt('1234', gen_salt('bf', 12)), updated_at = now();
-- ============================================================================
