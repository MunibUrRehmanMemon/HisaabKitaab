export function HisaabKitaabLogo({ className = "h-8 w-8" }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 200 200"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
    >
      {/* Outer Circle - Teal */}
      <circle cx="100" cy="100" r="95" fill="#0F766E" />
      
      {/* Inner Circle - Lighter Teal */}
      <circle cx="100" cy="100" r="80" fill="#14B8A6" />
      
      {/* Rupee Symbol */}
      <path
        d="M60 70 H100 M60 90 H100 M70 110 L90 140 M80 70 Q90 90 80 110"
        stroke="white"
        strokeWidth="8"
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
      
      {/* Book Pages Effect */}
      <rect x="110" y="60" width="30" height="80" rx="2" fill="white" opacity="0.9" />
      <rect x="115" y="65" width="20" height="3" fill="#0F766E" />
      <rect x="115" y="75" width="20" height="3" fill="#0F766E" />
      <rect x="115" y="85" width="15" height="3" fill="#0F766E" />
      <rect x="115" y="95" width="20" height="3" fill="#F59E0B" />
      <rect x="115" y="105" width="18" height="3" fill="#0F766E" />
      <rect x="115" y="115" width="15" height="3" fill="#0F766E" />
      <rect x="115" y="125" width="20" height="3" fill="#0F766E" />
      
      {/* Accent Circle */}
      <circle cx="60" cy="130" r="8" fill="#F59E0B" />
    </svg>
  );
}

export function HisaabKitaabLogoFull({ className = "" }: { className?: string }) {
  return (
    <div className={`flex items-center gap-3 ${className}`}>
      <HisaabKitaabLogo className="h-10 w-10" />
      <div className="flex flex-col">
        <span className="text-xl font-bold text-primary">HisaabKitaab</span>
        <span className="text-xs text-muted-foreground">حساب کتاب</span>
      </div>
    </div>
  );
}
