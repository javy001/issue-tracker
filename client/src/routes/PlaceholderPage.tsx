export function PlaceholderPage({ title }: { title: string }) {
  return (
    <div className="flex flex-1 flex-col">
      <header className="flex h-11 items-center border-b px-4 font-medium">{title}</header>
      <div className="p-4 text-muted-foreground">Coming soon.</div>
    </div>
  );
}
