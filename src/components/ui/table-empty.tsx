export function TableEmpty({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center gap-1 py-16 text-center text-sm text-muted-foreground">
      {children}
    </div>
  );
}
