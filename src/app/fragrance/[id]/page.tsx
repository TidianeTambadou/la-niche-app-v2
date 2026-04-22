import { FragranceDetail } from "./FragranceDetail";

export default async function FragrancePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <FragranceDetail fragranceKey={id} />;
}
