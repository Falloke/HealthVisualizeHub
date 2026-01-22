import { Suspense } from "react";
import CompareInfo from "@/app/features/main/comparePage/Index";

export default function ComparePageRender() {
  return (
    <Suspense fallback={null}>
      <CompareInfo />
    </Suspense>
  );
}
