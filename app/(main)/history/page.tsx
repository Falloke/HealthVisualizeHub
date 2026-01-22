import { Suspense } from "react";
import HistoryPage from "@/app/features/main/historyPage/Index";

export default function HistoryPageRender() {
  return (
    <Suspense fallback={null}>
      <HistoryPage />
    </Suspense>
  );
}
