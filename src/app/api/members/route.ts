import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { createServiceClient } from "@/lib/supabase/server";
import { getAccountForUser } from "@/lib/account-helpers";

/**
 * GET /api/members — list members of the user's active account
 */
export async function GET() {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const supabase = createServiceClient();
    const { profile, account, role, error } = await getAccountForUser(
      supabase,
      userId
    );

    if (error || !account) {
      return NextResponse.json(
        { error: error || "No account found" },
        { status: 500 }
      );
    }

    // Fetch all members
    const { data: members } = await supabase
      .from("account_members")
      .select(
        "id, role, accepted, invited_email, spending_limit, created_at, profile_id, profiles(id, email, full_name, avatar_url)"
      )
      .eq("account_id", account.id)
      .order("created_at", { ascending: true });

    return NextResponse.json({
      account: {
        id: account.id,
        name: account.name,
        mode: account.mode,
      },
      currentUserRole: role,
      members: (members || []).map((m: any) => ({
        id: m.id,
        role: m.role,
        accepted: m.accepted,
        email: m.profiles?.email || m.invited_email || "—",
        name: m.profiles?.full_name || null,
        avatar: m.profiles?.avatar_url || null,
        spendingLimit: m.spending_limit,
        joinedAt: m.created_at,
        profileId: m.profile_id,
      })),
    });
  } catch (error: any) {
    console.error("Error listing members:", error);
    return NextResponse.json(
      { error: "Failed to list members", details: error.message },
      { status: 500 }
    );
  }
}

/**
 * POST /api/members — invite a new member by email
 * Body: { email: string, role?: string }
 */
