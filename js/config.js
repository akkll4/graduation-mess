// js/config.js
const SUPABASE_URL = "https://myazzpalbiedwceqogjz.supabase.co"; // Replace with your URL
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im15YXp6cGFsYmllZHdjZXFvZ2p6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTIxMzMzODQsImV4cCI6MjEwNzcwOTM4NH0.6DXSY_jSTdqJXGCaKz0Q-pRyDYmRWdTqgQQK4v8l_k8"; // Replace with your Anon Key

const sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);