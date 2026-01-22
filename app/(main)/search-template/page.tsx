import { Suspense } from "react";
import SearchTemplate from "@/app/features/main/searchTemplate/Index";

export default function SearchRender() {
  return (
    <Suspense fallback={null}>
      <SearchTemplate />
    </Suspense>
  );
}
