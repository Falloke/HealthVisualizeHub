"use client";

// import GraphPatientsByRegion from "@/app/components/bargraph/GraphPatientsByRegion";
import GraphDeathsByRegion from "@/app/components/bargraph/GraphDeathsByRegion";
import GraphByAgePatients from "@/app/components/bargraph/GraphByAgePatients";
import GraphByAgeDeaths from "@/app/components/bargraph/GraphByAgeDeaths";
import GraphByGenderPatients from "@/app/components/bargraph/GraphByGenderPatients";
import GraphByGenderDeaths from "@/app/components/bargraph/GraphByGenderDeaths";
import GraphProvincePatients from "@/app/components/bargraph/GraphProvinceByPatients";
import GraphProvinceDeaths from "@/app/components/bargraph/GraphProvinceByDeaths";
import GraphByGenderTrend from "@/app/components/linegraph/GraphByGenderTrend";
import GraphRegionTop5 from "@/app/components/bargraph/GraphRegionTop5";

const BarGraph = () => {
  return (
    <div>
      <div className="grid lg:grid-cols-2 grid-cols-1 gap-2 md:gap-4">
        
        <GraphProvincePatients />
        <GraphProvinceDeaths />
        <GraphRegionTop5 />
        {/* <GraphPatientsByRegion /> */}
        <GraphByAgePatients />
        <GraphDeathsByRegion />
        <GraphByAgeDeaths />
        <GraphByGenderPatients />
        <GraphByGenderDeaths />
      </div>
      <GraphByGenderTrend />
    </div>
  );
};

export default BarGraph;
