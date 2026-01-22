import { Suspense } from "react";
import ProvincePage from "@/app/features/main/provincePage/Index";

export default function ProvincPageRender() {
  return (
    <Suspense fallback={null}>
      <ProvincePage />
    </Suspense>
  );
}
