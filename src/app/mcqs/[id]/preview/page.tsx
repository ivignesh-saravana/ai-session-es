import { McqPreview } from "@/components/mcq-preview";

export default async function Page({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return (
    <div className="flex min-h-svh w-full justify-center p-6 md:p-10">
      <McqPreview questionId={id} />
    </div>
  );
}
