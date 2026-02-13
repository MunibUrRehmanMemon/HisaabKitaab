"use client";

import { useState, useRef } from "react";
import { useUser } from "@clerk/nextjs";
import { useRouter } from "next/navigation";
import { useTranslations } from "@/i18n/provider";
import { HisaabKitaabLogo } from "@/components/Logo";
import { UserMenu } from "@/components/UserMenu";
import { LanguageToggle } from "@/components/LanguageToggle";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ArrowLeft, Camera, Upload, Loader2, Sparkles, Save, CheckCircle2, FileText } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import Image from "next/image";

export default function ScanBillPage() {
  const { user } = useUser();
  const router = useRouter();
  const t = useTranslations();
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  const [isScanning, setIsScanning] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [scanResult, setScanResult] = useState<any>(null);

  const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/jpg", "application/pdf"];
  const ALLOWED_EXTENSIONS = [".jpg", ".jpeg", ".png", ".pdf"];

  const handleImageSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Validate file type
    const fileExt = file.name.toLowerCase().slice(file.name.lastIndexOf("."));
    if (!ALLOWED_TYPES.includes(file.type) && !ALLOWED_EXTENSIONS.includes(fileExt)) {
      toast({
        title: "Unsupported file format",
        description: `Only JPG, PNG, and PDF files are accepted. You uploaded: ${file.type || fileExt || "unknown format"}`,
        variant: "destructive",
      });
      // Reset the input so the same file can be re-selected after fixing
      if (fileInputRef.current) fileInputRef.current.value = "";
      return;
    }

    // Validate file size (max 10MB)
    if (file.size > 10 * 1024 * 1024) {
      toast({
        title: "File too large",
        description: "Please upload a file smaller than 10MB.",
        variant: "destructive",
      });
      if (fileInputRef.current) fileInputRef.current.value = "";
      return;
    }

    const reader = new FileReader();
    reader.onerror = () => {
      toast({
        title: "File read error",
        description: "Could not read the selected file. Please try again.",
        variant: "destructive",
      });
    };
    reader.onloadend = () => {
      setSelectedImage(reader.result as string);
      setScanResult(null);
      setSaved(false);
    };
    reader.readAsDataURL(file);
  };

  const handleScan = async () => {
    if (!selectedImage) return;

    setIsScanning(true);
    setSaved(false);
    try {
      const response = await fetch("/api/scan-bill", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ image: selectedImage }),
      });

      if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        throw new Error(errData.error || "Scan failed");
      }

      const data = await response.json();

      // Check if AI determined this is not a bill
      if (data.is_bill === false) {
        setScanResult(null);
        toast({
          title: "No bill detected",
          description: data.rejection_reason || "The uploaded image does not appear to be a bill, receipt, or invoice. Please upload a valid bill.",
          variant: "destructive",
        });
        return;
      }

      setScanResult(data);

      toast({
        title: "Bill scanned successfully!",
        description: data.amount > 0
          ? `Extracted PKR ${data.amount.toLocaleString("en-PK")} — ${data.description || data.category}`
          : "Review the extracted data below.",
      });
    } catch (error: any) {
      console.error("Error scanning bill:", error);
      toast({
        title: "Scan failed",
        description: error.message || "Could not extract data from the image. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsScanning(false);
    }
  };

  const handleSaveDirectly = async () => {
    if (!scanResult || !scanResult.amount) return;

    setIsSaving(true);
    try {
      // Always use today's date for transaction_date (the user is logging it NOW)
      // The bill's printed date is kept in the description for reference
      const todayDate = new Date().toISOString().split("T")[0];
      const billDateNote = scanResult.date && scanResult.date !== todayDate
        ? ` (Bill dated: ${scanResult.date})`
        : "";

      const response = await fetch("/api/create-transaction", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "expense",
          amount: scanResult.amount,
          category: scanResult.category || "bills",
          description: (scanResult.description || `Scanned bill - ${scanResult.merchant || ""}`) + billDateNote,
          date: todayDate,
          source: "bill_scan",
        }),
      });

      if (!response.ok) throw new Error("Failed to save");

      setSaved(true);
      toast({
        title: "Transaction saved!",
        description: `PKR ${scanResult.amount.toLocaleString("en-PK")} expense recorded.`,
      });
    } catch (error) {
      console.error("Error saving transaction:", error);
      toast({
        title: "Save failed",
        description: "Could not save transaction. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsSaving(false);
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
          <h2 className="text-2xl sm:text-3xl font-bold flex items-center gap-2">
            <Sparkles className="h-6 w-6 sm:h-8 sm:w-8 text-primary" />
            {t("dashboard.scanBill")}
          </h2>
          <p className="text-sm sm:text-base text-muted-foreground mt-1">
            Upload a bill or receipt, and AI will extract the details
          </p>
        </div>

        <div className="grid gap-6 lg:grid-cols-2">
          {/* Upload Section */}
          <Card>
            <CardHeader>
              <CardTitle>Upload Bill/Receipt</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <input
                ref={fileInputRef}
                type="file"
                accept=".jpg,.jpeg,.png,.pdf,image/jpeg,image/png,application/pdf"
                onChange={handleImageSelect}
                className="hidden"
              />

              {!selectedImage ? (
                <div className="border-2 border-dashed border-border rounded-lg p-12 text-center">
                  <Camera className="mx-auto h-12 w-12 text-muted-foreground mb-4" />
                  <p className="text-sm text-muted-foreground mb-2">
                    No image selected
                  </p>
                  <p className="text-xs text-muted-foreground mb-4">
                    Accepted formats: JPG, PNG, PDF
                  </p>
                  <Button onClick={() => fileInputRef.current?.click()}>
                    <Upload className="me-2 h-4 w-4" />
                    Choose Image
                  </Button>
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="relative aspect-video rounded-lg overflow-hidden border border-border">
                    {selectedImage.startsWith("data:application/pdf") ? (
                      <div className="flex flex-col items-center justify-center h-full bg-muted">
                        <FileText className="h-16 w-16 text-primary mb-2" />
                        <p className="text-sm font-medium">PDF Document</p>
                        <p className="text-xs text-muted-foreground">Ready to scan</p>
                      </div>
                    ) : (
                      <Image
                        src={selectedImage}
                        alt="Selected bill"
                        fill
                        className="object-contain"
                      />
                    )}
                  </div>
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      onClick={() => fileInputRef.current?.click()}
                      className="flex-1"
                    >
                      Change Image
                    </Button>
                    <Button
                      onClick={handleScan}
                      disabled={isScanning}
                      className="flex-1"
                    >
                      {isScanning ? (
                        <>
                          <Loader2 className="me-2 h-4 w-4 animate-spin" />
                          Scanning...
                        </>
                      ) : (
                        <>
                          <Sparkles className="me-2 h-4 w-4" />
                          Scan with AI
                        </>
                      )}
                    </Button>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Results Section */}
          <Card>
            <CardHeader>
              <CardTitle>Extracted Data</CardTitle>
            </CardHeader>
            <CardContent>
              {!scanResult ? (
                <div className="flex flex-col items-center justify-center py-12 text-center">
                  <div className="rounded-full bg-primary/10 p-4 mb-4">
                    <Sparkles className="h-8 w-8 text-primary" />
                  </div>
                  <p className="text-sm text-muted-foreground">
                    Upload and scan a bill to see extracted data here
                  </p>
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="grid gap-3">
                    <div className="flex justify-between items-center p-3 bg-accent rounded-lg">
                      <span className="text-sm font-medium">Amount:</span>
                      <span className="text-lg font-bold text-primary">
                        PKR {typeof scanResult.amount === "number" ? scanResult.amount.toLocaleString("en-PK") : scanResult.amount}
                      </span>
                    </div>
                    <div className="flex justify-between items-center p-3 bg-accent rounded-lg">
                      <span className="text-sm font-medium">Category:</span>
                      <span className="font-semibold capitalize">{scanResult.category}</span>
                    </div>
                    <div className="flex justify-between items-center p-3 bg-accent rounded-lg">
                      <span className="text-sm font-medium">Date:</span>
                      <span className="font-semibold">{scanResult.date}</span>
                    </div>
                    {scanResult.merchant && (
                      <div className="flex justify-between items-center p-3 bg-accent rounded-lg">
                        <span className="text-sm font-medium">Merchant:</span>
                        <span className="font-semibold">{scanResult.merchant}</span>
                      </div>
                    )}
                    {scanResult.confidence !== undefined && (
                      <div className="flex justify-between items-center p-3 bg-accent rounded-lg">
                        <span className="text-sm font-medium">Confidence:</span>
                        <div className="flex items-center gap-2">
                          <div className="w-20 h-2 bg-muted rounded-full overflow-hidden">
                            <div
                              className={`h-full rounded-full ${
                                scanResult.confidence >= 0.8
                                  ? "bg-green-500"
                                  : scanResult.confidence >= 0.5
                                  ? "bg-yellow-500"
                                  : "bg-red-500"
                              }`}
                              style={{ width: `${(scanResult.confidence || 0) * 100}%` }}
                            />
                          </div>
                          <span className="text-xs font-semibold">
                            {Math.round((scanResult.confidence || 0) * 100)}%
                          </span>
                        </div>
                      </div>
                    )}
                  </div>

                  {scanResult.description && (
                    <div className="p-3 bg-accent rounded-lg">
                      <span className="text-sm font-medium block mb-2">
                        Description:
                      </span>
                      <p className="text-sm text-muted-foreground">
                        {scanResult.description}
                      </p>
                    </div>
                  )}

                  {scanResult.items && scanResult.items.length > 0 && (
                    <div className="p-3 bg-accent rounded-lg">
                      <span className="text-sm font-medium block mb-2">
                        Items:
                      </span>
                      <ul className="space-y-1">
                        {scanResult.items.map((item: any, index: number) => (
                          <li
                            key={index}
                            className="text-sm flex justify-between"
                          >
                            <span>{item.name}</span>
                            <span className="font-semibold">
                              PKR {typeof item.price === "number" ? item.price.toLocaleString("en-PK") : item.price}
                            </span>
                          </li>
                        ))}
                        {scanResult.items.length > 1 && (
                          <li className="text-sm flex justify-between pt-2 mt-2 border-t border-border font-bold">
                            <span>Total</span>
                            <span className="text-primary">
                              PKR {typeof scanResult.amount === "number" ? scanResult.amount.toLocaleString("en-PK") : scanResult.amount}
                            </span>
                          </li>
                        )}
                      </ul>
                    </div>
                  )}

                  {saved ? (
                    <Button disabled className="w-full bg-green-600 text-white">
                      <CheckCircle2 className="me-2 h-4 w-4" />
                      Saved as Transaction
                    </Button>
                  ) : (
                    <Button
                      onClick={handleSaveDirectly}
                      disabled={isSaving || !scanResult.amount}
                      className="w-full"
                    >
                      {isSaving ? (
                        <>
                          <Loader2 className="me-2 h-4 w-4 animate-spin" />
                          Saving...
                        </>
                      ) : (
                        <>
                          <Save className="me-2 h-4 w-4" />
                          Save as Transaction (PKR {typeof scanResult.amount === "number" ? scanResult.amount.toLocaleString("en-PK") : scanResult.amount})
                        </>
                      )}
                    </Button>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </main>
    </div>
  );
}
