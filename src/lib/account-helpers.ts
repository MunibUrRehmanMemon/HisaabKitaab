import { createServiceClient } from "@/lib/supabase/server";
import { clerkClient } from "@clerk/nextjs/server";

/**
 * Resolves the active account for a user. Checks:
 * 1. Accounts where user is an accepted member (via account_members)
 *    — prefers family/shop accounts first
 * 2. Accounts the user owns (via owner_id)
 * 3. Auto-creates a personal account if nothing exists
 *
 * Returns { profile, account, role, error }
 */
export async function getAccountForUser(
  supabase: ReturnType<typeof createServiceClient>,
  clerkUserId: string
) {
  // 1. Get or create profile
  let { data: profile } = await supabase
    .from("profiles")
    .select("id, email, full_name, avatar_url")
    .eq("clerk_user_id", clerkUserId)
    .single();

  if (!profile) {
    // Auto-create profile from Clerk
    const client = await clerkClient();
    const user = await client.users.getUser(clerkUserId);

    const { data: newProfile, error: profileError } = await supabase
      .from("profiles")
      .insert({
        clerk_user_id: clerkUserId,
        email: user.emailAddresses[0]?.emailAddress || "",
        full_name:
          `${user.firstName || ""} ${user.lastName || ""}`.trim() || null,
        avatar_url: user.imageUrl || null,
      })
      .select("id, email, full_name, avatar_url")
      .single();

    if (profileError || !newProfile) {
      return {
        profile: null,
        account: null,
        role: null,
        error: profileError?.message || "Failed to create profile",
      };
    }
    profile = newProfile;
  }

  // 2. Check if user is an accepted member of any account (prefer family/shop over individual)
  const { data: memberships } = await supabase
    .from("account_members")
    .select("account_id, role, accounts(id, name, mode, owner_id)")
    .eq("profile_id", profile.id)
    .eq("accepted", true)
    .order("created_at", { ascending: true });

  if (memberships && memberships.length > 0) {
    // Prefer family/shop accounts over individual
    const familyMembership = memberships.find(
      (m: any) =>
        m.accounts?.mode === "family" || m.accounts?.mode === "shop"
    );
    const chosen = familyMembership || memberships[0];
    return {
      profile,
      account: (chosen as any).accounts,
      role: chosen.role,
      error: null,
    };
  }

  // 3. Check if user owns any account directly
  const { data: ownedAccounts } = await supabase
    .from("accounts")
    .select("id, name, mode, owner_id")
    .eq("owner_id", profile.id)
    .order("created_at", { ascending: true });

  if (ownedAccounts && ownedAccounts.length > 0) {
    // Prefer family/shop over individual
    const familyAccount = ownedAccounts.find(
      (a: any) => a.mode === "family" || a.mode === "shop"
    );
    const chosen = familyAccount || ownedAccounts[0];
    return {
      profile,
      account: chosen,
      role: "owner" as const,
      error: null,
    };
  }

  // 4. No account at all — create a default personal account & owner membership
  const { data: newAccount, error: accountError } = await supabase
    .from("accounts")
    .insert({
      owner_id: profile.id,
      name: "Personal Account",
      mode: "individual",
    })
    .select("id, name, mode, owner_id")
    .single();

  if (accountError || !newAccount) {
    return {
      profile,
      account: null,
      role: null,
      error: accountError?.message || "Failed to create account",
    };
  }

  // Also insert the owner as an account_member for consistency
  await supabase.from("account_members").insert({
    account_id: newAccount.id,
    profile_id: profile.id,
    role: "owner",
    accepted: true,
  }).select().maybeSingle(); // ignore if constraint fails

  return {
    profile,
    account: newAccount,
    role: "owner" as const,
    error: null,
  };
}
