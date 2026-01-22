import { Suspense } from "react";
import DashBoard from "@/app/features/main/dashBoardPage/Index";

export default function DashBoardPageRender() {
  return (
    <Suspense fallback={null}>
      <DashBoard />
    </Suspense>
  );
}
