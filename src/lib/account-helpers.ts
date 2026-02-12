import { createServiceClient } from "@/lib/supabase/server";
import { clerkClient } from "@clerk/nextjs/server";

/**
 * Resolves the active account for a user.
 * Uses separate queries (NO FK joins) for maximum reliability.
 *
 * Flow:
 * 1. Get or create profile from Clerk
 * 2. Find account_members rows for this profile (accepted)
 * 3. Fetch account details separately
 * 4. Auto-create account if none exists
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

  // 2. Find memberships (NO FK join — just get account_id and role)
  const { data: memberships } = await supabase
    .from("account_members")
    .select("account_id, role")
    .eq("profile_id", profile.id)
    .eq("accepted", true)
    .order("joined_at", { ascending: true });

  if (memberships && memberships.length > 0) {
    // 3. Fetch the actual accounts separately
    const accountIds = memberships.map((m: any) => m.account_id);
    const { data: accounts } = await supabase
      .from("accounts")
      .select("id, name, mode, owner_id")
      .in("id", accountIds);

    if (accounts && accounts.length > 0) {
      // Build a lookup: accountId -> membership role
      const roleMap: Record<string, string> = {};
      for (const m of memberships) {
        roleMap[m.account_id] = m.role;
      }

      // Just pick the first account (they all share the same data)
      const chosen = accounts[0];
      return {
        profile,
        account: chosen,
        role: roleMap[chosen.id] || "member",
        error: null,
      };
    }
  }

  // 4. Check if user owns any account directly (fallback)
  const { data: ownedAccounts } = await supabase
    .from("accounts")
    .select("id, name, mode, owner_id")
    .eq("owner_id", profile.id)
    .order("created_at", { ascending: true })
    .limit(1);

  if (ownedAccounts && ownedAccounts.length > 0) {
    const chosen = ownedAccounts[0];

    // Ensure owner is also in account_members for consistency
    await supabase
      .from("account_members")
      .upsert(
        {
          account_id: chosen.id,
          profile_id: profile.id,
          role: "owner",
          accepted: true,
          invited_email: profile.email?.toLowerCase() || "",
        },
        { onConflict: "account_id,profile_id" }
      );

    return {
      profile,
      account: chosen,
      role: "owner" as const,
      error: null,
    };
  }

  // 5. No account at all — create one
  const { data: newAccount, error: accountError } = await supabase
    .from("accounts")
    .insert({
      owner_id: profile.id,
      name: "My Account",
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

  // Add owner as account_member
  await supabase.from("account_members").insert({
    account_id: newAccount.id,
    profile_id: profile.id,
    role: "owner",
    accepted: true,
    invited_email: profile.email?.toLowerCase() || "",
  });

  return {
    profile,
    account: newAccount,
    role: "owner" as const,
    error: null,
  };
}
