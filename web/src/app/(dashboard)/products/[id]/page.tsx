import { ProductReview } from "@/components/product-review";

export default async function ProductPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <ProductReview id={id} />;
}
