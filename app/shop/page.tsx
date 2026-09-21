import { Suspense } from "react";
import { ShopCatalog } from "../components/ShopCatalog";
import { Loader } from "../components/Loader";

export default function KullMartShopPage() {
  return (
    <Suspense fallback={<Loader variant="page" />}>
      <ShopCatalog />
    </Suspense>
  );
}
