import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = "https://zrituihswzkwnbehyfek.supabase.co";
const SUPABASE_PUBLISHABLE_KEY = "sb_publishable_5y1Pl2WQeE-8ifxfmP_u-w_tiiRgzjY";

export const supabase = createClient(
  SUPABASE_URL,
  SUPABASE_PUBLISHABLE_KEY
);