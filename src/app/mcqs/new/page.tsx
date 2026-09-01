import { McqForm } from "@/components/mcqs/mcq-form";

export default function Page() {
  return (
    <div className="w-full max-w-xl">
      <McqForm mode="create" />
    </div>
  );
}
