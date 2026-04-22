import { GuidedShopSetup } from "./GuidedShopSetup";

export default async function GuidedShopPage({
  params,
}: {
  params: Promise<{ shopId: string }>;
}) {
  const { shopId } = await params;
  return <GuidedShopSetup shopId={shopId} />;
}
