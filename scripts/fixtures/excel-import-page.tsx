"use client";
import { useEffect, useRef, useState } from "react";
import ExcelSyncPanel from "@/app/excel-sync-panel";
import { createImportFake, type FakeCall } from "@/scripts/fixtures/travel-import-fake";
export default function ImportFixture() {
  const [ready, setReady] = useState(false);
  useEffect(() => setReady(true), []);
  const [calls, setCalls] = useState<FakeCall[]>([]);
  const [applied, setApplied] = useState(0);
  const fake = useRef<ReturnType<typeof createImportFake> | null>(null);
  if (!fake.current) fake.current = createImportFake(call => setCalls(previous => [...previous, call]));
  return <main data-import-ready={ready ? "true" : "false"}><ExcelSyncPanel people={[]} trips={[]} demo={false} rpcClient={fake.current.client} onClose={() => {}} onApplied={() => setApplied(count => count + 1)} /><pre id="fake-calls">{JSON.stringify(calls)}</pre><output id="fake-applied">{applied}</output></main>;
}
