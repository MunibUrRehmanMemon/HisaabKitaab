"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useUser } from "@clerk/nextjs";
import { useTranslations } from "@/i18n/provider";
import { HisaabKitaabLogo } from "@/components/Logo";
import { UserMenu } from "@/components/UserMenu";
import { LanguageToggle } from "@/components/LanguageToggle";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  ArrowLeft,
  Phone,
  PhoneCall,
  PhoneOff,
  Clock,
  Calendar,
  Loader2,
  Check,
  X,
  History,
  Sparkles,
  Bot,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useLanguage } from "@/stores/useLanguage";

interface CallRecord {
  id: string;
  phone_number: string;
  member_name: string;
  scheduled_at: string;
  status: string;
  twilio_sid: string | null;
  message_text: string | null;
  created_at: string;
}

export default function CallsPage() {
  const { user } = useUser();
  const router = useRouter();
  const t = useTranslations();
  const { toast } = useToast();
  const { language } = useLanguage();

  const [phoneNumber, setPhoneNumber] = useState("+92");
  const [memberName, setMemberName] = useState("");
  const [scheduleDate, setScheduleDate] = useState("");
  const [scheduleTime, setScheduleTime] = useState("");
  const [isCallNow, setIsCallNow] = useState(false);
  const [isScheduling, setIsScheduling] = useState(false);
  const [callHistory, setCallHistory] = useState<CallRecord[]>([]);
  const [isLoadingHistory, setIsLoadingHistory] = useState(true);
  const [lastCallMessage, setLastCallMessage] = useState<string | null>(null);

  // Load call history on mount
  useEffect(() => {
    fetch("/api/ensure-profile", { method: "POST" }).catch(console.error);
    fetchCallHistory();
  }, []);

  async function fetchCallHistory() {
    try {
      const res = await fetch("/api/make-call", { cache: "no-store" });
      if (res.ok) {
        const data = await res.json();
        setCallHistory(data.calls || []);
      }
    } catch (err) {
      console.error("Error fetching call history:", err);
    } finally {
      setIsLoadingHistory(false);
    }
  }

  async function handleCallNow() {
    if (!phoneNumber || phoneNumber.length < 10) {
      toast({
        title: language === "ur" ? "نمبر درکار ہے" : "Phone number required",
        description: language === "ur" ? "درست فون نمبر درج کریں" : "Enter a valid phone number (+92XXXXXXXXXX)",
        variant: "destructive",
      });
      return;
    }

    setIsCallNow(true);
    setLastCallMessage(null);
    try {
      const res = await fetch("/api/make-call", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          phoneNumber,
          memberName: memberName || undefined,
        }),
      });
      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "Call failed");
      }

      toast({
        title: language === "ur" ? "کال شروع ہو گئی!" : "Call Initiated!",
        description: data.message,
      });

      if (data.urduMessage) {
        setLastCallMessage(data.urduMessage);
      }

      // Refresh history
      fetchCallHistory();
    } catch (err: any) {
      toast({
        title: language === "ur" ? "کال ناکام" : "Call Failed",
        description: err.message,
        variant: "destructive",
      });
    } finally {
      setIsCallNow(false);
    }
  }

  async function handleScheduleCall() {
    if (!phoneNumber || phoneNumber.length < 10) {
      toast({
        title: language === "ur" ? "نمبر درکار ہے" : "Phone number required",
        description: language === "ur" ? "درست فون نمبر درج کریں" : "Enter a valid phone number",
        variant: "destructive",
      });
      return;
    }

    if (!scheduleDate || !scheduleTime) {
      toast({
        title: language === "ur" ? "تاریخ اور وقت درکار ہے" : "Date & time required",
        description: language === "ur" ? "کال کی تاریخ اور وقت منتخب کریں" : "Select the date and time for the call",
        variant: "destructive",
      });
      return;
    }

    // Combine date and time into PKT-aware ISO string
    const scheduledAt = new Date(`${scheduleDate}T${scheduleTime}:00+05:00`).toISOString();

    // Don't allow past dates
    if (new Date(scheduledAt) <= new Date()) {
      toast({
        title: language === "ur" ? "وقت گزر چکا" : "Time has passed",
        description: language === "ur" ? "مستقبل کا وقت منتخب کریں" : "Please select a future date and time",
        variant: "destructive",
      });
      return;
    }

    setIsScheduling(true);
    try {
      const res = await fetch("/api/make-call", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          phoneNumber,
          memberName: memberName || undefined,
          scheduledAt,
        }),
      });
      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "Scheduling failed");
      }

      toast({
        title: language === "ur" ? "کال شیڈول ہو گئی!" : "Call Scheduled!",
        description: data.message,
      });

      // Reset scheduling fields
      setScheduleDate("");
      setScheduleTime("");

      // Refresh history
      fetchCallHistory();
    } catch (err: any) {
      toast({
        title: language === "ur" ? "شیڈول ناکام" : "Schedule Failed",
        description: err.message,
        variant: "destructive",
      });
    } finally {
      setIsScheduling(false);
    }
  }

  function getStatusBadge(status: string) {
    switch (status) {
      case "completed":
        return (
          <span className="inline-flex items-center gap-1 text-[10px] sm:text-xs font-medium text-green-700 bg-green-100 px-2 py-0.5 rounded-full">
            <Check className="h-3 w-3" />
            {language === "ur" ? "مکمل" : "Completed"}
          </span>
        );
      case "pending":
        return (
          <span className="inline-flex items-center gap-1 text-[10px] sm:text-xs font-medium text-amber-700 bg-amber-100 px-2 py-0.5 rounded-full">
            <Clock className="h-3 w-3" />
            {language === "ur" ? "زیر التوا" : "Pending"}
          </span>
        );
      case "failed":
        return (
          <span className="inline-flex items-center gap-1 text-[10px] sm:text-xs font-medium text-red-700 bg-red-100 px-2 py-0.5 rounded-full">
            <X className="h-3 w-3" />
            {language === "ur" ? "ناکام" : "Failed"}
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1 text-[10px] sm:text-xs font-medium text-gray-700 bg-gray-100 px-2 py-0.5 rounded-full">
            {status}
          </span>
        );
    }
  }

  function formatCallDate(dateStr: string) {
    return new Date(dateStr).toLocaleString(language === "ur" ? "ur-PK" : "en-PK", {
      timeZone: "Asia/Karachi",
      dateStyle: "medium",
      timeStyle: "short",
    });
  }

  // Get today's date as min for date picker (in PKT)
  const todayMin = new Date(
    new Date().toLocaleString("en-US", { timeZone: "Asia/Karachi" })
  ).toISOString().split("T")[0];

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="sticky top-0 z-50 border-b border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="container mx-auto max-w-7xl flex h-14 sm:h-16 items-center justify-between px-4 sm:px-6">
          <div className="flex items-center gap-2 sm:gap-3">
            <HisaabKitaabLogo className="h-8 w-8 sm:h-10 sm:w-10" />
            <div>
              <h1 className="text-base sm:text-xl font-bold text-primary">
                {t("common.appName")}
              </h1>
              <p className="text-[10px] sm:text-xs text-muted-foreground">حساب کتاب</p>
            </div>
          </div>
          <div className="flex items-center gap-2 sm:gap-4">
            <LanguageToggle />
            <UserMenu />
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="container mx-auto max-w-4xl px-4 sm:px-6 py-6 sm:py-8">
        {/* Back Button & Title */}
        <div className="mb-6 sm:mb-8 flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => router.push("/dashboard")}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div>
            <h2 className="text-2xl sm:text-3xl font-bold flex items-center gap-2">
              <Phone className="h-6 w-6 sm:h-7 sm:w-7 text-primary" />
              {language === "ur" ? "AI فون کالز" : "AI Phone Calls"}
            </h2>
            <p className="text-sm sm:text-base text-muted-foreground mt-1">
              {language === "ur"
                ? "اردو میں خودکار مالی رپورٹ کال کریں"
                : "Autonomous AI financial report calls in Urdu"}
            </p>
          </div>
        </div>

        {/* Feature Description Card */}
        <Card className="mb-6 border-primary/20 bg-primary/5">
          <CardContent className="p-4 sm:p-6">
            <div className="flex items-start gap-3">
              <Bot className="h-8 w-8 text-primary flex-shrink-0 mt-0.5" />
              <div>
                <h3 className="font-semibold text-primary mb-1">
                  {language === "ur" ? "AI خودکار کال" : "AI-Powered Calls"}
                </h3>
                <p className="text-sm text-muted-foreground">
                  {language === "ur"
                    ? "HisaabKitaab آپ کے مالی ڈیٹا کی بنیاد پر اردو میں ایک AI پیغام تیار کرتا ہے اور فون کال کے ذریعے پہنچاتا ہے۔ آمدنی، اخراجات، بیلنس، اور مالی مشورے شامل ہیں۔"
                    : "HisaabKitaab generates an AI message in Urdu based on your financial data and delivers it via phone call. Includes income, expenses, balance, and financial tips."}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Call Form */}
        <Card className="mb-6">
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <PhoneCall className="h-5 w-5 text-primary" />
              {language === "ur" ? "نئی کال" : "New Call"}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Phone Number */}
            <div>
              <label className="text-sm font-medium mb-1.5 block">
                {language === "ur" ? "فون نمبر" : "Phone Number"}
              </label>
              <Input
                type="tel"
                placeholder="+923001234567"
                value={phoneNumber}
                onChange={(e) => setPhoneNumber(e.target.value)}
                className="text-base"
                dir="ltr"
              />
              <p className="text-xs text-muted-foreground mt-1">
                {language === "ur"
                  ? "پاکستانی نمبر: +92 سے شروع کریں"
                  : "Pakistani number: Start with +92"}
              </p>
            </div>

            {/* Member Name (Optional) */}
            <div>
              <label className="text-sm font-medium mb-1.5 block">
                {language === "ur" ? "نام (اختیاری)" : "Name (Optional)"}
              </label>
              <Input
                type="text"
                placeholder={language === "ur" ? "وصول کنندہ کا نام" : "Recipient's name"}
                value={memberName}
                onChange={(e) => setMemberName(e.target.value)}
                className="text-base"
              />
            </div>

            {/* Call Now Button */}
            <Button
              onClick={handleCallNow}
              disabled={isCallNow || isScheduling}
              className="w-full h-12 sm:h-14 text-base sm:text-lg font-semibold bg-primary hover:bg-primary/90"
            >
              {isCallNow ? (
                <>
                  <Loader2 className="h-5 w-5 animate-spin me-2" />
                  {language === "ur" ? "کال ہو رہی ہے..." : "Calling..."}
                </>
              ) : (
                <>
                  <PhoneCall className="h-5 w-5 me-2" />
                  {language === "ur" ? "ابھی کال کریں" : "Call Now"}
                  <Sparkles className="h-4 w-4 ms-2" />
                </>
              )}
            </Button>

            {/* Divider */}
            <div className="relative py-2">
              <div className="absolute inset-0 flex items-center">
                <span className="w-full border-t border-border" />
              </div>
              <div className="relative flex justify-center text-xs uppercase">
                <span className="bg-background px-2 text-muted-foreground">
                  {language === "ur" ? "یا شیڈول کریں" : "or schedule"}
                </span>
              </div>
            </div>

            {/* Schedule Section */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-sm font-medium mb-1.5 block">
                  {language === "ur" ? "تاریخ" : "Date"}
                </label>
                <Input
                  type="date"
                  value={scheduleDate}
                  onChange={(e) => setScheduleDate(e.target.value)}
                  min={todayMin}
                  className="text-sm"
                  dir="ltr"
                />
              </div>
              <div>
                <label className="text-sm font-medium mb-1.5 block">
                  {language === "ur" ? "وقت" : "Time"}
                </label>
                <Input
                  type="time"
                  value={scheduleTime}
                  onChange={(e) => setScheduleTime(e.target.value)}
                  className="text-sm"
                  dir="ltr"
                />
              </div>
            </div>

            <Button
              variant="outline"
              onClick={handleScheduleCall}
              disabled={isCallNow || isScheduling}
              className="w-full h-10 sm:h-12"
            >
              {isScheduling ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin me-2" />
                  {language === "ur" ? "شیڈول ہو رہا ہے..." : "Scheduling..."}
                </>
              ) : (
                <>
                  <Calendar className="h-4 w-4 me-2" />
                  {language === "ur" ? "کال شیڈول کریں" : "Schedule Call"}
                </>
              )}
            </Button>
          </CardContent>
        </Card>

        {/* Last Call Message Preview */}
        {lastCallMessage && (
          <Card className="mb-6 border-amber-200 bg-amber-50/50">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                <Sparkles className="h-4 w-4 text-amber-500" />
                {language === "ur" ? "AI پیغام (اردو)" : "AI Message (Urdu)"}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm leading-relaxed text-right" dir="rtl">{lastCallMessage}</p>
            </CardContent>
          </Card>
        )}

        {/* Call History */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <History className="h-5 w-5 text-primary" />
              {language === "ur" ? "کال ہسٹری" : "Call History"}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {isLoadingHistory ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : callHistory.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <PhoneOff className="h-10 w-10 mx-auto mb-3 opacity-50" />
                <p className="text-sm">
                  {language === "ur"
                    ? "ابھی تک کوئی کال نہیں کی گئی"
                    : "No calls made yet"}
                </p>
                <p className="text-xs mt-1">
                  {language === "ur"
                    ? "اوپر فون نمبر درج کر کے پہلی کال کریں"
                    : "Enter a phone number above to make your first call"}
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                {callHistory.map((call) => (
                  <div
                    key={call.id}
                    className="flex items-start justify-between p-3 rounded-lg border border-border hover:bg-muted/50 transition-colors"
                  >
                    <div className="flex items-start gap-3 min-w-0 flex-1">
                      <div className={`mt-0.5 p-2 rounded-full ${
                        call.status === "completed" ? "bg-green-100" :
                        call.status === "pending" ? "bg-amber-100" : "bg-red-100"
                      }`}>
                        <Phone className={`h-4 w-4 ${
                          call.status === "completed" ? "text-green-600" :
                          call.status === "pending" ? "text-amber-600" : "text-red-600"
                        }`} />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-medium text-sm">{call.member_name}</span>
                          {getStatusBadge(call.status)}
                        </div>
                        <p className="text-xs text-muted-foreground mt-0.5" dir="ltr">
                          {call.phone_number}
                        </p>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          {formatCallDate(call.scheduled_at || call.created_at)}
                        </p>
                        {call.message_text && (
                          <details className="mt-2">
                            <summary className="text-xs text-primary cursor-pointer hover:underline">
                              {language === "ur" ? "پیغام دیکھیں" : "View message"}
                            </summary>
                            <p className="text-xs mt-1 p-2 bg-muted rounded text-right leading-relaxed" dir="rtl">
                              {call.message_text}
                            </p>
                          </details>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
