import { Link } from 'react-router';

export function PlaceholderPage({ title, message }: { title: string; message?: string }) {
  return (
    <div className="flex flex-1 flex-col">
      <header className="flex h-11 items-center border-b px-4">
        <h1 className="m-0 text-[13px] font-medium">{title}</h1>
      </header>
      <div className="flex flex-col items-start gap-2 p-4 text-muted-foreground">
        {message ?? "This page doesn't exist."}
        <Link to="/my-issues" className="text-primary hover:underline">
          Go to My issues
        </Link>
      </div>
    </div>
  );
}
