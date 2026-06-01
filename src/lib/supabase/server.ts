import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

// Supabase client for Server Components / Server Actions / route handlers.
// cookies() is async in Next 16.
export async function createSupabaseServerClient() {
  const cookieStore = await cookies();
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(toSet) {
          try {
            toSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options));
          } catch {
            // Called from a Server Component (read-only cookies) — the proxy
            // refreshes the session cookie, so this is safe to ignore.
          }
        },
      },
    },
  );
}

export async function getUser() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user;
}

// Reads the user from the session cookie WITHOUT a network round-trip to Supabase
// Auth. Safe for UI/gating in the layout because the proxy already validated +
// refreshed the session (getUser) on the same request. Use getUser() where a
// freshly server-verified user is required (ownership checks in actions).
export async function getSessionUser() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();
  return session?.user ?? null;
}
