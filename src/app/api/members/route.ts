import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { createServiceClient } from "@/lib/supabase/server";
import { getAccountForUser } from "@/lib/account-helpers";

/**
 * GET /api/members — list members of the user's account
 * Uses separate queries instead of FK joins for reliability
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

    // Step 1: Fetch all account_members rows (no FK join)
    const { data: memberRows, error: membersError } = await supabase
      .from("account_members")
      .select("id, role, accepted, invited_email, spending_limit, joined_at, profile_id")
      .eq("account_id", account.id)
      .order("joined_at", { ascending: true });

    if (membersError) {
      console.error("Error fetching members:", membersError);
      return NextResponse.json(
        { error: "Failed to fetch members", details: membersError.message },
        { status: 500 }
      );
    }

    // Step 2: Collect all profile_ids that are not null
    const profileIds = (memberRows || [])
      .map((m: any) => m.profile_id)
      .filter(Boolean);

    // Step 3: Fetch profiles separately
    let profileMap: Record<string, any> = {};
    if (profileIds.length > 0) {
      const { data: profiles } = await supabase
        .from("profiles")
        .select("id, email, full_name, avatar_url")
        .in("id", profileIds);

      if (profiles) {
        for (const p of profiles) {
          profileMap[p.id] = p;
        }
      }
    }

    // Step 4: Merge and return
    const members = (memberRows || []).map((m: any) => {
      const prof = m.profile_id ? profileMap[m.profile_id] : null;
      return {
        id: m.id,
        role: m.role,
        accepted: m.accepted,
        email: prof?.email || m.invited_email || "—",
        name: prof?.full_name || null,
        avatar: prof?.avatar_url || null,
        spendingLimit: m.spending_limit,
        joinedAt: m.joined_at,
        profileId: m.profile_id,
      };
    });

    return NextResponse.json({
      account: {
        id: account.id,
        name: account.name,
      },
      currentUserRole: role,
      members,
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
 * POST /api/members — add a member by email
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

    const normalizedEmail = email.toLowerCase().trim();

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
        { error: "Only account owner or admin can add members" },
        { status: 403 }
      );
    }

    // Can't add yourself
    if (profile.email?.toLowerCase() === normalizedEmail) {
      return NextResponse.json(
        { error: "You are already the account owner" },
        { status: 409 }
      );
    }

    // Check if email is already a member by invited_email OR by profile email
    const { data: allMembers } = await supabase
      .from("account_members")
      .select("id, profile_id, invited_email")
      .eq("account_id", account.id);

    // Check invited_email match
    const alreadyInvited = (allMembers || []).find(
      (m: any) => m.invited_email?.toLowerCase() === normalizedEmail
    );
    if (alreadyInvited) {
      return NextResponse.json(
        { error: "This email has already been added to your account" },
        { status: 409 }
      );
    }

    // Check if the invited user already has a profile
    // Use .limit(1) instead of .maybeSingle() to handle duplicate profiles gracefully
    const { data: invitedProfiles } = await supabase
      .from("profiles")
      .select("id, email")
      .eq("email", normalizedEmail)
      .limit(1);
    const invitedProfile = invitedProfiles && invitedProfiles.length > 0 ? invitedProfiles[0] : null;

    // Check if they're already a member via profile_id
    if (invitedProfile) {
      const alreadyByProfile = (allMembers || []).find(
        (m: any) => m.profile_id === invitedProfile.id
      );
      if (alreadyByProfile) {
        return NextResponse.json(
          { error: "This user is already a member of your account" },
          { status: 409 }
        );
      }
    }

    // Insert the new member
    const insertData: any = {
      account_id: account.id,
      role: memberRole || "member",
      invited_email: normalizedEmail,
      accepted: false,
    };

    // If the invitee already has a profile, link and auto-accept immediately
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
      console.error("Error adding member:", insertError);
      return NextResponse.json(
        { error: "Failed to add member", details: insertError.message },
        { status: 500 }
      );
    }

    // If auto-accepted, clean up the invitee's old personal account
    // so getAccountForUser always resolves to this family account
    if (invitedProfile) {
      await cleanupPersonalAccount(supabase, invitedProfile.id, account.id);
    }

    return NextResponse.json({
      success: true,
      memberId: newMember.id,
      autoAccepted: !!invitedProfile,
      message: invitedProfile
        ? `${email} has been added to your account!`
        : `${email} saved. They'll be linked when they sign up.`,
    });
  } catch (error: any) {
    console.error("Error adding member:", error);
    return NextResponse.json(
      { error: "Failed to add member", details: error.message },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/members — remove a member
 */
export async function DELETE(request: NextRequest) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

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

    if (role !== "owner" && role !== "admin") {
      return NextResponse.json(
        { error: "Only account owner or admin can remove members" },
        { status: 403 }
      );
    }

    // Check the target member
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
 * PATCH /api/members — update a member's name or role
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
    const { account, role, error } = await getAccountForUser(supabase, userId);

    if (error || !account) {
      return NextResponse.json(
        { error: error || "No account found" },
        { status: 500 }
      );
    }

    if (role !== "owner" && role !== "admin") {
      return NextResponse.json(
        { error: "Only account owner or admin can edit members" },
        { status: 403 }
      );
    }

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

    if (name !== undefined && targetMember.profile_id) {
      await supabase
        .from("profiles")
        .update({ full_name: name.trim() || null })
        .eq("id", targetMember.profile_id);
    }

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

/**
 * When a user is auto-accepted into a family account, clean up their
 * old personal account so getAccountForUser always resolves to the family one.
 * - Moves any transactions from the personal account to the family account
 * - Deletes the owner membership row for the personal account
 * - Deletes the personal account itself
 */
async function cleanupPersonalAccount(
  supabase: any,
  profileId: string,
  familyAccountId: string
) {
  try {
    // Find personal accounts owned by this user
    const { data: ownedAccounts } = await supabase
      .from("accounts")
      .select("id")
      .eq("owner_id", profileId);

    if (!ownedAccounts || ownedAccounts.length === 0) return;

    for (const ownedAccount of ownedAccounts) {
      if (ownedAccount.id === familyAccountId) continue; // skip if same

      // Move all transactions from personal account to family account
      await supabase
        .from("transactions")
        .update({ account_id: familyAccountId })
        .eq("account_id", ownedAccount.id);

      // Delete the owner membership row
      await supabase
        .from("account_members")
        .delete()
        .eq("account_id", ownedAccount.id)
        .eq("profile_id", profileId);

      // Delete the personal account
      await supabase
        .from("accounts")
        .delete()
        .eq("id", ownedAccount.id);
    }
  } catch (err) {
    console.error("Error cleaning up personal account:", err);
    // Non-fatal — the invited membership priority in getAccountForUser will still work
  }
}
