import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { createServiceClient } from "@/lib/supabase/server";

export async function POST(request: NextRequest) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { action, language, mode, name } = await request.json();
    const supabase = createServiceClient();

    if (action === "set-language") {
      const { error } = await supabase
        .from("profiles")
        .update({ preferred_language: language })
        .eq("clerk_user_id", userId);

      if (error) {
        console.error("Error updating language:", error);
        return NextResponse.json(
          { error: "Failed to update language" },
          { status: 500 }
        );
      }

      return NextResponse.json({ success: true });
    }

    if (action === "set-mode") {
      // Get profile
      const { data: profile } = await supabase
        .from("profiles")
        .select("id")
        .eq("clerk_user_id", userId)
        .single();

      if (!profile) {
        return NextResponse.json(
          { error: "Profile not found" },
          { status: 404 }
        );
      }

      // Create account
      const { data: account, error: accountError } = await supabase
        .from("accounts")
        .insert({
          name: name || "My Account",
          mode: mode,
          owner_id: profile.id,
        })
        .select("id")
        .single();

      if (accountError) {
        console.error("Error creating account:", accountError);
        return NextResponse.json(
          { error: "Failed to create account" },
          { status: 500 }
        );
      }

      // Add user as owner in account_members
      await supabase.from("account_members").insert({
        account_id: account.id,
        profile_id: profile.id,
        role: "owner",
        accepted: true,
      });

      return NextResponse.json({ success: true, accountId: account.id });
    }

    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  } catch (error: any) {
    console.error("Error in onboarding:", error);
    return NextResponse.json(
      { error: "Onboarding failed", details: error.message },
      { status: 500 }
    );
  }
}
