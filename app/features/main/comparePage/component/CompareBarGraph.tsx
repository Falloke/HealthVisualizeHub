"use client";

import CompareProvincePatientsChart from "./CompareProvincePatientsChart";
import CompareProvinceDeathsChart from "./CompareProvinceDeathsChart";
import CompareRegionTop5Chart from "./CompareRegionTop5Chart";
import CompareAgePatientsChart from "./CompareAgePatientsChart";
import CompareAgeDeathsChart from "./CompareAgeDeathsChart";
import CompareGenderPatientsChart from "./CompareGenderPatientsChart";
import CompareGenderDeathsChart from "./CompareGenderDeathsChart";
import CompareGenderTrendChart from "./CompareGenderTrendChart";

export default function CompareBarGraph() {
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <CompareProvincePatientsChart />
        <CompareProvinceDeathsChart />
      </div>

      <CompareRegionTop5Chart />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <CompareAgePatientsChart />
        <CompareAgeDeathsChart />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <CompareGenderPatientsChart />
        <CompareGenderDeathsChart />
      </div>

      <CompareGenderTrendChart />
    </div>
  );
}
