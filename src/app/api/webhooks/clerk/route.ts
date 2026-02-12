import { headers } from "next/headers";
import { NextResponse } from "next/server";
import { Webhook } from "svix";
import { createServiceClient } from "@/lib/supabase/server";

const webhookSecret = process.env.CLERK_WEBHOOK_SECRET || "";

export async function POST(req: Request) {
  // Get the headers
  const headerPayload = await headers();
  const svix_id = headerPayload.get("svix-id");
  const svix_timestamp = headerPayload.get("svix-timestamp");
  const svix_signature = headerPayload.get("svix-signature");

  // If there are no headers, error out
  if (!svix_id || !svix_timestamp || !svix_signature) {
    return NextResponse.json(
      { error: "Missing svix headers" },
      { status: 400 }
    );
  }

  // Get the body
  const payload = await req.json();
  const body = JSON.stringify(payload);

  // Create a new Svix instance with your secret
  const wh = new Webhook(webhookSecret);

  let evt: any;

  // Verify the payload with the headers
  try {
    evt = wh.verify(body, {
      "svix-id": svix_id,
      "svix-timestamp": svix_timestamp,
      "svix-signature": svix_signature,
    }) as any;
  } catch (err) {
    console.error("Error verifying webhook:", err);
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  }

  // Handle the webhook
  const eventType = evt.type;
  const { id, email_addresses, first_name, last_name, image_url } = evt.data;

  if (eventType === "user.created") {
    // Create user profile in Supabase
    const supabase = createServiceClient();

    const primaryEmail = email_addresses?.[0]?.email_address;

    const { error } = await supabase.from("profiles").insert({
      clerk_user_id: id,
      email: primaryEmail,
      full_name: `${first_name || ""} ${last_name || ""}`.trim() || null,
      avatar_url: image_url || null,
      preferred_language: "en",
    });

    if (error) {
      console.error("Error creating profile:", error);
      return NextResponse.json(
        { error: "Failed to create profile" },
        { status: 500 }
      );
    }

    console.log("User profile created:", id);
  }

  if (eventType === "user.updated") {
    // Update user profile in Supabase
    const supabase = createServiceClient();

    const primaryEmail = email_addresses?.[0]?.email_address;

    const { error } = await supabase
      .from("profiles")
      .update({
        email: primaryEmail,
        full_name: `${first_name || ""} ${last_name || ""}`.trim() || null,
        avatar_url: image_url || null,
      })
      .eq("clerk_user_id", id);

    if (error) {
      console.error("Error updating profile:", error);
    }
  }

  if (eventType === "user.deleted") {
    // Soft delete or handle user deletion
    const supabase = createServiceClient();

    const { error } = await supabase
      .from("profiles")
      .delete()
      .eq("clerk_user_id", id);

    if (error) {
      console.error("Error deleting profile:", error);
    }
  }

  return NextResponse.json({ received: true });
}
