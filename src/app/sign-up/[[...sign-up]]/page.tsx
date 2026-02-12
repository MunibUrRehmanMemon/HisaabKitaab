"use client";

import { SignUp } from "@clerk/nextjs";

export default function SignUpPage() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-primary/10 via-background to-accent/10">
      <div className="w-full max-w-md p-4">
        <SignUp 
          appearance={{
            elements: {
              rootBox: "mx-auto",
              card: "shadow-2xl backdrop-blur-xl bg-white/95 border border-gray-200/50",
              headerTitle: "text-2xl font-bold text-primary",
              headerSubtitle: "text-muted-foreground",
              socialButtonsBlockButton: "border-2 hover:bg-gray-50 transition-all",
              formButtonPrimary: "bg-primary hover:bg-primary/90 text-white shadow-lg hover:shadow-xl transition-all",
              footerActionLink: "text-primary hover:text-primary/80",
              formFieldInput: "border-gray-300 focus:border-primary focus:ring-primary",
              identityPreviewEditButton: "text-primary hover:text-primary/80",
            },
          }}
          routing="path"
          path="/sign-up"
          signInUrl="/sign-in"
        />
      </div>
    </div>
  );
}
