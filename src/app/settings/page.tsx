"use client";

import { useUser } from "@clerk/nextjs";
import { useTranslations } from "@/i18n/provider";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { HisaabKitaabLogo } from "@/components/Logo";
import { UserMenu } from "@/components/UserMenu";
import { LanguageToggle } from "@/components/LanguageToggle";
import { Separator } from "@/components/ui/separator";
import { useLanguage } from "@/stores/useLanguage";
import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, Save, UserPlus, Trash2, Users, Crown, Shield, Eye, Loader2 } from "lucide-react";

interface Member {
  id: string;
  role: string;
  accepted: boolean;
  email: string;
  name: string | null;
  avatar: string | null;
  profileId: string | null;
}

export default function SettingsPage() {
  const { user } = useUser();
  const router = useRouter();
  const t = useTranslations();
  const { language, setLanguage } = useLanguage();
  const [emailNotifications, setEmailNotifications] = useState(true);
  const [pushNotifications, setPushNotifications] = useState(true);
  const [weeklyReport, setWeeklyReport] = useState(true);
  const [budgetAlerts, setBudgetAlerts] = useState(true);

  // Family members state
  const [members, setMembers] = useState<Member[]>([]);
  const [accountInfo, setAccountInfo] = useState<{ mode: string; name: string } | null>(null);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState("member");
  const [membersLoading, setMembersLoading] = useState(true);
  const [inviting, setInviting] = useState(false);
  const [removing, setRemoving] = useState<string | null>(null);
  const [memberError, setMemberError] = useState("");
  const [memberSuccess, setMemberSuccess] = useState("");
  const [deletingAccount, setDeletingAccount] = useState(false);

  const fetchMembers = useCallback(async () => {
    try {
      setMembersLoading(true);
      const res = await fetch("/api/members");
      const data = await res.json();
      if (res.ok) {
        setMembers(data.members || []);
        setAccountInfo(data.account || null);
      }
    } catch {
      // silently fail
    } finally {
      setMembersLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchMembers();
  }, [fetchMembers]);

  const handleInvite = async () => {
    if (!inviteEmail.trim()) return;
    setInviting(true);
    setMemberError("");
    setMemberSuccess("");
    try {
      const res = await fetch("/api/members", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: inviteEmail.trim(), role: inviteRole }),
      });
      const data = await res.json();
      if (res.ok) {
        setMemberSuccess(data.autoAccepted
          ? `✅ ${inviteEmail} added and linked to your account!`
          : `✅ ${inviteEmail} saved! Ask them to sign up on HisaabKitaab with this email to get linked.`);
        setInviteEmail("");
        fetchMembers();
      } else {
        setMemberError(data.error || "Failed to invite member");
      }
    } catch {
      setMemberError("Network error, please try again");
    } finally {
      setInviting(false);
    }
  };

  const handleRemove = async (memberId: string) => {
    setRemoving(memberId);
    setMemberError("");
    setMemberSuccess("");
    try {
      const res = await fetch(`/api/members?memberId=${memberId}`, {
        method: "DELETE",
      });
      const data = await res.json();
      if (res.ok) {
        setMemberSuccess("Member removed successfully");
        fetchMembers();
      } else {
        setMemberError(data.error || "Failed to remove member");
      }
    } catch {
      setMemberError("Network error");
    } finally {
      setRemoving(null);
    }
  };

  const getRoleIcon = (role: string) => {
    switch (role) {
      case "owner": return <Crown className="h-3.5 w-3.5 text-amber-500" />;
      case "admin": return <Shield className="h-3.5 w-3.5 text-blue-500" />;
      case "viewer": return <Eye className="h-3.5 w-3.5 text-gray-400" />;
      default: return <Users className="h-3.5 w-3.5 text-emerald-500" />;
    }
  };

  const getRoleBadgeColor = (role: string) => {
    switch (role) {
      case "owner": return "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400";
      case "admin": return "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400";
      case "viewer": return "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400";
      default: return "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400";
    }
  };

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="sticky top-0 z-50 border-b border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="container mx-auto max-w-7xl flex h-14 sm:h-16 items-center justify-between px-4 sm:px-6">
          <div className="flex items-center gap-2 sm:gap-3">
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 sm:h-9 sm:w-9"
              onClick={() => router.push("/dashboard")}
            >
              <ArrowLeft className="h-4 w-4 sm:h-5 sm:w-5" />
            </Button>
            <HisaabKitaabLogo className="h-8 w-8 sm:h-10 sm:w-10" />
            <div className="hidden sm:block">
              <h1 className="text-lg sm:text-xl font-bold text-primary">
                {t("common.appName")}
              </h1>
              <p className="text-xs text-muted-foreground">حساب کتاب</p>
            </div>
          </div>
          <div className="flex items-center gap-2 sm:gap-4">
            <LanguageToggle />
            <UserMenu />
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="container mx-auto max-w-4xl py-6 sm:py-8 px-4 sm:px-6">
        <div className="mb-6 sm:mb-8">
          <h2 className="text-2xl sm:text-3xl font-bold">{t("settings.title")}</h2>
          <p className="text-sm sm:text-base text-muted-foreground mt-1">
            Manage your account preferences and settings
          </p>
        </div>

        <div className="grid gap-4 sm:gap-6">
          {/* Profile Section */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg sm:text-xl">{t("settings.profile")}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-2">
                <Label htmlFor="fullname" className="text-sm">Full Name</Label>
                <Input
                  id="fullname"
                  defaultValue={user?.fullName || ""}
                  placeholder="Your name"
                  disabled
                  className="bg-muted"
                />
                <p className="text-xs text-muted-foreground">
                  Managed by Clerk authentication
                </p>
              </div>
              <div className="grid gap-2">
                <Label htmlFor="email" className="text-sm">Email</Label>
                <Input
                  id="email"
                  defaultValue={user?.primaryEmailAddress?.emailAddress || ""}
                  placeholder="your@email.com"
                  disabled
                  className="bg-muted"
                />
              </div>
            </CardContent>
          </Card>

          {/* Family / Shared Account Members Section */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg sm:text-xl flex items-center gap-2">
                <Users className="h-5 w-5 text-primary" />
                Shared Account &amp; Members
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-5">
              {/* Invite Form */}
              <div className="space-y-3">
                <Label className="text-sm font-medium">Add a Member</Label>
                <p className="text-xs text-muted-foreground">
                  Share your account with family or team members. If they already have a HisaabKitaab account, they&apos;ll be linked instantly. Otherwise, ask them to sign up with that email.
                </p>
                <div className="flex flex-col sm:flex-row gap-2">
                  <Input
                    placeholder="member@email.com"
                    value={inviteEmail}
                    onChange={(e) => setInviteEmail(e.target.value)}
                    className="flex-1"
                    onKeyDown={(e) => e.key === "Enter" && handleInvite()}
                  />
                  <Select value={inviteRole} onValueChange={setInviteRole}>
                    <SelectTrigger className="w-full sm:w-[130px]">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="admin">Admin</SelectItem>
                      <SelectItem value="member">Member</SelectItem>
                      <SelectItem value="viewer">Viewer</SelectItem>
                    </SelectContent>
                  </Select>
                  <Button
                    onClick={handleInvite}
                    disabled={inviting || !inviteEmail.trim()}
                    className="w-full sm:w-auto"
                  >
                    {inviting ? (
                      <Loader2 className="me-2 h-4 w-4 animate-spin" />
                    ) : (
                      <UserPlus className="me-2 h-4 w-4" />
                    )}
                    Add
                  </Button>
                </div>
                {memberError && (
                  <p className="text-xs text-destructive">{memberError}</p>
                )}
                {memberSuccess && (
                  <p className="text-xs text-emerald-600 dark:text-emerald-400">{memberSuccess}</p>
                )}
              </div>

              <Separator />

              {/* Members List */}
              <div className="space-y-3">
                <Label className="text-sm font-medium">Current Members</Label>
                {membersLoading ? (
                  <div className="flex items-center justify-center py-6">
                    <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                  </div>
                ) : members.length === 0 ? (
                  <p className="text-sm text-muted-foreground py-3">
                    No added members yet. Add someone above to share your account.
                  </p>
                ) : (
                  <div className="space-y-2">
                    {members.map((member) => (
                      <div
                        key={member.id}
                        className="flex items-center justify-between p-3 rounded-lg border bg-card"
                      >
                        <div className="flex items-center gap-3 min-w-0 flex-1">
                          {member.avatar ? (
                            <img
                              src={member.avatar}
                              alt=""
                              className="h-8 w-8 rounded-full object-cover flex-shrink-0"
                            />
                          ) : (
                            <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                              <Users className="h-4 w-4 text-primary" />
                            </div>
                          )}
                          <div className="min-w-0 flex-1">
                            <p className="text-sm font-medium truncate">
                              {member.name || member.email || "Unknown"}
                            </p>
                            <p className="text-xs text-muted-foreground truncate">
                              {member.email || ""}
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center gap-2 flex-shrink-0">
                          <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${getRoleBadgeColor(member.role)}`}>
                            {getRoleIcon(member.role)}
                            {member.role}
                          </span>
                          {!member.accepted && (
                            <span className="px-2 py-0.5 rounded-full text-xs bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400" title="Will be linked when they sign up on HisaabKitaab">
                              awaiting signup
                            </span>
                          )}
                          {member.role !== "owner" && (
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7 text-muted-foreground hover:text-destructive"
                              onClick={() => handleRemove(member.id)}
                              disabled={removing === member.id}
                            >
                              {removing === member.id ? (
                                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                              ) : (
                                <Trash2 className="h-3.5 w-3.5" />
                              )}
                            </Button>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Preferences Section */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg sm:text-xl">{t("settings.preferences")}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="grid gap-2">
                <Label htmlFor="language" className="text-sm">{t("settings.language")}</Label>
                <Select
                  value={language}
                  onValueChange={(value: "en" | "ur") => setLanguage(value)}
                >
                  <SelectTrigger id="language" className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="en">English</SelectItem>
                    <SelectItem value="ur">اردو (Urdu)</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <Separator />

              <div className="grid gap-2">
                <Label htmlFor="currency" className="text-sm">{t("settings.currency")}</Label>
                <Select defaultValue="PKR">
                  <SelectTrigger id="currency" className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="PKR">PKR - Pakistani Rupee</SelectItem>
                    <SelectItem value="USD">USD - US Dollar</SelectItem>
                    <SelectItem value="EUR">EUR - Euro</SelectItem>
                    <SelectItem value="GBP">GBP - British Pound</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <Separator />

              <div className="grid gap-2">
                <Label htmlFor="theme" className="text-sm">{t("settings.theme")}</Label>
                <Select defaultValue="system">
                  <SelectTrigger id="theme" className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="light">{t("settings.light")}</SelectItem>
                    <SelectItem value="dark">{t("settings.dark")}</SelectItem>
                    <SelectItem value="system">{t("settings.system")}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </CardContent>
          </Card>

          {/* Notifications Section */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg sm:text-xl">{t("settings.notifications")}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 sm:gap-0">
                <div className="space-y-0.5 flex-1">
                  <Label className="text-sm font-medium">{t("settings.emailNotifications")}</Label>
                  <p className="text-xs sm:text-sm text-muted-foreground">
                    Receive email updates about your account
                  </p>
                </div>
                <Switch
                  checked={emailNotifications}
                  onCheckedChange={setEmailNotifications}
                />
              </div>

              <Separator />

              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 sm:gap-0">
                <div className="space-y-0.5 flex-1">
                  <Label className="text-sm font-medium">{t("settings.pushNotifications")}</Label>
                  <p className="text-xs sm:text-sm text-muted-foreground">
                    Get push notifications in your browser
                  </p>
                </div>
                <Switch
                  checked={pushNotifications}
                  onCheckedChange={setPushNotifications}
                />
              </div>

              <Separator />

              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 sm:gap-0">
                <div className="space-y-0.5 flex-1">
                  <Label className="text-sm font-medium">{t("settings.weeklyReport")}</Label>
                  <p className="text-xs sm:text-sm text-muted-foreground">
                    Weekly summary of your finances
                  </p>
                </div>
                <Switch
                  checked={weeklyReport}
                  onCheckedChange={setWeeklyReport}
                />
              </div>

              <Separator />

              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 sm:gap-0">
                <div className="space-y-0.5 flex-1">
                  <Label className="text-sm font-medium">{t("settings.budgetAlerts")}</Label>
                  <p className="text-xs sm:text-sm text-muted-foreground">
                    Get notified when approaching budget limits
                  </p>
                </div>
                <Switch
                  checked={budgetAlerts}
                  onCheckedChange={setBudgetAlerts}
                />
              </div>
            </CardContent>
          </Card>

          {/* Security Section */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg sm:text-xl">{t("settings.security")}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 sm:gap-0">
                <div className="space-y-0.5 flex-1">
                  <Label className="text-sm font-medium">{t("settings.changePassword")}</Label>
                  <p className="text-xs sm:text-sm text-muted-foreground">
                    Update your password regularly
                  </p>
                </div>
                <Button variant="outline" size="sm">Change</Button>
              </div>

              <Separator />

              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 sm:gap-0">
                <div className="space-y-0.5 flex-1">
                  <Label className="text-sm font-medium">{t("settings.twoFactor")}</Label>
                  <p className="text-xs sm:text-sm text-muted-foreground">
                    Add extra security to your account
                  </p>
                </div>
                <Button variant="outline" size="sm">Enable</Button>
              </div>

              <Separator />

              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 sm:gap-0">
                <div className="space-y-0.5 flex-1">
                  <Label className="text-sm font-medium">{t("settings.sessions")}</Label>
                  <p className="text-xs sm:text-sm text-muted-foreground">
                    Manage your active sessions
                  </p>
                </div>
                <Button variant="outline" size="sm">Manage</Button>
              </div>
            </CardContent>
          </Card>

          {/* Danger Zone */}
          <Card className="border-destructive">
            <CardHeader>
              <CardTitle className="text-lg sm:text-xl text-destructive">
                {t("settings.dangerZone")}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 sm:gap-0">
                <div className="space-y-0.5 flex-1">
                  <Label className="text-sm font-medium text-destructive">
                    {t("settings.deleteAccount")}
                  </Label>
                  <p className="text-xs sm:text-sm text-muted-foreground">
                    {t("settings.confirmDelete")}
                  </p>
                </div>
                <Button
                  variant="destructive"
                  size="sm"
                  disabled={deletingAccount}
                  onClick={async () => {
                    if (!confirm("Are you sure you want to delete your account? This action cannot be undone. All your data will be permanently removed.")) return;
                    if (!confirm("This is your LAST chance. Type OK to confirm you want to DELETE your account forever.")) return;
                    try {
                      setDeletingAccount(true);
                      await user?.delete();
                      router.push("/");
                    } catch (err) {
                      console.error("Failed to delete account:", err);
                      alert("Failed to delete account. Please try again.");
                      setDeletingAccount(false);
                    }
                  }}
                >
                  {deletingAccount ? (
                    <><Loader2 className="me-2 h-4 w-4 animate-spin" />Deleting...</>
                  ) : (
                    "Delete Account"
                  )}
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* Save Button */}
          <div className="flex justify-end gap-3 pt-4">
            <Button
              variant="outline"
              onClick={() => router.push("/dashboard")}
              className="w-full sm:w-auto"
            >
              Cancel
            </Button>
            <Button className="w-full sm:w-auto">
              <Save className="me-2 h-4 w-4" />
              Save Changes
            </Button>
          </div>
        </div>
      </main>
    </div>
  );
}
