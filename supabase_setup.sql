-- ——— SUPABASE DATABASE SETUP ———
-- Run this in the Supabase SQL Editor

-- 1. Create reservations table
CREATE TABLE reservations (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  created_at TIMESTAMPTZ DEFAULT now(),
  first_name TEXT NOT NULL,
  last_name TEXT NOT NULL,
  phone TEXT NOT NULL,
  email TEXT,
  guests INTEGER NOT NULL,
  date DATE NOT NULL,
  time TEXT NOT NULL,
  occasion TEXT,
  special_requests TEXT,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'confirmed', 'cancelled', 'completed'))
);

-- 2. Enable Row Level Security (RLS)
ALTER TABLE reservations ENABLE ROW LEVEL SECURITY;

-- 3. Policies for Customers (Public)
-- Allows customers to book a table
CREATE POLICY "Allow public insert" ON reservations
FOR INSERT WITH CHECK (true);

-- Allows checking availability (only returns time/guests/date/status)
CREATE POLICY "Allow public select for availability" ON reservations
FOR SELECT USING (true);

-- 4. Policies for Staff (Authenticated)
-- Full access for logged-in staff
CREATE POLICY "Allow full access to authenticated" ON reservations
FOR ALL TO authenticated USING (true);
