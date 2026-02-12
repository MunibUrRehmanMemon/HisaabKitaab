"use client";

import { useState, useRef, useEffect } from "react";
import { useUser } from "@clerk/nextjs";
import { useRouter } from "next/navigation";
import { useTranslations } from "@/i18n/provider";
import { HisaabKitaabLogo } from "@/components/Logo";
import { UserMenu } from "@/components/UserMenu";
import { LanguageToggle } from "@/components/LanguageToggle";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { ArrowLeft, Send, Loader2, Sparkles, User, Bot } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useLanguage } from "@/stores/useLanguage";

interface Message {
  role: "user" | "assistant";
  content: string;
  timestamp: Date;
  toolUsed?: string;
  toolResult?: any;
}

export default function AdvisorPage() {
  const { user } = useUser();
  const router = useRouter();
  const t = useTranslations();
  const { toast } = useToast();
  const { language } = useLanguage();

  const [messages, setMessages] = useState<Message[]>([
    {
      role: "assistant",
      content:
        language === "ur"
          ? "السلام علیکم! میں آپ کا AI مالی مشیر ہوں۔ مجھے آپ کی تمام ٹرانزیکشنز اور فیملی ممبرز کا ڈیٹا دستیاب ہے۔ آپ مجھ سے پوچھ سکتے ہیں کہ سب سے زیادہ خرچ کس چیز پر ہوا، کون زیادہ خرچ کرتا ہے، یا کوئی بھی مالی سوال!"
          : "Hello! I'm your AI financial advisor. I have access to all your transactions, family members, and spending data. Ask me anything — like what you're spending the most on, who spends the most, your last transaction, or any financial question!",
      timestamp: new Date(),
    },
  ]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const suggestedQuestions = language === "ur"
    ? [
        "ہماری فیملی سب سے زیادہ کس چیز پر خرچ کرتی ہے؟",
        "آخری ٹرانزیکشن کیا تھی؟",
        "کون سب سے زیادہ خرچ کرتا ہے؟",
        "ہم کتنی بچت کر رہے ہیں؟",
        "اس مہینے کا مالی خلاصہ دکھاؤ",
        "بجٹ بنانے میں مدد کرو",
      ]
    : [
        "What is our family spending the most on?",
        "What was the last transaction?",
        "Who spends the most in our family?",
        "How much have we saved this month?",
        "Show me our complete financial summary",
        "Help me create a budget plan",
      ];

  const handleSendMessage = async (messageText?: string) => {
    const textToSend = messageText || input.trim();
    if (!textToSend || isLoading) return;

    const userMessage: Message = {
      role: "user",
      content: textToSend,
      timestamp: new Date(),
    };

    setMessages((prev) => [...prev, userMessage]);
    setInput("");
    setIsLoading(true);

    try {
      const response = await fetch("/api/advisor-agentic", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: textToSend,
          language,
          history: messages
            .filter((m, i) => i > 0 && (m.role === "user" || m.role === "assistant")) // Skip bot greeting (index 0)
            .slice(-6),
        }),
      });

      if (!response.ok) throw new Error("Failed to get response");

      const data = await response.json();

      const assistantMessage: Message = {
        role: "assistant",
        content: data.response,
        timestamp: new Date(),
        toolUsed: data.tool_used,
        toolResult: data.tool_result,
      };

      setMessages((prev) => [...prev, assistantMessage]);
      
      // Show success toast if tool was used
      if (data.tool_used) {
        toast({
          title: "Action completed!",
          description: `AI used: ${data.tool_used.replace(/_/g, " ")}`,
        });
      }
    } catch (error) {
      console.error("Error getting advisor response:", error);
      toast({
        title: "Error",
        description: "Failed to get response from advisor. Please try again.",
        variant: "destructive",
      });

      // Add error message
      const errorMessage: Message = {
        role: "assistant",
        content:
          "I apologize, but I'm having trouble responding right now. Please try again.",
        timestamp: new Date(),
      };
      setMessages((prev) => [...prev, errorMessage]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  return (
    <div className="min-h-screen bg-background flex flex-col">
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
      <main className="flex-1 container mx-auto max-w-4xl py-6 px-4 sm:px-6 flex flex-col">
        <div className="mb-4">
          <h2 className="text-2xl sm:text-3xl font-bold flex items-center gap-2">
            <Sparkles className="h-6 w-6 sm:h-8 sm:w-8 text-primary" />
            {t("dashboard.askAdvisor")}
          </h2>
          <p className="text-sm sm:text-base text-muted-foreground mt-1">
            Your AI-powered financial advisor
          </p>
        </div>

        {/* Chat Messages */}
        <Card className="flex-1 mb-4 flex flex-col">
          <CardContent className="flex-1 p-4 overflow-y-auto max-h-[calc(100vh-350px)]">
            <div className="space-y-4">
              {messages.map((message, index) => (
                <div
                  key={index}
                  className={`flex gap-3 ${
                    message.role === "user" ? "justify-end" : "justify-start"
                  }`}
                >
                  {message.role === "assistant" && (
                    <div className="flex-shrink-0 h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center">
                    {message.toolUsed && (
                      <div className="mb-2 pb-2 border-b border-border/50">
                        <p className="text-xs font-semibold flex items-center gap-1">
                          <Sparkles className="h-3 w-3" />
                          Used: {message.toolUsed.replace(/_/g, " ")}
                        </p>
                      </div>
                    )}
                      <Bot className="h-5 w-5 text-primary" />
                    </div>
                  )}
                  <div
                    className={`rounded-lg p-3 max-w-[80%] ${
                      message.role === "user"
                        ? "bg-primary text-primary-foreground"
                        : "bg-accent"
                    }`}
                  >
                    <p className="text-sm whitespace-pre-wrap">
                      {message.content}
                    </p>
                    <p
                      className={`text-xs mt-1 ${
                        message.role === "user"
                          ? "text-primary-foreground/70"
                          : "text-muted-foreground"
                      }`}
                    >
                      {message.timestamp.toLocaleTimeString([], {
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </p>
                  </div>
                  {message.role === "user" && (
                    <div className="flex-shrink-0 h-8 w-8 rounded-full bg-primary flex items-center justify-center">
                      <User className="h-5 w-5 text-primary-foreground" />
                    </div>
                  )}
                </div>
              ))}
              {isLoading && (
                <div className="flex gap-3 justify-start">
                  <div className="flex-shrink-0 h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center">
                    <Bot className="h-5 w-5 text-primary" />
                  </div>
                  <div className="rounded-lg p-3 bg-accent">
                    <Loader2 className="h-5 w-5 animate-spin text-primary" />
                  </div>
                </div>
              )}
              <div ref={messagesEndRef} />
            </div>
          </CardContent>
        </Card>

        {/* Suggested Questions (show only at start) */}
        {messages.length === 1 && (
          <div className="mb-4">
            <p className="text-sm text-muted-foreground mb-2">
              Suggested questions:
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
              {suggestedQuestions.map((question, index) => (
                <Button
                  key={index}
                  variant="outline"
                  size="sm"
                  onClick={() => handleSendMessage(question)}
                  className="justify-start text-left h-auto py-2 px-3"
                >
                  {question}
                </Button>
              ))}
            </div>
          </div>
        )}

        {/* Input Area */}
        <Card>
          <CardContent className="p-4">
            <div className="flex gap-2">
              <Input
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyPress={handleKeyPress}
                placeholder="Ask me anything about personal finance..."
                className="flex-1"
                disabled={isLoading}
              />
              <Button
                onClick={() => handleSendMessage()}
                disabled={!input.trim() || isLoading}
                size="icon"
              >
                <Send className="h-4 w-4" />
              </Button>
            </div>
            <p className="text-xs text-muted-foreground mt-2">
              Press Enter to send • Powered by AI
            </p>
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
