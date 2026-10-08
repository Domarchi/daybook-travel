import { manejarDemoQwen } from "@/lib/travel-qwen-demo";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  return manejarDemoQwen({ request });
}

export async function GET(request: Request) {
  return manejarDemoQwen({ request });
}
