export default function McqsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-svh w-full justify-center p-6 md:p-10">
      <div className="flex w-full max-w-4xl flex-col gap-6">
        <h1 className="text-2xl font-bold">Multiple choice Questions</h1>
        {children}
      </div>
    </div>
  );
}
