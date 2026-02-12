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

    if (existingProfile) {
      // Profile exists — check for pending invitations by email and link them
      await linkPendingInvitations(supabase, existingProfile);

      // Ensure at least one account exists (either owned or as a member)
      const { data: memberships } = await supabase
        .from("account_members")
        .select("account_id")
        .eq("profile_id", existingProfile.id)
        .eq("accepted", true)
        .limit(1);

      const { data: ownedAccount } = await supabase
        .from("accounts")
        .select("id")
        .eq("owner_id", existingProfile.id)
        .limit(1);

      if (
        (!memberships || memberships.length === 0) &&
        (!ownedAccount || ownedAccount.length === 0)
      ) {
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

        // Add as owner in account_members
        if (newAccount) {
          await supabase
            .from("account_members")
            .upsert(
              {
                account_id: newAccount.id,
                profile_id: existingProfile.id,
                role: "owner",
                accepted: true,
                invited_email: existingProfile.email?.toLowerCase() || "",
              },
              { onConflict: "account_id,profile_id" }
            );
        }
      }

      return NextResponse.json({
        success: true,
        profileId: existingProfile.id,
      });
    }

    // Profile doesn't exist — create it from Clerk data
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
        {
          error: "Failed to create user profile",
          details: profileError.message,
        },
        { status: 500 }
      );
    }

    // Check if this new user has any pending invitations
    await linkPendingInvitations(supabase, newProfile);

    // Check if they now have an account via invitation
    const { data: linkedMemberships } = await supabase
      .from("account_members")
      .select("account_id")
      .eq("profile_id", newProfile.id)
      .eq("accepted", true)
      .limit(1);

    if (!linkedMemberships || linkedMemberships.length === 0) {
      // No invitation found — create a default personal account
      const { data: newAccount } = await supabase
        .from("accounts")
        .insert({
          owner_id: newProfile.id,
          name: "My Account",
          mode: "individual",
        })
        .select("id")
        .single();

      if (newAccount) {
        await supabase
          .from("account_members")
          .upsert(
            {
              account_id: newAccount.id,
              profile_id: newProfile.id,
              role: "owner",
              accepted: true,
              invited_email: newProfile.email?.toLowerCase() || "",
            },
            { onConflict: "account_id,profile_id" }
          );
      }
    }

    return NextResponse.json({ success: true, profileId: newProfile.id });
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
