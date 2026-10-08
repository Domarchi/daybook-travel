import { notFound } from "next/navigation";
import { TravelQwenDemo } from "@/components/travel-qwen-demo";
import { demoQwenHabilitado } from "@/lib/travel-qwen-demo";

export const dynamic = "force-dynamic";

export default function QwenDemoPage() {
  if (!demoQwenHabilitado(process.env)) notFound();
  return <TravelQwenDemo />;
}
