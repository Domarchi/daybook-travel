import assert from "node:assert/strict";
import test from "node:test";
import { cn, TAMANOS_DAYBOOK } from "./utils.ts";

// Los tamaños de @daybook/design se llaman text-meta, text-caption…, igual que
// un color. cn no puede tomarlos por color y borrarlos al lado de text-success.
test("cn conserva el tamaño de la escala Daybook junto a un color de texto", () => {
  for (const tamano of TAMANOS_DAYBOOK) {
    assert.equal(cn(`text-${tamano}`, "text-success"), `text-${tamano} text-success`);
    assert.equal(cn("text-muted", `text-${tamano}`), `text-muted text-${tamano}`);
  }
});

test("cn sigue resolviendo choques: dos tamaños, gana el último", () => {
  assert.equal(cn("text-caption", "text-meta"), "text-meta");
  assert.equal(cn("text-[13px]", "text-body"), "text-body");
});

test("rounded-pill es un radio: choca con otro radio y no con el resto", () => {
  assert.equal(cn("rounded-md", "rounded-pill"), "rounded-pill");
  assert.equal(cn("rounded-pill", "border"), "rounded-pill border");
});