export async function POST(request: NextRequest) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { email, role: memberRole } = await request.json();

    if (!email || !email.includes("@")) {
      return NextResponse.json(
        { error: "Valid email is required" },
        { status: 400 }
      );
    }

    const supabase = createServiceClient();
    const { profile, account, role, error } = await getAccountForUser(
      supabase,
      userId
    );

    if (error || !account || !profile) {
      return NextResponse.json(
        { error: error || "No account found" },
        { status: 500 }
      );
    }

    // Only owner/admin can invite
    if (role !== "owner" && role !== "admin") {
      return NextResponse.json(
        { error: "Only account owner or admin can invite members" },
        { status: 403 }
      );
    }

    // Check if email is already a member
    const { data: existingMember } = await supabase
      .from("account_members")
      .select("id")
      .eq("account_id", account.id)
      .eq("invited_email", email.toLowerCase())
      .maybeSingle();

    if (existingMember) {
      return NextResponse.json(
        { error: "This email is already invited to the account" },
        { status: 409 }
      );
    }

    // Check if the invited user already has a profile
    const { data: invitedProfile } = await supabase
      .from("profiles")
      .select("id, email")
      .eq("email", email.toLowerCase())
      .maybeSingle();

    // Also check if they're already a member via profile_id
    if (invitedProfile) {
      const { data: existingByProfile } = await supabase
        .from("account_members")
        .select("id")
        .eq("account_id", account.id)
        .eq("profile_id", invitedProfile.id)
        .maybeSingle();

      if (existingByProfile) {
        return NextResponse.json(
          { error: "This user is already a member of the account" },
          { status: 409 }
        );
      }
    }

    // Upgrade account to "family" mode if currently individual
    if (account.mode === "individual") {
      await supabase
        .from("accounts")
        .update({ mode: "family", name: "Family Account" })
        .eq("id", account.id);

      // Ensure the owner is in account_members table too
      await supabase
        .from("account_members")
        .upsert(
          {
            account_id: account.id,
            profile_id: profile.id,
            role: "owner",
            accepted: true,
            invited_email: profile.email?.toLowerCase() || "",
          },
          { onConflict: "account_id,profile_id" }
        );
    }

    // Insert the new member invitation
    const insertData: any = {
      account_id: account.id,
      role: memberRole || "member",
      invited_email: email.toLowerCase(),
      accepted: false,
    };

    // If the invitee already has a profile, link them immediately and auto-accept
    if (invitedProfile) {
      insertData.profile_id = invitedProfile.id;
      insertData.accepted = true;
    }

    const { data: newMember, error: insertError } = await supabase
      .from("account_members")
      .insert(insertData)
      .select("id")
      .single();

    if (insertError) {
      console.error("Error inviting member:", insertError);
      return NextResponse.json(
        { error: "Failed to invite member", details: insertError.message },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      memberId: newMember.id,
      autoAccepted: !!invitedProfile,
      message: invitedProfile
        ? `${email} has been added to your account`
        : `Invitation sent. ${email} will be linked when they sign up.`,
    });
  } catch (error: any) {
    console.error("Error inviting member:", error);
    return NextResponse.json(
      { error: "Failed to invite member", details: error.message },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/members — remove a member
 * Body: { memberId: string }
 */
export async function DELETE(request: NextRequest) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Support both query params and body
    let memberId: string | null = request.nextUrl.searchParams.get("memberId");
    if (!memberId) {
      try {
        const body = await request.json();
        memberId = body.memberId;
      } catch {
        // no body
      }
    }

    if (!memberId) {
      return NextResponse.json(
        { error: "memberId is required" },
        { status: 400 }
      );
    }

    const supabase = createServiceClient();
    const { account, role, error } = await getAccountForUser(supabase, userId);

    if (error || !account) {
      return NextResponse.json(
        { error: error || "No account found" },
        { status: 500 }
      );
    }

    // Only owner/admin can remove
    if (role !== "owner" && role !== "admin") {
      return NextResponse.json(
        { error: "Only account owner or admin can remove members" },
        { status: 403 }
      );
    }

    // Don't allow removing the owner
    const { data: targetMember } = await supabase
      .from("account_members")
      .select("id, role")
      .eq("id", memberId)
      .eq("account_id", account.id)
      .single();

    if (!targetMember) {
      return NextResponse.json(
        { error: "Member not found in this account" },
        { status: 404 }
      );
    }

    if (targetMember.role === "owner") {
      return NextResponse.json(
        { error: "Cannot remove the account owner" },
        { status: 403 }
      );
    }

    const { error: deleteError } = await supabase
      .from("account_members")
      .delete()
      .eq("id", memberId);

    if (deleteError) {
      return NextResponse.json(
        { error: "Failed to remove member", details: deleteError.message },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error("Error removing member:", error);
    return NextResponse.json(
      { error: "Failed to remove member", details: error.message },
      { status: 500 }
    );
  }
}

/**
 * PATCH /api/members — update a member's display name or role
 * Body: { memberId: string, name?: string, role?: string }
 */
export async function PATCH(request: NextRequest) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { memberId, name, role: newRole } = await request.json();

    if (!memberId) {
      return NextResponse.json(
        { error: "memberId is required" },
        { status: 400 }
      );
    }

    const supabase = createServiceClient();
    const {
      account,
      role,
      error,
    } = await getAccountForUser(supabase, userId);

    if (error || !account) {
      return NextResponse.json(
        { error: error || "No account found" },
        { status: 500 }
      );
    }

    // Only owner/admin can edit members
    if (role !== "owner" && role !== "admin") {
      return NextResponse.json(
        { error: "Only account owner or admin can edit members" },
        { status: 403 }
      );
    }

    // Verify the member belongs to this account
    const { data: targetMember } = await supabase
      .from("account_members")
      .select("id, role, profile_id")
      .eq("id", memberId)
      .eq("account_id", account.id)
      .single();

    if (!targetMember) {
      return NextResponse.json(
        { error: "Member not found in this account" },
        { status: 404 }
      );
    }

    // Update the profile name if provided and member has a profile
    if (name !== undefined && targetMember.profile_id) {
      await supabase
        .from("profiles")
        .update({ full_name: name.trim() || null })
        .eq("id", targetMember.profile_id);
    }

    // Update role if provided (can't change owner)
    if (newRole && targetMember.role !== "owner") {
      const validRoles = ["admin", "member", "viewer"];
      if (validRoles.includes(newRole)) {
        await supabase
          .from("account_members")
          .update({ role: newRole })
          .eq("id", memberId);
      }
    }

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error("Error updating member:", error);
    return NextResponse.json(
      { error: "Failed to update member", details: error.message },
      { status: 500 }
    );
  }
}
