import { BackToMcqPage } from "@/components/mcqs/back-to-mcq-page";
import { McqPreview } from "@/components/mcqs/mcq-preview";

export default async function Page({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  return (
    <div className="flex w-full max-w-xl flex-col gap-4">
      <BackToMcqPage />
      <McqPreview mcqId={id} />
    </div>
  );
}
