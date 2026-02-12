import { NextRequest, NextResponse } from "next/server";
import { auth, clerkClient } from "@clerk/nextjs/server";
import { createServiceClient } from "@/lib/supabase/server";

export async function POST(request: NextRequest) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const supabase = createServiceClient();

    // Check if profile exists
    let { data: existingProfile } = await supabase
      .from("profiles")
      .select("id, email")
      .eq("clerk_user_id", userId)
      .single();

    if (!existingProfile) {
      // Profile doesn't exist — create from Clerk data
      const client = await clerkClient();
      const user = await client.users.getUser(userId);
      const userEmail =
        user.emailAddresses[0]?.emailAddress?.toLowerCase() || "";

      const { data: newProfile, error: profileError } = await supabase
        .from("profiles")
        .insert({
          clerk_user_id: userId,
          email: userEmail,
          full_name:
            `${user.firstName || ""} ${user.lastName || ""}`.trim() || null,
          avatar_url: user.imageUrl || null,
        })
        .select("id, email")
        .single();

      if (profileError) {
        console.error("Error creating profile:", profileError);
        return NextResponse.json(
          { error: "Failed to create profile", details: profileError.message },
          { status: 500 }
        );
      }
      existingProfile = newProfile;
    }

    if (!existingProfile) {
      return NextResponse.json({ error: "Failed to resolve profile" }, { status: 500 });
    }

    // Link any pending invitations (invited by email, profile_id is null)
    await linkPendingInvitations(supabase, existingProfile);

    // Check if user OWNS any account already
    const { data: ownedAccounts } = await supabase
      .from("accounts")
      .select("id")
      .eq("owner_id", existingProfile.id)
      .limit(1);

    if (ownedAccounts && ownedAccounts.length > 0) {
      // Already has an account — just ensure membership row exists
      await supabase
        .from("account_members")
        .upsert(
          {
            account_id: ownedAccounts[0].id,
            profile_id: existingProfile.id,
            role: "owner",
            accepted: true,
            invited_email: existingProfile.email?.toLowerCase() || "",
          },
          { onConflict: "account_id,profile_id" }
        );

      return NextResponse.json({ success: true, profileId: existingProfile.id });
    }

    // Check if user is a member of any account (via invitation link)
    const { data: memberAccounts } = await supabase
      .from("account_members")
      .select("account_id")
      .eq("profile_id", existingProfile.id)
      .eq("accepted", true)
      .limit(1);

    if (memberAccounts && memberAccounts.length > 0) {
      // Already linked to an account as member — no need to create
      return NextResponse.json({ success: true, profileId: existingProfile.id });
    }

    // No account at all — create a personal one
    const { data: newAccount } = await supabase
      .from("accounts")
      .insert({
        owner_id: existingProfile.id,
        name: "My Account",
        mode: "individual",
      })
      .select("id")
      .single();

    if (newAccount) {
      await supabase.from("account_members").insert({
        account_id: newAccount.id,
        profile_id: existingProfile.id,
        role: "owner",
        accepted: true,
        invited_email: existingProfile.email?.toLowerCase() || "",
      });
    }

    return NextResponse.json({ success: true, profileId: existingProfile.id });
  } catch (error: any) {
    console.error("Error ensuring profile:", error);
    return NextResponse.json(
      { error: "Failed to ensure profile", details: error.message },
      { status: 500 }
    );
  }
}

/**
 * Check account_members for rows where invited_email matches the profile's email
 * but profile_id is null (pending invitation). Link them and set accepted=true.
 */
async function linkPendingInvitations(
  supabase: any,
  profile: { id: string; email: string }
) {
  if (!profile.email) return;

  const { data: pendingInvites } = await supabase
    .from("account_members")
    .select("id, account_id")
    .eq("invited_email", profile.email.toLowerCase())
    .is("profile_id", null);

  if (pendingInvites && pendingInvites.length > 0) {
    for (const invite of pendingInvites) {
      await supabase
        .from("account_members")
        .update({ profile_id: profile.id, accepted: true })
        .eq("id", invite.id);
    }
  }
}
