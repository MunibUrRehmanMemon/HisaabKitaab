import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { createServiceClient } from "@/lib/supabase/server";
import { getAccountForUser } from "@/lib/account-helpers";
import { getTodayPKT } from "@/lib/date-utils";

export async function POST(request: NextRequest) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { type, amount, category, description, date, source } = await request.json();

    if (!type || !amount) {
      return NextResponse.json(
        { error: "Type and amount are required" },
        { status: 400 }
      );
    }

    const supabase = createServiceClient();

    const { profile, account, error: setupError } = await getAccountForUser(supabase, userId);

    if (setupError || !profile || !account) {
      return NextResponse.json(
        { error: setupError || "Failed to get or create account" },
        { status: 500 }
      );
    }

    // Look up category_id from default categories
    let categoryId: string | null = null;
    const categoryName = category || "Other";
    const { data: categories } = await supabase
      .from("categories")
      .select("id, name_en")
      .eq("is_default", true);

    if (categories) {
      const match = categories.find(
        (c) =>
          c.name_en.toLowerCase().includes(categoryName.toLowerCase()) ||
          categoryName.toLowerCase().includes(c.name_en.toLowerCase())
      );
      categoryId =
        match?.id ||
        categories.find((c) => c.name_en === "Other")?.id ||
        null;
    }

    // Insert transaction
    const { data: transaction, error: txError } = await supabase
      .from("transactions")
      .insert({
        account_id: account.id,
        type,
        amount: Math.round(parseFloat(amount)),
        category_id: categoryId,
        description_en: description || "",
        transaction_date: date || getTodayPKT(),
        added_by: profile.id,
        source: source || "manual",
      })
      .select("id")
      .single();

    if (txError) {
      console.error("Error creating transaction:", txError);
      return NextResponse.json(
        { error: "Failed to create transaction", details: txError.message },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      transactionId: transaction.id,
    });
  } catch (error: any) {
    console.error("Error creating transaction:", error);
    return NextResponse.json(
      { error: "Failed to create transaction", details: error.message },
      { status: 500 }
    );
  }
}
