CREATE EXTENSION IF NOT EXISTS "pg_graphql";
CREATE EXTENSION IF NOT EXISTS "pg_stat_statements" WITH SCHEMA "extensions";
CREATE EXTENSION IF NOT EXISTS "pgcrypto" WITH SCHEMA "extensions";
CREATE EXTENSION IF NOT EXISTS "plpgsql";
CREATE EXTENSION IF NOT EXISTS "supabase_vault";
CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA "extensions";
BEGIN;

--
-- PostgreSQL database dump
--


-- Dumped from database version 17.6
-- Dumped by pg_dump version 18.1

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET transaction_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Name: public; Type: SCHEMA; Schema: -; Owner: -
--



--
-- Name: update_updated_at_column(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.update_updated_at_column() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'public'
    AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;


SET default_table_access_method = heap;

--
-- Name: google_tokens; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.google_tokens (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    session_id text NOT NULL,
    access_token text NOT NULL,
    refresh_token text,
    expires_at timestamp with time zone,
    email text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    service text DEFAULT 'gmail'::text NOT NULL,
    scopes text[]
);


--
-- Name: google_tokens gmail_tokens_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.google_tokens
    ADD CONSTRAINT gmail_tokens_pkey PRIMARY KEY (id);


--
-- Name: google_tokens gmail_tokens_session_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.google_tokens
    ADD CONSTRAINT gmail_tokens_session_id_key UNIQUE (session_id);


--
-- Name: idx_google_tokens_session_service; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_google_tokens_session_service ON public.google_tokens USING btree (session_id, service);


--
-- Name: google_tokens update_gmail_tokens_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_gmail_tokens_updated_at BEFORE UPDATE ON public.google_tokens FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: google_tokens Allow all operations on gmail_tokens; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Allow all operations on gmail_tokens" ON public.google_tokens USING (true) WITH CHECK (true);


--
-- Name: google_tokens Allow anonymous insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Allow anonymous insert" ON public.google_tokens FOR INSERT WITH CHECK (true);


--
-- Name: google_tokens Allow anonymous select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Allow anonymous select" ON public.google_tokens FOR SELECT USING (true);


--
-- Name: google_tokens Allow anonymous update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Allow anonymous update" ON public.google_tokens FOR UPDATE USING (true);


--
-- Name: google_tokens; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.google_tokens ENABLE ROW LEVEL SECURITY;

--
-- PostgreSQL database dump complete
--




COMMIT;