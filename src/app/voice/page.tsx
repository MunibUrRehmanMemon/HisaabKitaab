"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useUser } from "@clerk/nextjs";
import { useRouter } from "next/navigation";
import { useTranslations } from "@/i18n/provider";
import { HisaabKitaabLogo } from "@/components/Logo";
import { UserMenu } from "@/components/UserMenu";
import { LanguageToggle } from "@/components/LanguageToggle";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ArrowLeft, Mic, MicOff, Loader2, Sparkles, Check, X } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useLanguage } from "@/stores/useLanguage";

/** Sanitize transcript: replace ₹ with PKR */
function sanitizeTranscript(text: string): string {
  return text
    .replace(/₹/g, "PKR ")
    .replace(/INR\s*/gi, "PKR ")
    .replace(/\s+/g, " ")
    .trim();
}

interface ExtractedTransaction {
  type: "income" | "expense";
  amount: number;
  category: string;
  description: string;
  confidence: number;
  saved: boolean;
}

export default function VoiceEntryPage() {
  const { user } = useUser();
  const router = useRouter();
  const t = useTranslations();
  const { toast } = useToast();
  const { language } = useLanguage();

  const [isListening, setIsListening] = useState(false);
  const [transcript, setTranscript] = useState("");
  const [isProcessing, setIsProcessing] = useState(false);
  const [extractedTransactions, setExtractedTransactions] = useState<ExtractedTransaction[]>([]);
  const [summary, setSummary] = useState("");
  const recognitionRef = useRef<any>(null);

  useEffect(() => {
    fetch("/api/ensure-profile", { method: "POST" }).catch(console.error);
  }, []);

  useEffect(() => {
    if (typeof window !== "undefined") {
      const SpeechRecognition =
        (window as any).SpeechRecognition ||
        (window as any).webkitSpeechRecognition;

      if (SpeechRecognition) {
        const recognitionInstance = new SpeechRecognition();
        recognitionInstance.continuous = true;
        recognitionInstance.interimResults = true;
        recognitionInstance.lang = language === "ur" ? "ur-PK" : "en-US";

        recognitionInstance.onresult = (event: any) => {
          let finalTranscript = "";
          for (let i = event.resultIndex; i < event.results.length; i++) {
            const transcriptText = event.results[i][0].transcript;
            if (event.results[i].isFinal) {
              finalTranscript += transcriptText + " ";
            }
          }
          if (finalTranscript) {
            setTranscript((prev) => prev + sanitizeTranscript(finalTranscript) + " ");
          }
        };

        recognitionInstance.onerror = (event: any) => {
          console.error("Speech recognition error:", event.error);
          setIsListening(false);
        };

        recognitionInstance.onend = () => {
          setIsListening(false);
        };

        recognitionRef.current = recognitionInstance;
      }
    }
  }, [language]);

  const toggleListening = useCallback(() => {
    const recognition = recognitionRef.current;
    if (!recognition) {
      toast({
        title: "Not Supported",
        description: "Speech recognition is not supported in your browser.",
        variant: "destructive",
      });
      return;
    }

    if (isListening) {
      recognition.stop();
      setIsListening(false);
    } else {
      recognition.start();
      setIsListening(true);
    }
  }, [isListening, toast]);

  const processVoiceInput = async (autoSave: boolean = false) => {
    if (!transcript.trim()) {
      toast({
        title: "No input",
        description: "Please speak something first.",
        variant: "destructive",
      });
      return;
    }

    setIsProcessing(true);
    setExtractedTransactions([]);
    setSummary("");

    try {
      const response = await fetch("/api/process-voice-agentic", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ transcript: sanitizeTranscript(transcript), language, autoSave }),
      });

      if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        throw new Error(errData.error || "Processing failed");
      }

      const data = await response.json();

      const txList: ExtractedTransaction[] = data.transactions || [];
      setExtractedTransactions(txList);
      setSummary(data.summary || "");

      if (data.savedCount > 0) {
        toast({
          title: `${data.savedCount} transaction(s) saved!`,
          description: data.summary || `Saved ${data.savedCount} of ${data.totalCount} transactions`,
        });
        setTimeout(() => clearTranscript(), 3000);
      } else if (txList.length > 0) {
        toast({
          title: `${txList.length} transaction(s) extracted!`,
          description: "Review below and save or edit.",
        });
      }
    } catch (error: any) {
      console.error("Error processing voice:", error);
      toast({
        title: "Processing failed",
        description: error.message || "Could not process voice input. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsProcessing(false);
    }
  };

  const handleSaveTransaction = (tx: ExtractedTransaction) => {
    const params = new URLSearchParams({
      amount: String(tx.amount),
      category: tx.category,
      description: tx.description,
      type: tx.type,
    });
    router.push(`/transactions/new?${params.toString()}`);
  };

  const clearTranscript = () => {
    setTranscript("");
    setExtractedTransactions([]);
    setSummary("");
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
            <Mic className="h-6 w-6 sm:h-8 sm:w-8 text-primary" />
            {t("dashboard.voiceEntry")}
          </h2>
          <p className="text-sm sm:text-base text-muted-foreground mt-1">
            Speak naturally — mention multiple transactions at once!
          </p>
        </div>

        <div className="grid gap-6 lg:grid-cols-2">
          {/* Voice Input Section */}
          <Card>
            <CardHeader>
              <CardTitle>Voice Input</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Microphone Button */}
              <div className="flex flex-col items-center justify-center py-8">
                <Button
                  onClick={toggleListening}
                  size="lg"
                  variant={isListening ? "destructive" : "default"}
                  className={`h-32 w-32 rounded-full ${
                    isListening ? "animate-pulse" : ""
                  }`}
                >
                  {isListening ? (
                    <MicOff className="h-12 w-12" />
                  ) : (
                    <Mic className="h-12 w-12" />
                  )}
                </Button>
                <p className="mt-4 text-sm text-muted-foreground">
                  {isListening ? "Listening..." : "Click to start speaking"}
                </p>
              </div>

              {/* Transcript */}
              {transcript && (
                <div className="p-4 bg-accent rounded-lg min-h-[100px]">
                  <p className="text-sm font-medium mb-2">Transcript:</p>
                  <p className="text-sm">{transcript}</p>
                </div>
              )}

              {/* Action Buttons */}
              <div className="flex flex-col gap-2">
                <div className="flex gap-2">
                  <Button
                    onClick={() => processVoiceInput(true)}
                    disabled={!transcript || isProcessing}
                    className="flex-1 bg-primary"
                  >
                    {isProcessing ? (
                      <>
                        <Loader2 className="me-2 h-4 w-4 animate-spin" />
                        Saving...
                      </>
                    ) : (
                      <>
                        <Sparkles className="me-2 h-4 w-4" />
                        Save All Directly
                      </>
                    )}
                  </Button>
                  <Button
                    onClick={() => processVoiceInput(false)}
                    disabled={!transcript || isProcessing}
                    variant="outline"
                    className="flex-1"
                  >
                    {isProcessing ? "Processing..." : "Preview Only"}
                  </Button>
                </div>
                <Button
                  onClick={clearTranscript}
                  variant="ghost"
                  className="w-full"
                  disabled={!transcript || isProcessing}
                >
                  Clear
                </Button>
              </div>

              {/* Example Phrases */}
              <div className="p-4 bg-accent/50 rounded-lg">
                <p className="text-sm font-medium mb-2">Example phrases:</p>
                <ul className="text-xs space-y-1 text-muted-foreground">
                  <li>&bull; &quot;I spent 500 on petrol, then ate biryani for 100&quot;</li>
                  <li>&bull; &quot;Received 50000 salary and paid 2000 electricity bill&quot;</li>
                  <li>&bull; &quot;آج 500 روپے پیٹرول پر خرچ کیے اور 100 کی بریانی کھائی&quot;</li>
                  <li>&bull; &quot;Mention as many transactions as you want!&quot;</li>
                </ul>
              </div>
            </CardContent>
          </Card>

          {/* Extracted Data Section */}
          <Card>
            <CardHeader>
              <CardTitle>
                Extracted Transactions
                {extractedTransactions.length > 0 && (
                  <span className="ms-2 text-sm font-normal text-muted-foreground">
                    ({extractedTransactions.length} found)
                  </span>
                )}
              </CardTitle>
            </CardHeader>
            <CardContent>
              {extractedTransactions.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 text-center">
                  <div className="rounded-full bg-primary/10 p-4 mb-4">
                    <Sparkles className="h-8 w-8 text-primary" />
                  </div>
                  <p className="text-sm text-muted-foreground">
                    Speak and process your voice to see extracted transactions here
                  </p>
                </div>
              ) : (
                <div className="space-y-3">
                  {summary && (
                    <p className="text-xs text-muted-foreground bg-accent/50 p-2 rounded-lg">
                      {summary}
                    </p>
                  )}
                  {extractedTransactions.map((tx, index) => (
                    <div key={index} className="p-3 bg-accent rounded-lg space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-semibold">
                          {tx.type === "income" ? "💰" : "💸"} {tx.type.toUpperCase()}
                        </span>
                        <span className={`text-lg font-bold ${tx.type === "income" ? "text-green-600" : "text-red-600"}`}>
                          PKR {tx.amount.toLocaleString("en-PK")}
                        </span>
                      </div>
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-muted-foreground">{tx.category}</span>
                        {tx.saved ? (
                          <span className="text-green-600 flex items-center gap-1 text-xs">
                            <Check className="h-3 w-3" /> Saved
                          </span>
                        ) : (
                          <span className="text-amber-600 flex items-center gap-1 text-xs">
                            <X className="h-3 w-3" /> Not saved
                          </span>
                        )}
                      </div>
                      {tx.description && (
                        <p className="text-xs text-muted-foreground">{tx.description}</p>
                      )}
                      <div className="flex items-center gap-2">
                        <div className="flex-1 bg-background rounded-full h-1.5">
                          <div
                            className="bg-primary h-1.5 rounded-full"
                            style={{ width: `${tx.confidence * 100}%` }}
                          />
                        </div>
                        <span className="text-xs text-muted-foreground">
                          {Math.round(tx.confidence * 100)}%
                        </span>
                      </div>
                      {!tx.saved && (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleSaveTransaction(tx)}
                          className="w-full mt-1"
                        >
                          Save as Transaction
                        </Button>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </main>
    </div>
  );
}
