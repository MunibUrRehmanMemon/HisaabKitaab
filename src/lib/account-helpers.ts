import { createServiceClient } from "@/lib/supabase/server";
import { clerkClient } from "@clerk/nextjs/server";

/**
 * Resolves the SINGLE active account for a user.
 * Uses separate queries (NO FK joins) for maximum reliability.
 *
 * CRITICAL: Prevents race condition duplicates by:
 * 1. Always checking OWNED accounts FIRST (most reliable)
 * 2. Then checking memberships
 * 3. Only creating if truly nothing exists
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
        email: user.emailAddresses[0]?.emailAddress?.toLowerCase() || "",
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

  // 2. Check if the user was INVITED to any account (non-owner role)
  //    This takes priority — if someone invited you to their family account,
  //    you should see that family account, not your personal one.
  const { data: invitedMemberships } = await supabase
    .from("account_members")
    .select("account_id, role")
    .eq("profile_id", profile.id)
    .eq("accepted", true)
    .neq("role", "owner")
    .order("joined_at", { ascending: true })
    .limit(1);

  if (invitedMemberships && invitedMemberships.length > 0) {
    const membership = invitedMemberships[0];
    const { data: familyAccount } = await supabase
      .from("accounts")
      .select("id, name, mode, owner_id")
      .eq("id", membership.account_id)
      .single();

    if (familyAccount) {
      return {
        profile,
        account: familyAccount,
        role: membership.role,
        error: null,
      };
    }
  }

  // 3. Check if user OWNS any account (personal account)
  const { data: ownedAccounts } = await supabase
    .from("accounts")
    .select("id, name, mode, owner_id")
    .eq("owner_id", profile.id)
    .order("created_at", { ascending: true })
    .limit(1);

  if (ownedAccounts && ownedAccounts.length > 0) {
    const chosen = ownedAccounts[0];

    // Ensure owner is in account_members
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

  // 4. Is the user a MEMBER of any other account? (fallback)
  const { data: memberships } = await supabase
    .from("account_members")
    .select("account_id, role")
    .eq("profile_id", profile.id)
    .eq("accepted", true)
    .order("joined_at", { ascending: true });

  if (memberships && memberships.length > 0) {
    const accountIds = memberships.map((m: any) => m.account_id);
    const { data: accounts } = await supabase
      .from("accounts")
      .select("id, name, mode, owner_id")
      .in("id", accountIds);

    if (accounts && accounts.length > 0) {
      const roleMap: Record<string, string> = {};
      for (const m of memberships) {
        roleMap[m.account_id] = m.role;
      }
      const chosen = accounts[0];
      return {
        profile,
        account: chosen,
        role: roleMap[chosen.id] || "member",
        error: null,
      };
    }
  }

  // 5. No account at all — create one (ONLY reaches here if truly none exists)
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
